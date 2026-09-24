# Gotchas

Each rule in the skill exists because of one of these.

- **Silent truncation.** DesignSync `get_file` stops at exactly 262,144 bytes with no
  error. Writing that back, or committing it, loses the tail of the file with nothing to
  show for it. `diff` blocks on a file of exactly that size, and on HTML with no closing
  tag.
- **Base64 through the model corrupts binaries.** Re-typing base64 content once corrupted
  4 of 9 zip members in a `.docx`. Binaries come from an export zip or a REST download,
  never from content Claude re-emits.
- **Line-ending conversion makes every file look rewritten.** With `core.autocrlf=true`,
  git turns LF into CRLF on checkout, and the hashes stop matching the manifest.
  `init` pins `design/** -text` in `.gitattributes`, so leave that line in place.
- **A copy that reads as current after it isn't.** A mirror nobody resyncs is worse than
  none, because it looks authoritative. `MANIFEST.json` carries the sync date and
  `SYNC-LOG.md` the history, so anyone can see how old the mirror is. Only a fresh
  `diff` saying "nothing to apply" means it is current.
- **Approving one diff and applying another.** The plan id is a hash of the exact
  snapshot contents and removals. `apply` refuses a mismatched id, so a snapshot that
  changed between review and apply cannot slip through.
- **A partial pull is not evidence of deletion.** A DesignSync pull skips binaries. With
  no `--partial` flag, they would be reported as removed and deleted.
- **Scratch material in the design project.** Design projects accumulate uploads,
  screenshots, archived pages and hash-suffixed duplicates. They are not the design.
  Tune `exclude` once with the user, not per resync.
