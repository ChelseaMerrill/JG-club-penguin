#!/usr/bin/env python3
"""design_resync: keep a repository's design/ folder in step with a live design.

Stdlib only. The helper never talks to Claude Design itself (that happens through the
DesignSync tool, or an export zip made in the design UI); it does talk to Figma's REST
API when asked to, using FIGMA_TOKEN.

Subcommands
  init         write design/.design-resync.json and pin design/ line endings
  filter       read paths on stdin, print the ones the config includes
  extract      pull one get_file result out of a saved tool-result file into a staging dir
  figma-pull   export a Figma file into a staging dir through the REST API
  diff         compare a staging dir or zip against design/MANIFEST.json; prints a plan id
  apply        re-run diff, and apply it only if the plan id matches what was approved

Everything that changes the repository goes through `apply`, and `apply` refuses unless it
is given the plan id `diff` printed for exactly the same inputs, so what lands is what was
reviewed.
"""

from __future__ import annotations

import argparse
import base64
import datetime as _dt
import fnmatch
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

CONFIG_NAME = ".design-resync.json"
MANIFEST_NAME = "MANIFEST.json"
LOG_NAME = "SYNC-LOG.md"
GET_FILE_CAP = 262144  # DesignSync get_file truncates silently at exactly 256 KiB
OWN_FILES = {CONFIG_NAME, MANIFEST_NAME, LOG_NAME}

BINARY_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".otf", ".ttf", ".woff", ".woff2",
    ".pdf", ".docx", ".xlsx", ".pptx", ".zip", ".mp4", ".mov",
}

DEFAULTS = {
    "claude-design": {
        "include": ["**"],
        "exclude": [
            "uploads/**", "screenshots/**", "archive/**", "_x/**",
            ".thumbnail*", "**/.thumbnail*",
            "*standalone*", "**/*standalone*", "*-print-*", "**/*-print-*",
            # hash-suffixed duplicates the design tool leaves behind, e.g. "Foo.dc-a3c6201b.html"
            r"re:.*-[0-9a-f]{8}\.[A-Za-z0-9.]+$",
        ],
    },
    "figma": {"include": ["**"], "exclude": []},
}


# --------------------------------------------------------------------------- helpers

def die(msg: str, code: int = 1) -> None:
    print(f"design_resync: {msg}", file=sys.stderr)
    sys.exit(code)


def design_dir(repo: Path, cfg: dict | None = None) -> Path:
    return repo / (cfg or {}).get("dest", "design")


def load_config(repo: Path) -> dict:
    for cand in (repo / "design" / CONFIG_NAME, *repo.glob(f"*/{CONFIG_NAME}")):
        if cand.is_file():
            cfg = json.loads(cand.read_text(encoding="utf-8"))
            cfg.setdefault("dest", str(cand.parent.relative_to(repo)).replace("\\", "/"))
            return cfg
    die(f"no {CONFIG_NAME} under {repo}. Run `init` first.")
    raise AssertionError


def match(path: str, pattern: str) -> bool:
    if pattern.startswith("re:"):
        return re.search(pattern[3:], path) is not None
    if pattern == "**":
        return True
    if fnmatch.fnmatchcase(path, pattern):
        return True
    # let "dir/**" match "dir/x" at any depth, and "**/x" match "x" at the root
    if pattern.endswith("/**") and (path + "/").startswith(pattern[:-2]):
        return True
    if pattern.startswith("**/") and fnmatch.fnmatchcase(path, pattern[3:]):
        return True
    return False


def included(path: str, cfg: dict) -> bool:
    if PurePosixPath(path).name in OWN_FILES:
        return False
    if not any(match(path, p) for p in cfg.get("include", ["**"])):
        return False
    return not any(match(path, p) for p in cfg.get("exclude", []))


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_binary(path: str, data: bytes | None = None) -> bool:
    if PurePosixPath(path).suffix.lower() in BINARY_EXTS:
        return True
    return data is not None and b"\x00" in data[:8192]


