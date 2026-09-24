# Snapshotting a Figma file

```
H figma-pull --repo <repo> --staging <scratch>
H diff  --repo <repo> --from <scratch>
H apply --repo <repo> --from <scratch> --plan-id <id> --by "<name>"
```

`figma-pull` uses Figma's REST API with `FIGMA_TOKEN` from the environment: a personal
access token with **file content read** scope, made under Figma → Settings → Security.
The user sets it in their own shell. Never ask for it in the chat, and never write it
anywhere.

## What a snapshot contains

```
file.json                          file name, pages, and each page's top-level frames with node ids
pages/<page>/page.json             the page's full node tree (layout, styles, text)
pages/<page>/renders/<frame>__<id>.png   a render of each top-level frame (when render_frames is on)
styles.json, components.json       published styles and components
variables.json                     local variables (tokens), where the plan allows it
```

Fields that change without the design changing (`lastModified`, `version`, thumbnail
URLs) are stripped, so a resync with no design edits reports nothing to apply.

## Settings in `.design-resync.json`

- `figma.pages`: page names to export. Empty means every page. Limit this on large
  files, because a page's node tree can be many MB.
- `figma.render_frames`: whether to render top-level frames. **Renders can differ
  byte-for-byte between runs even when nothing changed**, so a diff may list renders as
  changed while every `page.json` is unchanged. Say so when that happens rather than
  presenting it as a design change. Turn renders off if the noise isn't worth it.
- `figma.render_format` (`png`, `svg`, `jpg`, `pdf`) and `figma.render_scale`.

## Things that fail, and what they mean

- **`variables.json` skipped with `403`:** the local variables endpoint needs a Figma
  Enterprise plan. The rest of the snapshot is fine. If the user needs the tokens and is
  not on Enterprise, read them through the Figma MCP server's `get_variable_defs` and
  save that output as `variables.json` in the scratch directory before `diff`.
- **`403` on the file itself:** the token's owner cannot open the file.
- **`404`:** wrong file key. For a branch, use the branch key, not the main file's.
- **`429`:** rate limited. Wait and re-run; the pull is idempotent.

## No token available

The Figma MCP server (read operations only: `get_metadata`, `get_variable_defs`,
`get_screenshot`) can produce a smaller snapshot by hand. Save `get_metadata` for each
page as `pages/<page>/metadata.xml` and `get_variable_defs` as `variables.json`, then
`diff`. Keep to one method per repository: switching between REST and MCP snapshots
reports every file as changed.
