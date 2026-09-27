# #27 saved-progress proofs

## Local (Docker)

Requires Docker running locally and `openssl` on `PATH` (used to generate the
throwaway container password). `run-local.sh` checks for both up front and
fails fast with a clear message if either is missing.

```
bash supabase/tests/run-local.sh
```

It starts a throwaway `postgres:17` container (fixed name `jgcp-27-pg`, force-
removed on exit whether the run passes or fails), applies
`local-supabase-stub.sql` (a stand-in for what Supabase itself provides) and
both migrations, reruns the saved-progress migration a second time to prove
it stays idempotent, runs `27_rls_proof.sql` as-is, and then runs a live
two-session parallel-purchase race that only a real database can prove. It
exits non-zero on any failure.

The complete output (every command's stdout and stderr) is teed to
`test-results/27-saved-progress-local/output.txt`, relative to the repo
root. That file is the evidence for a passing local run; it is gitignored,
not committed.

## Real Supabase (gate H2)

1. Open the Supabase SQL editor for this project, signed in as the project
   owner (same process as #9's H1).
2. Open `27_rls_proof.sql`, replace every occurrence of
   `00000000-0000-0000-0000-00000000f1f0` with the real #9 H1 fixture
   Player's id, and run it.
3. Expect every row's `pass` column to read `true`, including the final
   `ALL` row. It changes nothing: the proof rolls back everything it wrote
   before returning.
4. Save the result table, with ids and emails removed, to
   `test-results/27-rls-proof-supabase/output.txt`, and paste the same
   table on #27.

Do not name real emails or Player ids anywhere the output gets saved or
pasted; `27_rls_proof.sql` never selects or prints them itself.

## #70 leaderboard (gate H2)

`70_leaderboard_proof.sql` proves `public.leaderboard()` against the same #9
H1 fixture Player, in `27_rls_proof.sql`'s style: rank order, the tie-break
(whoever reached a tied score first), the caller's own row appended exactly
once outside the requested row count, a blank-named and an invisible-only-
named Player's absence even when ranked highest, the exact result shape,
`security definer`/`search_path = ''`/a single overload, and the
`authenticated`-only grant. It is live-data-tolerant: every throwaway best is
set relative to whatever `max(best_score)` already exists for `coffee-rush`
(chosen because it has no `LEADERBOARD_SCORE_CEILINGS` entry, so an inflated
`v_max + N` throwaway best is never itself at risk of being hidden by R2's
ceiling filter), so it passes whether the project has zero real bests or
thousands.

1. Local (Docker): covered automatically by `sql-leaderboard.test.ts`'s
   PGlite run (A1f) in `npm test`, not by `run-local.sh` (which only knows
   about #27's proofs).
2. Real Supabase (gate H2): open the Supabase SQL editor, signed in as the
   project owner. Open `70_leaderboard_proof.sql`, replace every occurrence
   of `00000000-0000-0000-0000-00000000f1f0` with the real #9 H1 fixture
   Player's id, and run it. Expect every row's `pass` column to read `true`,
   including the final `ALL` row. It changes nothing: the proof rolls back
   everything it wrote before returning, and prints only counts and ranks --
   no real Player's name, id or email.
3. Save the result table to `test-results/70-leaderboard-proof-supabase/output.txt`,
   and paste the same table on #70.

### Moderation: removing one forged/abusive best

R2's plausibility ceiling and R1's blank-name filter both hide known-bad
rows from the leaderboard, but a high-yet-technically-plausible forged score
(under the ceiling) or an abusive-but-visible name can still show. Removing
either is a one-line delete, as the project owner, in the Supabase SQL
editor -- it only ever removes that one Minigame's best for that one Player,
never their Token balance, Badges or other Minigame bests:

```sql
delete from public.minigame_bests where player_id = '<id>' and minigame_id = '<game>';
```

## #46 Quests (gate H2)

`46_quests_proof.sql` proves `20260925000000_quests.sql` against the same #9
H1 fixture Player, in `70_leaderboard_proof.sql`'s style: as the fixture
signed in, `complete_quest('main')` refuses with `quest_incomplete` while a
step is unmet (paying nothing) and `unknown_quest` for any other id, pays 150
Tokens once all five steps are met out of order, and a second call returns
`alreadyCompleted` with nothing paid; `mark_dev_pit_visited()` keeps the first
visit's time; `quest_progress()` reports the saved state; the two new tables
are own-rows SELECT-only; and as anon every function is denied (`42501`).
It also checks `security definer`/`search_path = ''`/one overload each and the
`authenticated`-only grants.

1. Local: covered automatically by `sql-quests.test.ts`'s PGlite run in
   `npm test` (not by `run-local.sh`).
2. Real Supabase (gate H2): apply `supabase/migrations/20260925000000_quests.sql`
   in the SQL editor first, then open `46_quests_proof.sql`, replace every
   occurrence of `00000000-0000-0000-0000-00000000f1f0` with the real #9 H1
   fixture Player's id, and run it. Expect every row's `pass` column to read
   `true`, including the final `ALL` row. It changes nothing (everything is
   rolled back) and prints only booleans, counts and Token amounts.
3. Save the result table to `test-results/46-quests-proof-supabase/output.txt`,
   and paste the same table on #46.

## #138 Badges (gate H1)

`20260927000000_badges.sql` turns Badges into data (`public.badges`, all 15),
adds the one award function (`award_badge`, internal only), the Interior
Penguin trigger on `igloo_slots`, the Session check `check_session_badges()`
(First Waddle, Night Owl), Ship It inside `complete_quest`, and a backfill.
`138_badges_proof.sql` proves it against the same #9 H1 fixture Player, in
`46_quests_proof.sql`'s style: the catalog is readable but not writable; no
client can insert a Badge, change its Tokens or call any internal function;
First Waddle, a Minigame Badge, Interior Penguin (placed through the
client's own `igloo_slots` writes) and Ship It each award once and pay +50
once; and as anon everything is denied. It also checks `security definer`/
`search_path = ''`/one overload for the six new functions, the grants, the
trigger and the foreign key.

**Apply it before the PR merges or deploys**, including a Vercel preview
(which uses this same Supabase project): a client built from the PR reads
`public.badges` on sign-in and fails without it. An old client keeps working
on the new schema.

1. Local: covered automatically by `sql-badges.test.ts`'s PGlite run in
   `npm test` (the proof, the anon and signed-in denials, fixed-time Night
   Owl, the backfill, and the rerun chain).
2. Real Supabase (gate H1), with #46's `20260925000000_quests.sql` (and #135's
   igloo slots, if it merged first) already applied:
   1. Review the migration (30 minutes, time-boxed): schema, RLS, Tokens,
      the security-definer trigger, the internal-only grants and the rerun
      chain in its header.
   2. Apply it, then prove the rerun changes nothing, **in one paste** so no
      live play lands in between (or do it in a quiet window with nobody
      online). Paste this whole block into the SQL editor, with the migration
      file's contents where marked, and run it once:

      ```sql
      -- <paste 20260927000000_badges.sql here: the apply and backfill>
      create temp table h1_badges as
        select badge_id, count(*) as n from public.player_badges group by 1;
      create temp table h1_players as
        select count(*) as player_count, sum(tokens) as token_total from public.players;
      -- <paste 20260927000000_badges.sql here a second time: the rerun>
      select
        (select json_agg(b order by b.badge_id) from h1_badges b) as badges_after_apply,
        (select row_to_json(p) from h1_players p) as players_after_apply,
        not exists (
          (select badge_id, count(*) from public.player_badges group by 1
           except select badge_id, n from h1_badges)
          union all
          (select badge_id, n from h1_badges
           except select badge_id, count(*) from public.player_badges group by 1)
        ) as badges_unchanged_by_rerun,
        (select count(*) = h.player_count and sum(pl.tokens) = h.token_total
         from public.players pl, h1_players h group by h.player_count, h.token_total)
          as tokens_unchanged_by_rerun;
      ```

      Expected: `badges_unchanged_by_rerun` and `tokens_unchanged_by_rerun`
      are both `true`. `badges_after_apply` shows how many Players the
      backfill granted each Badge (counts only).
   3. Open `138_badges_proof.sql`, replace every occurrence of
      `00000000-0000-0000-0000-00000000f1f0` with the real #9 H1 fixture
      Player's id, and run it. Expect every row's `pass` column to read
      `true`, including the final `ALL` row. It changes nothing (everything is
      rolled back) and prints only booleans, counts and Token amounts.
   4. Run the updated `46_quests_proof.sql` the same way (it now expects Ship
      It's +50: a balance of 1150, and `badgesEarned`), then
      `27_rls_proof.sql` (the proof, not the #27 migration).
   5. Save the result tables, with ids and emails removed, to
      `test-results/138-badges-proof-supabase/output.txt`, and paste the same
      tables on #138.

**Rerun chain.** After this migration, rerunning #27's migration fails and
applies nothing once any Player holds a new Badge (and, if none does yet, it
succeeds but breaks new-Badge awards until this file is rerun). Rerunning
#9's migration drops the `players` column grants; this file re-issues them.
Rerunning `20260925000000_quests.sql` silently removes Ship It from
`complete_quest`. The rule: after rerunning any earlier migration, rerun this
file and then every later one, in timestamp order.
