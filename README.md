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

CI runs typecheck, lint, format check, unit tests, and build on every pull request.

## Supabase and Vercel setup

The client reads two env vars, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`). Only the Supabase anon (public) key ever goes to the client; never put the service-role key in `.env` or in Vercel.

A human needs to do the following once, outside the app:

1. **Apply the `players` migration.** Paste `supabase/migrations/20260924000000_players.sql` into the Supabase Dashboard's SQL editor and run it. It's safe to rerun.
2. **Set the Vercel env vars.** In the Vercel project settings, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for both the Production and Preview environments.
3. **Configure Supabase Auth → URL Configuration → Redirect URLs.** Add `http://localhost:5173/` (dev) and `http://localhost:4173/` (preview build), plus the Vercel production URL and any preview URLs used for the deployed smoke test, each with a trailing slash.
4. **Set the Site URL.** In the same URL Configuration screen, set **Site URL** to the production URL.
5. **Disable the Email provider.** In Supabase Dashboard → Authentication → Providers, turn off Email so Google is the only sign-in path. Confirm **Phone** and **Anonymous** sign-ins are also off.
6. **Confirm the Google OAuth consent screen's audience** allows every demo attendee's Google account (an internal Workspace audience, or "External / In production", not a short test-user list).

> **Google Cloud redirect URI.** The only authorized redirect URI in the Google Cloud OAuth client is the Supabase callback, `https://<project-ref>.supabase.co/auth/v1/callback` — never the Vercel URL. The Vercel URL only ever goes into Supabase's Redirect URLs (step 3) and Site URL (step 4) above.

### Running the deployed e2e specs

`e2e/deployed-auth.spec.ts` and `e2e/deployed-progress.spec.ts` run against a live deployment instead of the local preview build; both `test.skip()` themselves unless `DEPLOY_URL` and `AUTH_STATE` are set. `DEPLOY_URL` is the deployed URL (added to Supabase's Redirect URLs above); `AUTH_STATE` is a path to Playwright storage state saved from signing in there with a test Google account, captured with `npx playwright codegen --save-storage=<path> <DEPLOY_URL>` (sign in, then close the browser). That file contains a live Supabase refresh token, so save it **outside the repo** and never commit it, e.g. `AUTH_STATE=$HOME/jg-auth/auth.json`. `deployed-auth.spec.ts` also requires `FIXTURE_PLAYER_ID`: it throws at module load, before any test runs, if `DEPLOY_URL`/`AUTH_STATE` are set but `FIXTURE_PLAYER_ID` isn't — so run these specs one file at a time rather than as a whole directory. `deployed-progress.spec.ts` additionally writes real progress (look, a Minigame round, a purchase, an Igloo slot) to that test account through the real `ProgressStore` with no cleanup afterward, so use a dedicated test account that's fine to have its saved progress permanently overwritten. Example: `DEPLOY_URL=https://your-preview.vercel.app AUTH_STATE=$HOME/jg-auth/auth.json npx playwright test e2e/deployed-progress.spec.ts`.

### Running the two-browser e2e specs

The specs in Playwright's `realtime-shared-users` project (`playwright.config.ts`: `e2e/presence-two-browsers.spec.ts`, `e2e/chat-two-browsers.spec.ts` and `e2e/movement-sync.spec.ts`) sign in the shared Supabase project's two test users, A and B (`E2E_USER_A_EMAIL`/`_PASSWORD`, `E2E_USER_B_EMAIL`/`_PASSWORD` in `.env.test.local`, or `AUTH_STATE_A`/`AUTH_STATE_B` storage-state files). They run against the **real shared Supabase project** (#81), so other Players are expected to be in a Room at the same time — these specs must never check a roster's total count, only specific test-user Player ids. Only one run at a time, across all developers and agents, may use this pair of test users. That project is single-worker, so the specs never race each other within one `npm run test:e2e` run; across runs, `presence-two-browsers` and `chat-two-browsers` call a best-effort pre-flight guard (`e2e/support/presence-guard.ts`) before opening any browser context, which fails fast if a test user is still in Town Center from another run.

## Team

Built by the JG hackathon team.

## Knowledge base

Project evidence, needs, and requirements live in the knowledge base, [`JahnelGroup/jg-club-penguin-kb`](https://github.com/JahnelGroup/jg-club-penguin-kb). Clone it next to this repo, in the same parent folder, so agents can read it at `../jg-club-penguin-kb/`. Keep the default folder names.

<!-- atlas-v3:readme:start -->
## Atlas

This repo uses Atlas, a Claude Code plugin that acts as a shared path for AI-assisted development — generated, customizable policies, guidelines, and guardrails that keep agent-driven work safe and consistent without locking teams into one rigid workflow. Read [`docs/atlas-operators-guide.md`](./docs/atlas-operators-guide.md) for how to work in this repo, in plain language, and the **Atlas** section in [`CLAUDE.md`](./CLAUDE.md) for the policy the agents follow.

Everything Atlas generated here — hooks, the `CLAUDE.md` section, `docs/agents/` — is a **base recommendation**, not fixed policy. Adapt it to this project's actual needs and processes.
<!-- atlas-v3:readme:end -->