def read_snapshot(src: Path) -> dict[str, bytes]:
    """Return {posix relpath: bytes} for a staging dir or a zip export."""
    files: dict[str, bytes] = {}
    if src.is_file() and zipfile.is_zipfile(src):
        with zipfile.ZipFile(src) as z:
            names = [n for n in z.namelist() if not n.endswith("/")]
            # strip one wrapping folder if every entry sits under it
            tops = {n.split("/", 1)[0] for n in names}
            strip = len(tops) == 1 and all("/" in n for n in names)
            for n in names:
                rel = n.split("/", 1)[1] if strip else n
                if rel.startswith("__MACOSX/"):
                    continue
                files[rel] = z.read(n)
    elif src.is_dir():
        for p in sorted(src.rglob("*")):
            if p.is_file():
                files[p.relative_to(src).as_posix()] = p.read_bytes()
    else:
        die(f"{src} is neither a directory nor a zip file")
    return files


def integrity_problems(path: str, data: bytes) -> list[str]:
    probs = []
    if len(data) == 0:
        probs.append("empty file")
    if len(data) == GET_FILE_CAP:
        probs.append(f"exactly {GET_FILE_CAP} bytes: the get_file cap, so almost certainly truncated")
    if path.lower().endswith(".html") and not is_binary(path, data):
        tail = data.rstrip()[-16:].lower()
        if not tail.endswith(b"</html>"):
            probs.append("HTML does not end with </html>: truncated or incomplete")
    return probs


def load_manifest(ddir: Path) -> dict:
    mp = ddir / MANIFEST_NAME
    if mp.is_file():
        return json.loads(mp.read_text(encoding="utf-8"))
    return {"files": {}}


# --------------------------------------------------------------------------- init

def cmd_init(a: argparse.Namespace) -> None:
    repo = Path(a.repo).resolve()
    ddir = repo / a.dest
    cfgp = ddir / CONFIG_NAME
    if cfgp.exists() and not a.force:
        die(f"{cfgp} already exists (use --force to overwrite)")
    ddir.mkdir(parents=True, exist_ok=True)
    cfg = {
        "tool": a.tool,
        "source": a.source,
        "source_url": a.url or "",
        "dest": a.dest,
        "include": DEFAULTS[a.tool]["include"],
        "exclude": DEFAULTS[a.tool]["exclude"],
    }
    if a.tool == "figma":
        cfg["figma"] = {
            "pages": [],            # page names to export; empty = every page
            "render_frames": True,  # PNG render of each top-level frame
            "render_format": "png",
            "render_scale": 1,
        }
    cfgp.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8", newline="\n")

    # Keep design files byte-exact in git: no CRLF conversion, so hashes stay stable
    # across machines and a resync never shows every file as rewritten.
    ga = repo / ".gitattributes"
    line = f"{a.dest}/** -text"
    existing = ga.read_text(encoding="utf-8") if ga.exists() else ""
    if line not in existing.splitlines():
        with ga.open("a", encoding="utf-8", newline="\n") as fh:
            if existing and not existing.endswith("\n"):
                fh.write("\n")
            fh.write(f"# design/ is mirrored byte-exact from the design tool\n{line}\n")
    print(json.dumps({"config": str(cfgp), "gitattributes": str(ga)}, indent=2))


# --------------------------------------------------------------------------- filter

def cmd_filter(a: argparse.Namespace) -> None:
    cfg = load_config(Path(a.repo).resolve())
    raw = sys.stdin.read().strip()
    paths: list[str]
    try:
        obj = json.loads(raw)
        paths = obj["paths"] if isinstance(obj, dict) else list(obj)
    except (json.JSONDecodeError, KeyError, TypeError):
        paths = [l.strip() for l in raw.splitlines() if l.strip()]
    for p in paths:
        # list_files returns directories too; a path with no suffix and children is a dir
        if any(q.startswith(p + "/") for q in paths):
            continue
        if included(p, cfg):
            print(("B " if is_binary(p) else "T ") + p if a.mark else p)


# --------------------------------------------------------------------------- extract

def _find_file_payload(obj):
    if isinstance(obj, dict):
        if "content" in obj and isinstance(obj["content"], str):
            return obj
        for v in obj.values():
            r = _find_file_payload(v)
            if r:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _find_file_payload(v)
            if r:
                return r
    elif isinstance(obj, str):
        s = obj.strip()
        if s.startswith("{") or s.startswith("["):
            try:
                return _find_file_payload(json.loads(s))
            except json.JSONDecodeError:
                return None
    return None


