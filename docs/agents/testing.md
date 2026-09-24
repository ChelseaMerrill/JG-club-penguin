<!-- atlas-v3:testing:start -->
# Testing and proof of work

This document is the authoritative repository policy for verification commands,
acceptance evidence, and `PASS`, `FAIL`, `BLOCKED`, and `SKIPPED` verdict
semantics.

Run surface: **local + deployed**.

Read this guide while planning acceptance criteria, Definition of Done,
fixtures, and verification. Resolve the applicable commands and evidence rules
into each execution packet; implementation workers execute that packet without
rereading this guide.

## Commands

| Check | Command | Coverage | When | Status |
|---|---|---|---|---|
| typecheck | `npm run typecheck` | TypeScript type correctness (`tsc --noEmit`) | Every change | verified |
| unit | `npm test` | Unit behavior (Vitest, `src/**/*.test.ts`) | Every change | verified |
| lint | `npm run lint` | Static code issues (ESLint + typescript-eslint) | Every change | verified |
| format | `npm run format:check` (fix with `npm run format`) | Code layout (Prettier) | Before lint | verified |
| build | `npm run build` | Production SPA build for Vercel (`tsc --noEmit && vite build` to `dist/`) | Before PR | verified |
| e2e | `npm run test:e2e` | Browser flows (Playwright, chromium); currently the canvas + `#ui` layer smoke only | Before PR | verified |
| run | `npm run dev` | Local game in the browser at http://localhost:5173 | Manual verification | verified |

`verified` means the command ran successfully here. `inferred` means configuration names it but setup did not execute it. `unavailable` is an explicit gap.

## Evidence policy

- Repository-local proof-artifact root: `test-results`. It is gitignored:
  evidence is written there locally and is never committed.
- For UI screenshots and videos, use one directory per test name beneath the
  proof-artifact root. Rerunning a test replaces that test directory.
- Visual/browser behavior: screenshot per test name by default; video only for multiplayer movement/sync or multi-step interactions a still image cannot prove.
- Integration and non-UI behavior: captured test output under `test-results` when an artifact is needed beyond the command result.
- External integration: smoke result against the Vercel deployment.
- Sensitive data: never store Supabase keys or tokens; use test Google accounts and keep real JG emails/avatars out of screenshots.
- Any screenshot, video, test report, captured output, or other artifact cited as
  `PASS` evidence is saved beneath `test-results` locally. The PR states each
  check's command and result; paste output or attach a screenshot to the PR
  when a reviewer needs to see it.
- Screenshot is the default visual proof. Add video only when motion, timing, or
  a multi-step interaction is material and a still image cannot prove it. Do not
  require screenshots or video when the repository has no UI/browser surface.
- A blocked or skipped check records the attempted command and raw failure.
- `BLOCKED`, `SKIPPED`, ambiguity, and worker self-report are never `PASS`.

Run formatting before lint review, avoid unrelated reformatting, and rerun
affected tests after automatic fixes. Give every real integration seam at least
one criterion against the real dependency. Name test accounts, seed data,
confirmation flows, and cleanup. Human-gated criteria name the prerequisite,
human action, expected result, and post-action check. Runnable work must be
startable and exercisable by a fresh context using committed instructions.

Use `PASS` when evidence proves the criterion, `FAIL` when observable behavior is
incorrect, `BLOCKED` when it cannot be observed or exercised, and `SKIPPED` only
for an approved exception with the attempted command and reason. Sanitize every
retained artifact before storage or sharing.
<!-- atlas-v3:testing:end -->
