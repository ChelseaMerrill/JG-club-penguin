# JG Club Penguin

A Jahnel Group hackathon project: a multiplayer social game inspired by the classic *Club Penguin*, set in the JG universe.

## Concept

Players create and customize their own penguin, just like in the original Club Penguin. But instead of a snowy island, the world is **JG headquarters**. Players explore the office, meet other players, and team up with JG characters to complete tasks.

## Core Features

- **Penguin creation:** design and customize your own penguin avatar.
- **JG headquarters world:** explore rooms and areas based on the real JG office.
- **JG characters:** in-game characters from the JG universe who give out tasks and interact with players.
- **Tasks and quests:** finish challenges handed out by JG characters.
- **Multiplayer:** see, chat with, and interact with other players in real time.

## Tech Stack

Locked in issue #7:

- **Game:** Phaser 3 with Vite and TypeScript (no React wrapper)
- **Realtime and auth:** Supabase Realtime and Supabase Auth (Google OAuth)
- **Hosting:** Vercel static hosting
- **Tooling:** ESLint, Prettier, Vitest, Playwright, GitHub Actions CI

## Project Status

🚧 **Google sign-in, the login screen and the Vercel deploy exist.** The Phaser scene has a DOM overlay layer (`#ui`) that shows the login screen signed out and a Player badge signed in, backed by Supabase Auth (Google OAuth), and the app is deployed to Vercel.

## Getting Started

Requires Node 22.12 or newer (see `.nvmrc`).

```sh
nvm use
npm ci
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the app refuses to boot without them)
npm run dev            # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck and build the production bundle to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Typecheck browser code (`tsconfig.json`) and Node tooling/e2e (`tsconfig.node.json`) |
| `npm run lint` | Run ESLint |
| `npm run format` / `format:check` | Format with Prettier / check formatting |
| `npm test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright browser tests (first run: `npx playwright install chromium`) |

