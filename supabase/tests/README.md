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

   `20260925010000_beystadium.sql` adds `matchWins` to `quest_progress()`, so
   once it is applied this proof expects `matchWins: {}` in that row.

## Beystadium (reviewer gate)

`80_beystadium_proof.sql` proves `20260925010000_beystadium.sql` (decisions
B2-B9 in its header) against the same #9 H1 fixture Player: as the fixture
signed in, an impossible match result is `invalid_stats` and pays nothing, a
won match pays 60 with the best set to strikes landed, a second round inside
10 s is `round_too_soon`, a win half the 45 s window later is clamped to 30,
a loss pays 15 and never counts, Let It Rip (+50 once) is earned on exactly
the third match win and not again on the fourth, `quest_progress()` reports
`matchWins`, and `leaderboard('beystadium')` is accepted; as anon
`record_round`, `quest_progress` and `leaderboard` are denied (`42501`). It
also checks `security definer`/`search_path = ''`/one overload each and the
`authenticated`-only grants.

1. Local: covered automatically by `sql-beystadium.test.ts`'s PGlite run in
   `npm test` (not by `run-local.sh`).
2. Real Postgres/Supabase: apply `20260925010000_beystadium.sql` in the SQL
   editor (after every earlier migration), then open
   `80_beystadium_proof.sql`, replace every occurrence of
   `00000000-0000-0000-0000-00000000f1f0` with the real #9 H1 fixture
   Player's id, and run it. Expect every row's `pass` column to read `true`,
   including the final `ALL` row. It changes nothing (everything is rolled
   back) and prints only booleans, counts and Token amounts.
3. Save the result table to `test-results/80-beystadium-proof-supabase/output.txt`.
