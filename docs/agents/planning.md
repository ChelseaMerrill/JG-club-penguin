<!-- atlas-v3:planning:start -->
# Repository planning profile

This document is the repository's scoped planning profile. Each entry has the
authority named by its classification; the document is not blanket mandatory
policy.

Read this guide before clarifying, researching, prototyping, specifying,
decomposing, technically planning, or red-team reviewing proposed work. It
routes repository-specific concerns; generic planning mechanics remain in the
invoked skill.

| Classification | Trigger | Required consideration |
|---|---|---|
| confirmed team policy | Any change touching Presence or Session state | Presence/Session state is ephemeral, held only in Supabase Realtime, never persisted to Postgres. |
| confirmed team policy | Adding UI chrome (login button, chat panel, color picker, dialogs) | Build as plain DOM/HTML overlays outside the Phaser canvas; no React or other component framework. |
| confirmed team policy | Player data model change | public.players keyed by auth.users.id with RLS scoped to auth.uid(); Google identity stays in auth.users and is not duplicated. |
| Atlas recommendation | Postgres schema or RLS policy change | Plan the migration, the RLS policy, and verification as both an authenticated Player and the anon role. |
| Atlas recommendation | Realtime channel naming or Broadcast/Presence payload change | Treat it as a cross-track contract (Tracks A, B, D): document the shape and update every consumer in the same work package. |
| Atlas recommendation | Supabase client configuration or secrets | Only the Supabase anon key reaches the client; never commit keys, never use the service-role key in the SPA. |
| unresolved question | Domain vocabulary lookups | CONTEXT.md is referenced by issues #1 and #7 but is not committed on any branch; a human must push it. |
| unresolved question | Room, Minigame, chat moderation, or spawn/reconnect work | v1 Room scope (#6), the v1 Minigame mechanic, chat moderation scope, and spawn/reconnect behavior are undecided; stop and ask rather than choose. |

Classifications have distinct authority: confirmed team policy is mandatory;
Atlas recommendations are proposals; discovered repository facts are evidence;
unresolved questions must not be silently converted into policy.

## Work-package plan contract

`/atlas-plan <ticket-epic-or-spec>` reads the complete stable contract, existing
technical or execution plan, dependencies, decisions, and relevant repository
areas. For tracked work it also reads state, comments, linked parent specs, and
applicable children. Its plan covers intent, affected areas and interfaces,
ordered steps, declared scope, dependencies, AC and DoD coverage, run surface,
verification commands, real-dependency checks, fixtures, and human
prerequisites. It preserves the stable contract and adequate existing plan
content.

Return an unclear or unbounded work package to `/grill-with-docs`, Wayfinder,
`/to-spec`, or `/to-tickets`; a stable repository spec is a valid input, but
`/atlas-plan` does not invoke those flows or create product specs or child
tickets from unresolved material.

## Review and publication

Red-team policy: Required only for plans touching auth (Supabase Auth/Google OAuth), the Postgres schema or RLS, the realtime channel/message contract shared across tracks, or the locked architecture; optional otherwise..

Storage: **tracker**. Drafts before approval:
**false**. A repository spec uses
the planning section of sibling `execution.md`; tracked work uses the configured
storage. Exact file or tracker mutations are previewed before publication. Read
`docs/agents/issue-tracker.md` for the authoritative approval, persistence, and
ticket status rules, `docs/agents/triage-labels.md` for decomposition,
`docs/agents/domain.md` for terminology, and `docs/agents/testing.md` for AC,
DoD, fixture, and verification design.
<!-- atlas-v3:planning:end -->
