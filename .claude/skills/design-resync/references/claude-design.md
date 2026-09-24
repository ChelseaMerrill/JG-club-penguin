# Snapshotting a Claude Design project

There are two ways to get a snapshot. Both go into a scratch directory, and `diff` treats
them the same way.

## Preferred: an export zip

Someone with access downloads the project from the claude.ai design UI and saves the zip
anywhere outside the repository. Then:

```
H diff  --repo <repo> --from <export.zip>
H apply --repo <repo> --from <export.zip> --plan-id <id> --by "<name>"
```

The helper strips a single wrapping folder if the zip has one, and it drops anything the
config excludes. An export is the only faithful source for:

- **binaries** (fonts, images, `.docx`), which DesignSync returns as base64, and
- **files over 256 KiB**, which DesignSync truncates.

Ask the user to make one whenever a partial pull reports binaries it kept unverified, or
whenever any file is near the cap.

## Otherwise: a DesignSync pull (partial)

1. `DesignSync list_files` with the project id. Pipe its JSON into
   `H filter --repo <repo> --mark` to get the included paths. `T` means text and `B`
   means binary. **Skip every `B` path**; the pull cannot copy binaries faithfully.
2. For each `T` path, `DesignSync get_file`, then put the content into the scratch
   directory **without re-typing it**:
   - **Large results are saved to a tool-results file** by the harness, with only a
     preview shown. Run
     `H extract --tool-result <that file> --staging <scratch> --path <path>`.
   - **Small results come back inline.** Write them to `<scratch>/<path>` exactly as
     returned. If a file is more than a few KB, prefer to get it into a tool-results
     file rather than re-emitting it.
3. Check each `extract` result's `problems`. A file of exactly 262,144 bytes, or HTML that
   does not end in `</html>`, is truncated. That file needs an export instead.
4. `H diff --repo <repo> --from <scratch> --partial`, and then apply with `--partial` as
   well.

## Access problems

- `403` from `get_project` or `get_file`: this user lacks access; the project owner
  grants it.
- `403` from `/design-consent`: a one-time account step. Run `claude /design-login` in a
  terminal, then retry.
- No `DesignSync` tool in the session: the session has no claude.ai design login. A
  pull cannot run, but an export zip still works.
