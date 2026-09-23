<!-- atlas-v3:tooling:start -->
# Repository tooling and plugin capabilities

This document is the authoritative registry of repository capability status and
usage constraints. A listed capability is not blanket permission and never
overrides repository policy, approvals, or guardrails.

Read this guide before work that depends on a cloud provider, infrastructure
tool, language server, browser driver, source host, tracker, or current
third-party library documentation.

| Plugin | Status | Why it applies | Use when | Prerequisites | Install or state |
|---|---|---|---|---|---|
| `playwright` | declined | Browser game with planned e2e tests. | Browser e2e and screenshot evidence. | none | `/plugin install playwright@claude-plugins-official` |
| `context7` | declined | Versioned third-party dependencies (Phaser 3, supabase-js). | Checking version-specific library behavior. | none | `/plugin install context7@claude-plugins-official` |
| `typescript-lsp` | declined | TypeScript stack locked in issue #7. | TypeScript diagnostics while editing. | typescript-language-server | `/plugin install typescript-lsp@claude-plugins-official` |
| `github` | declined | The repository remote is hosted on GitHub; gh CLI already covers it. | Repository, PR, issue, and review operations. | none | `/plugin install github@claude-plugins-official` |

`installed` means setup verified the plugin is enabled and any named binary is
available. `recommended` means the repository signals match but installation
still needs human approval. `declined` and `unavailable` are explicit outcomes,
not permission to pretend the capability exists.

Use Context7 when it is installed and a plan or implementation relies on
version-specific external library or framework behavior. Otherwise consult the
primary official documentation and record the source and version used.

Use language-server plugins during code navigation and editing; they supplement
rather than replace the repository's lint, typecheck, and test commands. Use
browser plugins only when a UI or browser run surface exists. Provider, source-
host, tracker, and browser plugins never override Atlas guardrails, repository
permissions, approval policy, or human-only actions.
<!-- atlas-v3:tooling:end -->
