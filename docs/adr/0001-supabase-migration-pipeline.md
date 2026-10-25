# 0001. Supabase migration pipeline

- Status: Accepted
- Date: 2026-10-22
- Ticket: #249

## Context

The project is past its POC phase, but Supabase migrations were still applied by
hand in the SQL editor. That caused four problems:

- A merged migration could sit unapplied, so production fell behind `main`.
- Nothing recorded which of the 19 migrations production actually had.
- Files could be applied out of order or rerun. `record_round` and `leaderboard`
  are redefined whole in each migration, so rerunning an older file silently
  drops later Minigame branches (see the header of
  `20261012030000_pao_de_queijo.sql`).
- Proofs run in PGlite under `npm test`, but the real Postgres/Supabase check was
  manual, so a migration could merge and only fail on real Supabase.

The `feedback-email` Edge Function was also deployed by hand.

## Decision

- **Runner and tracking.** The Supabase CLI applies migrations. Applied state
  lives in `supabase_migrations.schema_migrations`. The existing timestamp file
  names already fit. The CLI is pinned (2.121.0) and run through `npx`, so
  there is no global install and CI matches local.
- **Environments.** Production only. Pre-merge checks run against a local
  Supabase in CI (`supabase start`, `supabase db reset`, every
  `supabase/tests/*_proof.sql`). No staging project and no Supabase Branching.
- **Forward-only.** No down-migrations. A bad migration is fixed by a new one.
- **Ordering vs. the frontend.** The Deploy workflow runs migrate, then
  functions, then Vercel production. A failed or rejected migrate blocks both
  later jobs. Because the frontend rolls out after the database, migrations stay
  additive and work with the previous client (expand, then contract).
- **Vercel.** Stack-lock #7 still holds: hosting is still Vercel static
  hosting. Only the production deploy trigger moves to GitHub Actions.
  `vercel.json` sets `git.deploymentEnabled.main: false`, so PR previews stay
  automatic and production deploys only through the workflow.
- **Approval.** A GitHub Environment named `production` requires 1 reviewer,
  allows self-approval, and only deploys from `main`. The step confirms a deploy
  was intended. It is not a two-person control.
- **Secrets.** In the `production` environment: `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`. At repo level: `VERCEL_TOKEN`,
  `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, so the ungated `vercel` job can read
  them. The `functions` job is also bound to `production` because it reads the
  same environment secrets, which makes it approval-gated too.
- **Conventions.** Keeping migrations safe to rerun is encouraged, not required.
  The redefine-whole pattern for `record_round`/`leaderboard` stays. New
  migration headers drop the "Apply by pasting into the Supabase SQL editor (no
  CLI)" line. Existing files are unchanged: they are already applied and a
  tracked runner never re-applies them.
- **Baseline guard.** `migrate` fails before `db push` unless
  `supabase migration list --linked` shows `20260924000000` applied remotely. The
  one-time baseline (mark the 19 existing migrations applied) must happen first,
  so the first deploy can never replay old files against production.

## Consequences

- Merging to `main` brings production up to date, tracked and in order. PRs that
  touch `supabase/migrations/**` or `supabase/tests/**` are proven on real local
  Supabase before they merge.
- Deploys run one at a time (concurrency group `deploy-prod`, no
  cancel-in-progress). GitHub keeps only one pending run per group, so a newer
  push replaces an older pending run. Each run therefore diffs from the head of
  the last fully successful Deploy run on `main`, not just the push's `before`,
  so a replaced, failed or rejected run's migrations and functions are picked
  up by the next one. The workflow only deploys from `main`, including manual
  runs. This replaces the ticket's literal `before..sha` diff (recorded as a
  scope change on #249).
- Someone with repo admin must configure the environment and secrets, and a
  human must run the baseline once.

Accepted risks:

- One personal Supabase access token is shared by the team. Rotate it if anyone
  with access leaves.
- Production deploys are self-approved.
- The Vercel secrets are repo-level, so any workflow in this repo can read them.

## Out of scope

- A staging project or Supabase Branching.
- Down-migrations.
- Splitting `record_round`/`leaderboard` per Minigame (follow-up ticket).
- A service-account token.