def cmd_extract(a: argparse.Namespace) -> None:
    raw = Path(a.tool_result).read_text(encoding="utf-8")
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        obj = raw
    payload = _find_file_payload(obj)
    if not payload:
        die(f"no get_file content found in {a.tool_result}")
    content = payload["content"]
    if payload.get("isBase64") or payload.get("encoding") == "base64":
        data = base64.b64decode(content)
    else:
        data = content.encode("utf-8")
    path = a.path or payload.get("path")
    if not path:
        die("the tool result names no path; pass --path")
    out = Path(a.staging) / path
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    probs = integrity_problems(path, data)
    if payload.get("truncated"):
        probs.insert(0, "get_file reported truncated: true")
    print(json.dumps({"path": path, "bytes": len(data), "problems": probs}))


# --------------------------------------------------------------------------- figma

def _figma_get(url: str, token: str) -> bytes:
    req = urllib.request.Request(url, headers={"X-Figma-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code} {e.reason} for {url.split('?')[0]}") from None


VOLATILE = {"lastModified", "thumbnailUrl", "version", "editorType", "linkAccess", "role"}


def _strip_volatile(obj):
    if isinstance(obj, dict):
        return {k: _strip_volatile(v) for k, v in obj.items() if k not in VOLATILE}
    if isinstance(obj, list):
        return [_strip_volatile(v) for v in obj]
    return obj


def _safe(name: str) -> str:
    return re.sub(r"[^\w.\- ]+", "_", name).strip() or "untitled"


def cmd_figma_pull(a: argparse.Namespace) -> None:
    repo = Path(a.repo).resolve()
    cfg = load_config(repo)
    if cfg.get("tool") != "figma":
        die("this repository's config is not a Figma config")
    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        die("set FIGMA_TOKEN to a Figma personal access token with file read scope")
    fcfg = cfg.get("figma", {})
    key = cfg["source"]
    base = "https://api.figma.com/v1"
    out = Path(a.staging)
    out.mkdir(parents=True, exist_ok=True)

    doc = json.loads(_figma_get(f"{base}/files/{key}?geometry=paths", token))
    pages = [p for p in doc["document"].get("children", []) if p.get("type") == "CANVAS"]
    wanted = set(fcfg.get("pages") or [])
    if wanted:
        pages = [p for p in pages if p["name"] in wanted]
        missing = wanted - {p["name"] for p in pages}
        if missing:
            die(f"pages not found in the file: {sorted(missing)}")

    meta = {"name": doc.get("name"), "file_key": key, "pages": []}
    for p in pages:
        pdir = _safe(p["name"])
        (out / "pages" / pdir).mkdir(parents=True, exist_ok=True)
        (out / "pages" / pdir / "page.json").write_text(
            json.dumps(_strip_volatile(p), indent=1, sort_keys=True) + "\n",
            encoding="utf-8", newline="\n")
        frames = [c for c in p.get("children", []) if c.get("type") in {"FRAME", "SECTION", "COMPONENT", "COMPONENT_SET"}]
        meta["pages"].append({"name": p["name"], "id": p["id"],
                              "frames": [{"name": f["name"], "id": f["id"]} for f in frames]})
        if fcfg.get("render_frames", True) and frames:
            fmt = fcfg.get("render_format", "png")
            ids = ",".join(f["id"] for f in frames)
            q = urllib.parse.urlencode({"ids": ids, "format": fmt, "scale": fcfg.get("render_scale", 1)})
            imgs = json.loads(_figma_get(f"{base}/images/{key}?{q}", token)).get("images", {})
            for f in frames:
                url = imgs.get(f["id"])
                if not url:
                    continue
                name = f"{_safe(f['name'])}__{f['id'].replace(':', '-')}.{fmt}"
                (out / "pages" / pdir / "renders").mkdir(parents=True, exist_ok=True)
                with urllib.request.urlopen(url, timeout=120) as r:
                    (out / "pages" / pdir / "renders" / name).write_bytes(r.read())

    for label, path in (("styles", "styles"), ("components", "components"),
                        ("variables", "variables/local")):
        try:
            data = json.loads(_figma_get(f"{base}/files/{key}/{path}", token))
            (out / f"{label}.json").write_text(
                json.dumps(_strip_volatile(data), indent=1, sort_keys=True) + "\n",
                encoding="utf-8", newline="\n")
        except RuntimeError as e:
            meta.setdefault("skipped", []).append(f"{label}: {e}")
    (out / "file.json").write_text(json.dumps(meta, indent=1, sort_keys=True) + "\n",
                                   encoding="utf-8", newline="\n")
    print(json.dumps({"staging": str(out), "pages": len(pages),
                      "skipped": meta.get("skipped", [])}, indent=2))


# --------------------------------------------------------------------------- diff / apply

def build_plan(repo: Path, src: Path, partial: bool) -> dict:
    cfg = load_config(repo)
    ddir = design_dir(repo, cfg)
    snap = {p: d for p, d in read_snapshot(src).items() if included(p, cfg)}
    old = load_manifest(ddir).get("files", {})

    added, changed, unchanged, removed, kept, problems = [], [], [], [], [], {}
    for p, d in sorted(snap.items()):
        probs = integrity_problems(p, d)
        if probs:
            problems[p] = probs
        h = sha256(d)
        if p not in old:
            added.append(p)
        elif old[p]["sha256"] != h:
            changed.append(p)
        else:
            unchanged.append(p)
    for p in sorted(set(old) - set(snap)):
        # A partial pull (DesignSync, which cannot fetch binaries faithfully) leaves
        # binaries out; that is not evidence they were deleted from the design.
        if partial and is_binary(p):
            kept.append(p)
        else:
            removed.append(p)

    fingerprint = hashlib.sha256()
    for p in sorted(snap):
        fingerprint.update(f"{p}\0{sha256(snap[p])}\n".encode())
    fingerprint.update(("removed:" + ",".join(removed)).encode())
    return {
        "repo": str(repo), "dest": str(ddir.relative_to(repo)).replace("\\", "/"),
        "source": str(src), "tool": cfg.get("tool"), "design": cfg.get("source"),
        "partial": partial,
        "added": added, "changed": changed, "removed": removed,
        "unchanged": len(unchanged), "kept_unverified": kept,
        "problems": problems,
        "plan_id": fingerprint.hexdigest()[:12],
        "_snap": snap,
    }


def print_plan(plan: dict, as_json: bool) -> None:
    public = {k: v for k, v in plan.items() if not k.startswith("_")}
    if as_json:
        print(json.dumps(public, indent=2))
        return
    print(f"Design resync plan {plan['plan_id']}  ({plan['tool']}: {plan['design']})")
    print(f"  into {plan['dest']}/ from {plan['source']}{'  [partial pull]' if plan['partial'] else ''}")
    for label in ("added", "changed", "removed"):
        items = plan[label]
        print(f"  {label:9} {len(items)}")
        for p in items:
            print(f"      {p}")
    print(f"  unchanged {plan['unchanged']}")
    if plan["kept_unverified"]:
        print(f"  kept, not re-verified (binaries a partial pull cannot fetch) {len(plan['kept_unverified'])}")
        for p in plan["kept_unverified"]:
            print(f"      {p}")
    if plan["problems"]:
        print("  BLOCKING problems (apply will refuse):")
        for p, probs in plan["problems"].items():
            for pr in probs:
                print(f"      {p}: {pr}")
    if not (plan["added"] or plan["changed"] or plan["removed"]):
        print("  Nothing to apply: design/ already matches this snapshot.")


def cmd_diff(a: argparse.Namespace) -> None:
    plan = build_plan(Path(a.repo).resolve(), Path(a.source), a.partial)
    print_plan(plan, a.json)


def cmd_apply(a: argparse.Namespace) -> None:
    repo = Path(a.repo).resolve()
    plan = build_plan(repo, Path(a.source), a.partial)
    if a.plan_id != plan["plan_id"]:
        die(f"plan id mismatch: approved {a.plan_id}, current {plan['plan_id']}. "
            "The inputs changed since the diff was reviewed; run diff again.")
    if plan["problems"]:
        die("the snapshot has integrity problems; see diff output. Nothing applied.")
    if not (plan["added"] or plan["changed"] or plan["removed"]):
        print("Nothing to apply.")
        return
    cfg = load_config(repo)
    ddir = design_dir(repo, cfg)
    snap = plan["_snap"]
    for p in plan["added"] + plan["changed"]:
        dest = ddir / p
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(snap[p])
    for p in plan["removed"]:
        target = ddir / p
        if target.is_file():
            target.unlink()
        parent = target.parent
        while parent != ddir and parent.is_dir() and not any(parent.iterdir()):
            parent.rmdir()
            parent = parent.parent

    old = load_manifest(ddir).get("files", {})
    files = {p: {"sha256": sha256(d), "bytes": len(d)} for p, d in snap.items()}
    for p in plan["kept_unverified"]:
        files[p] = dict(old[p], unverified_since=old[p].get("unverified_since") or _today())
    manifest = {
        "tool": cfg.get("tool"), "source": cfg.get("source"),
        "source_url": cfg.get("source_url", ""),
        "synced": _today(), "synced_by": a.by or "", "snapshot": a.label or Path(a.source).name,
        "plan_id": plan["plan_id"],
        "files": dict(sorted(files.items())),
    }
    (ddir / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2) + "\n",
                                     encoding="utf-8", newline="\n")
    entry = [f"## {_today()} · plan {plan['plan_id']}", ""]
    entry.append(f"From {manifest['snapshot']}" + (f" by {a.by}" if a.by else "") +
                 (" (partial pull; binaries not re-verified)" if plan["partial"] else "") + ".")
    if a.note:
        entry += ["", a.note]
    entry.append("")
    for label in ("added", "changed", "removed"):
        for p in plan[label]:
            entry.append(f"- {label}: `{p}`")
    logp = ddir / LOG_NAME
    head = "# Design sync log\n\nNewest first. Written by design_resync.py apply.\n\n"
    prior = logp.read_text(encoding="utf-8") if logp.exists() else head
    body = prior[len(head):] if prior.startswith(head) else prior
    logp.write_text(head + "\n".join(entry) + "\n\n" + body, encoding="utf-8", newline="\n")
    print(json.dumps({"applied": plan["plan_id"], "added": len(plan["added"]),
                      "changed": len(plan["changed"]), "removed": len(plan["removed"]),
                      "manifest": str(ddir / MANIFEST_NAME), "log": str(logp)}, indent=2))