CI runs typecheck, lint, format check, unit tests, and build on every pull request. A pull request that changes `supabase/migrations/**` or `supabase/tests/**` also runs the Supabase proof gate (see [Database migrations and production deploys](#database-migrations-and-production-deploys)).

## Supabase and Vercel setup

The client reads two env vars, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`). Only the Supabase anon (public) key ever goes to the client; never put the service-role key in `.env` or in Vercel.

A human needs to do the following once, outside the app:

1. **Apply the migrations.** The deploy pipeline does this; see [Database migrations and production deploys](#database-migrations-and-production-deploys). Do the one-time baseline there before the first deploy.
2. **Set the Vercel env vars.** In the Vercel project settings, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for both the Production and Preview environments.
3. **Configure Supabase Auth → URL Configuration → Redirect URLs.** Add `http://localhost:5173/` (dev) and `http://localhost:4173/` (preview build), plus the Vercel production URL and any preview URLs used for the deployed smoke test, each with a trailing slash.
4. **Set the Site URL.** In the same URL Configuration screen, set **Site URL** to the production URL.
5. **Disable the Email provider.** In Supabase Dashboard → Authentication → Providers, turn off Email so Google is the only sign-in path. Confirm **Phone** and **Anonymous** sign-ins are also off.
6. **Confirm the Google OAuth consent screen's audience** allows every demo attendee's Google account (an internal Workspace audience, or "External / In production", not a short test-user list).

> **Google Cloud redirect URI.** The only authorized redirect URI in the Google Cloud OAuth client is the Supabase callback, `https://<project-ref>.supabase.co/auth/v1/callback` — never the Vercel URL. The Vercel URL only ever goes into Supabase's Redirect URLs (step 3) and Site URL (step 4) above.

### Running the deployed e2e specs

`e2e/deployed-auth.spec.ts` and `e2e/deployed-progress.spec.ts` run against a live deployment instead of the local preview build; both `test.skip()` themselves unless `DEPLOY_URL` and `AUTH_STATE` are set. `DEPLOY_URL` is the deployed URL (added to Supabase's Redirect URLs above); `AUTH_STATE` is a path to Playwright storage state saved from signing in there with a test Google account, captured with `npx playwright codegen --save-storage=<path> <DEPLOY_URL>` (sign in, then close the browser). That file contains a live Supabase refresh token, so save it **outside the repo** and never commit it, e.g. `AUTH_STATE=$HOME/jg-auth/auth.json`. `deployed-auth.spec.ts` also requires `FIXTURE_PLAYER_ID`: it throws at module load, before any test runs, if `DEPLOY_URL`/`AUTH_STATE` are set but `FIXTURE_PLAYER_ID` isn't — so run these specs one file at a time rather than as a whole directory. `deployed-progress.spec.ts` additionally writes real progress (look, a Minigame round, a purchase, an Igloo slot) to that test account through the real `ProgressStore` with no cleanup afterward, so use a dedicated test account that's fine to have its saved progress permanently overwritten. Example: `DEPLOY_URL=https://your-preview.vercel.app AUTH_STATE=$HOME/jg-auth/auth.json npx playwright test e2e/deployed-progress.spec.ts`. `e2e/deployed-leaderboard.spec.ts` follows the same `DEPLOY_URL`/`AUTH_STATE` skip pattern and is read-only (it calls `public.leaderboard` through the real `ProgressStore` and asserts its shape only, never a screenshot of real names).

### Running the two-browser e2e specs

The specs in Playwright's `realtime-shared-users` project (`playwright.config.ts`: `e2e/presence-two-browsers.spec.ts`, `e2e/chat-two-browsers.spec.ts`, `e2e/movement-sync.spec.ts`, `e2e/penguin-load-retry.spec.ts` and `e2e/own-penguin-sign-in.spec.ts`) sign in the shared Supabase project's two test users, A and B (`E2E_USER_A_EMAIL`/`_PASSWORD`, `E2E_USER_B_EMAIL`/`_PASSWORD` in `.env.test.local`, or `AUTH_STATE_A`/`AUTH_STATE_B` storage-state files). They run against the **real shared Supabase project** (#81), so other Players are expected to be in a Room at the same time — these specs must never check a roster's total count, only specific test-user Player ids. Only one run at a time, across all developers and agents, may use this pair of test users. That project is single-worker, so the specs never race each other within one `npm run test:e2e` run; across runs, `presence-two-browsers` and `chat-two-browsers` call a best-effort pre-flight guard (`e2e/support/presence-guard.ts`) before opening any browser context, which fails fast if a test user is still in Town Center from another run.

## Database migrations and production deploys

Decision record: [ADR 0001](docs/adr/0001-supabase-migration-pipeline.md) (#249).

### How migrations are applied

The Supabase CLI applies them, pinned at 2.121.0 and run as `npx supabase@2.121.0 <cmd>` (no global install). Applied state is tracked in `supabase_migrations.schema_migrations`. Migrations are forward-only: fix a bad one with a new migration. Keep them additive (expand, then contract) so the previous client keeps working while the new one rolls out. `supabase/config.toml` is committed; `supabase/.temp/` is gitignored.

### Add a migration

1. `npx supabase@2.121.0 migration new <name>`
2. Start the file with a header that says what it is for, any deploy-order note, and its proof file (`supabase/tests/<name>_proof.sql`).
3. Do not add the old "Apply by pasting into the Supabase SQL editor (no CLI)" line. Existing files keep theirs because they are already applied, and a tracked runner never re-applies them.

### Prove it locally

Needs Docker and `psql`.

```sh
npx supabase@2.121.0 start
npx supabase@2.121.0 db reset
bash supabase/tests/run-proofs.sh
npx supabase@2.121.0 stop --no-backup
```

`db reset` replays every migration from scratch. `run-proofs.sh` seeds the fixture Player `00000000-0000-0000-0000-00000000f1f0`, runs every `supabase/tests/*_proof.sql`, and fails on any error or any `pass` that is not true. `DATABASE_URL` defaults to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

### PR gate

The `supabase-proofs` job in `ci.yml` always runs, so it can be a required check. Its steps run only when the PR changes `supabase/migrations/**` or `supabase/tests/**`; otherwise it passes with the steps skipped. When it runs it does `supabase start`, `supabase db reset`, then `bash supabase/tests/run-proofs.sh`. Output goes to `test-results/supabase-proofs/output.txt` (gitignored).

### Deploy pipeline

The Deploy workflow (`.github/workflows/deploy.yml`) runs on every push to `main`. Deploys queue (concurrency group `deploy-prod`, no cancel-in-progress). Jobs:

1. `changes`: finds whether migrations changed and which `supabase/functions/<name>` folders changed.
2. `migrate`: runs only if a migration changed. Waits for approval on the `production` environment, then `supabase link`, the baseline guard, and `supabase db push`.
3. `functions`: deploys only the changed function folders. Also uses the `production` environment (it reads the same secrets), so it needs approval too.
4. `vercel`: always runs after `migrate` and `functions` succeed or are skipped. `vercel pull --environment=production`, `vercel build --prod`, `vercel deploy --prebuilt --prod` (Vercel CLI 65.1.0).

A failed or rejected `migrate` blocks `functions` and `vercel`. The baseline guard fails `migrate` before `db push` unless `supabase migration list --linked` shows `20260924000000` applied remotely, so the first deploy is blocked until the one-time baseline below is done.

**Approval.** One required reviewer, and you may approve your own deploy. The step confirms the deploy was intended; it is not a two-person control.

**Manual triggers.** Actions → Deploy → Run workflow:

- `run_migrations`: run `migrate` even if no migration changed.
- `force_functions`: deploy every function, not just the changed ones.

### One-time setup (repo admin)

1. Settings → Environments → **Production** (the Vercel-created environment; names are case-insensitive, so `environment: production` uses it). Set required reviewers to 1, turn "Prevent self-review" off, and limit deployment branches to selected branches: `main` only.
2. Add these **environment secrets** on Production:
   - `SUPABASE_ACCESS_TOKEN`: issued from a personal Supabase account and shared with the team. Rotate it if anyone with access leaves.
   - `SUPABASE_DB_PASSWORD`
   - `SUPABASE_PROJECT_ID`
3. Add these **repo secrets** (repo level, so the ungated `vercel` job can read them; any workflow in this repo can read them):
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`

   The two ids come from `vercel link` (`.vercel/project.json`) or the Vercel project settings.
4. `vercel.json` sets `git.deploymentEnabled.main: false`. PR previews stay automatic; production deploys only through the Deploy workflow.

Never commit tokens, the DB password, or real Player ids or emails.

### One-time baseline

Do this once, before the first deploy. It marks the 19 existing migrations as applied on production without running them.

1. `npx supabase@2.121.0 login` with the shared token, then `npx supabase@2.121.0 link --project-ref <project-ref>`.
2. `npx supabase@2.121.0 start && npx supabase@2.121.0 db reset`
3. `npx supabase@2.121.0 db diff --linked`. If production has changes that are not in the files, capture them as a new migration and merge it first.
4. Mark all 19 applied (the timestamps are the file names in `ls supabase/migrations`):

   ```sh
   npx supabase@2.121.0 migration repair --status applied \
     20260924000000 20260924010000 20260924020000 20260925000000 20260927000000 \
     20260927010000 20260928000000 20260928010000 20260928020000 20261006000000 \
     20261006010000 20261006020000 20261009000000 20261009010000 20261011000000 \
     20261012000000 20261012010000 20261012020000 20261012030000
   ```

5. `npx supabase@2.121.0 migration list --linked` must show all 19 applied on both sides. Post the sanitized output on #249.

## Team

Built by the JG hackathon team.

## Knowledge base

Project evidence, needs, and requirements live in the knowledge base, [`JahnelGroup/jg-club-penguin-kb`](https://github.com/JahnelGroup/jg-club-penguin-kb). Clone it next to this repo, in the same parent folder, so agents can read it at `../jg-club-penguin-kb/`. Keep the default folder names.

<!-- atlas-v3:readme:start -->
## Atlas

This repo uses Atlas, a Claude Code plugin that acts as a shared path for AI-assisted development — generated, customizable policies, guidelines, and guardrails that keep agent-driven work safe and consistent without locking teams into one rigid workflow. Read [`docs/atlas-operators-guide.md`](./docs/atlas-operators-guide.md) for how to work in this repo, in plain language, and the **Atlas** section in [`CLAUDE.md`](./CLAUDE.md) for the policy the agents follow.

Everything Atlas generated here — hooks, the `CLAUDE.md` section, `docs/agents/` — is a **base recommendation**, not fixed policy. Adapt it to this project's actual needs and processes.
<!-- atlas-v3:readme:end -->