def _today() -> str:
    return _dt.date.today().isoformat()


# --------------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("init")
    s.add_argument("--repo", required=True)
    s.add_argument("--tool", required=True, choices=sorted(DEFAULTS))
    s.add_argument("--source", required=True, help="Claude Design project id, or Figma file key")
    s.add_argument("--url", help="the design link, for the record")
    s.add_argument("--dest", default="design")
    s.add_argument("--force", action="store_true")
    s.set_defaults(fn=cmd_init)

    s = sub.add_parser("filter")
    s.add_argument("--repo", required=True)
    s.add_argument("--mark", action="store_true", help="prefix T/B for text/binary")
    s.set_defaults(fn=cmd_filter)

    s = sub.add_parser("extract")
    s.add_argument("--tool-result", required=True)
    s.add_argument("--staging", required=True)
    s.add_argument("--path")
    s.set_defaults(fn=cmd_extract)

    s = sub.add_parser("figma-pull")
    s.add_argument("--repo", required=True)
    s.add_argument("--staging", required=True)
    s.set_defaults(fn=cmd_figma_pull)

    for name, fn in (("diff", cmd_diff), ("apply", cmd_apply)):
        s = sub.add_parser(name)
        s.add_argument("--repo", required=True)
        s.add_argument("--from", dest="source", required=True, help="staging dir or export zip")
        s.add_argument("--partial", action="store_true",
                       help="snapshot omits binaries (a DesignSync pull); keep them rather than delete")
        if name == "diff":
            s.add_argument("--json", action="store_true")
        else:
            s.add_argument("--plan-id", required=True, help="the id diff printed and the user approved")
            s.add_argument("--by", help="who ran the sync")
            s.add_argument("--label", help="how to name the snapshot in the log")
            s.add_argument("--note", help="one line for the sync log")
        s.set_defaults(fn=fn)

    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
