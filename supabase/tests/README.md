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

   #121's `20260928000000_beystadium.sql` adds `matchWins` to `quest_progress()`,
   so once it is applied this proof expects `matchWins: {}` in that row.

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
   2. Apply it, then prove the apply paid exactly +50 per Badge it granted,
      that the backfill missed nobody, and that the rerun changes nothing,
      **in one paste** so no live play lands in between (or do it in a quiet
      window with nobody online). Paste this whole block into the SQL editor,
      with the migration file's contents where marked, and run it once. It
      reads counts only, so it's safe on live data. The temp tables are
      dropped first, so the block can be run again on the same connection:

      ```sql
      drop table if exists h1_before;
      create temp table h1_before as
        select (select count(*) from public.player_badges) as badge_rows,
               (select coalesce(sum(tokens), 0) from public.players) as token_total;
      -- <paste 20260927000000_badges.sql here: the apply and backfill>
      drop table if exists h1_badges;
      create temp table h1_badges as
        select badge_id, count(*) as n from public.player_badges group by 1;
      drop table if exists h1_players;
      create temp table h1_players as
        select count(*) as player_count, coalesce(sum(tokens), 0) as token_total,
               (select count(*) from public.player_badges) as badge_rows
        from public.players;
      -- <paste 20260927000000_badges.sql here a second time: the rerun>
      select
        (select json_agg(b order by b.badge_id) from h1_badges b) as badges_after_apply,
        (select h.badge_rows - b.badge_rows from h1_players h, h1_before b)
          as badge_rows_added_by_apply,
        (select h.token_total - b.token_total = 50 * (h.badge_rows - b.badge_rows)
         from h1_players h, h1_before b) as apply_paid_50_per_badge,
        not exists (
          (select badge_id, count(*) from public.player_badges group by 1
           except select badge_id, n from h1_badges)
          union all
          (select badge_id, n from h1_badges
           except select badge_id, count(*) from public.player_badges group by 1)
        ) as badges_unchanged_by_rerun,
        (select (select count(*) from public.players) = h.player_count
            and (select coalesce(sum(tokens), 0) from public.players) = h.token_total
         from h1_players h) as tokens_unchanged_by_rerun,
        (select count(*) from public.players p
         where p.profile_created_at is not null and p.penguin_name <> ''
           and not exists (select 1 from public.player_badges pb
                           where pb.player_id = p.id and pb.badge_id = 'first-waddle'))
          as named_players_without_first_waddle,
        (select count(*) from public.player_quest_completions c
         where c.quest_id = 'main'
           and not exists (select 1 from public.player_badges pb
                           where pb.player_id = c.player_id and pb.badge_id = 'ship-it'))
          as main_quest_completers_without_ship_it,
        (select count(*) from (select s.player_id from public.igloo_slots s
                               group by 1 having count(*) >= 6) s
         where not exists (select 1 from public.player_badges pb
                           where pb.player_id = s.player_id and pb.badge_id = 'interior-penguin'))
          as six_item_igloos_without_interior_penguin;
      ```

      Expected, in the one result row:

      | Column | Expected |
      |---|---|
      | `badges_after_apply` | how many Players hold each Badge after the backfill (counts only) |
      | `badge_rows_added_by_apply` | how many Badges the backfill granted (0 or more) |
      | `apply_paid_50_per_badge` | `true` (the Token total rose by exactly 50 per granted Badge) |
      | `badges_unchanged_by_rerun` | `true` |
      | `tokens_unchanged_by_rerun` | `true` |
      | `named_players_without_first_waddle` | `0` |
      | `main_quest_completers_without_ship_it` | `0` |
      | `six_item_igloos_without_interior_penguin` | `0` |

      `apply_paid_50_per_badge` holds only if no Tokens moved for another
      reason during the paste. A `false` means live play overlapped it:
      report it on #138 rather than rerunning, since a second run starts from
      the applied state and can't re-prove the apply.
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

## #135 Igloo wall and ceiling slots (gate H2)

`135_igloo_placement_proof.sql` proves `20260927010000_igloo_wall_slots.sql`
against the same #9 H1 fixture Player: as the fixture signed in, a wall item
hangs in a wall slot and moves between wall slots, the Disco Ball hangs in
the ceiling slot, and every mismatch (a floor item on a wall or the ceiling,
a wall item or an award on the floor, the Disco Ball on a wall) is rejected
with `wrong_placement` (`23514`); an unknown item id still fails ownership
(`23503`) and slot 12 still fails the slot check. As postgres it checks the
14-item catalog and its placements, the slot map, that no row is misplaced,
and the guard trigger's presence and security shape.

1. Local: covered automatically by `sql-igloo-placement.test.ts`'s PGlite run
   in `npm test`, including the data migration for existing Players and both
   apply orders with #138's `20260927000000_badges.sql`.
2. Real Supabase (gate H2), right before the #135 PR merges and **after
   #138's migration is applied**:
   1. Save the pre-counts:
      - Floor-placed: `select count(*) filter (where item_id='rgb-light-strip') as rgb_floor, count(*) filter (where item_id='disco-ball') as disco_floor from public.igloo_slots where slot between 1 and 6;`
      - Owned but unplaced: `select count(*) filter (where o.item_id='rgb-light-strip') as rgb_unplaced, count(*) filter (where o.item_id='disco-ball') as disco_unplaced from public.player_items o where o.item_id in ('rgb-light-strip','disco-ball') and not exists (select 1 from public.igloo_slots s where s.player_id=o.player_id and s.item_id=o.item_id);`
      - Floor-furniture fingerprint (every placed item except the two that
        move), a row count and an md5:

        ```sql
        select count(*), md5(string_agg(player_id::text||':'||slot||':'||item_id, ',' order by player_id, slot))
        from public.igloo_slots
        where item_id not in ('rgb-light-strip','disco-ball');
        ```
   2. Paste and run `supabase/migrations/20260927010000_igloo_wall_slots.sql`.
   3. Run the post-counts **immediately** after the apply, before any
      Player acts: until the new build deploys, an old client tab can unplace
      a moved RGB Light Strip or Disco Ball (it deletes it from slot 7 or 11,
      then the guard rejects the floor-slot upsert), and any Player moving
      floor furniture changes the fingerprint, either of which would change
      the counts for a reason that isn't the migration's. Run steps 1-3 in a
      quiet window.
      - `select count(*) filter (where item_id='rgb-light-strip' and slot between 7 and 10) as rgb_wall, count(*) filter (where item_id='disco-ball' and slot = 11) as disco_ceiling from public.igloo_slots;`
      - Mismatches: `select count(*) from public.igloo_slots s join public.shop_items i on i.id=s.item_id where i.placement <> public.igloo_slot_placement(s.slot);`
      - The owned-but-unplaced query again.
      - The floor-furniture fingerprint again.
   4. Expect `rgb_wall = rgb_floor`, `disco_ceiling = disco_floor`, 0
      mismatches, `rgb_unplaced`/`disco_unplaced` unchanged, and the
      fingerprint's `count` and `md5` unchanged (the migration never touches
      any other placed item). Any difference is a failure: stop and record
      it on #135.
   5. Open `135_igloo_placement_proof.sql`, replace every
      `00000000-0000-0000-0000-00000000f1f0` with the #9 H1 fixture Player's
      id, and run it. Expect every row's `pass` to be `true`, including
      `unknown_item_gives_23503` and the final `ALL` row. It changes nothing.
3. Save the counts and the proof table (no ids or emails) to
   `test-results/135-igloo-placement-proof-supabase/output.txt`, paste them on
   #135, then merge the PR straight away: the new client needs this schema,
   and old tabs run degraded against it until the new build loads.

## #121 Beystadium (reviewer gate)

`80_beystadium_proof.sql` proves `20260928000000_beystadium.sql` (decisions
B1-B10 in its header) against the same #9 H1 fixture Player. As postgres it
checks that Let It Rip is `available` in `public.badges` and that #138's
foreign key is still the only Badge constraint (no check constraint). As the
fixture signed in: an impossible match result is `invalid_stats` and pays
nothing, a won match pays 60 with the best set to strikes landed, a second
round inside 10 s is `round_too_soon`, a win half the 45 s window later is
clamped to 30, a loss pays 15 and never counts; with Let It Rip switched off,
the third win fails with `award_badge`'s own `badge_unavailable` (so the
award goes through `public.award_badge`); switched back on, the third win
earns it, pays +50 once and returns `badgesEarned: ["let-it-rip"]`, every
other call returns `badgesEarned: []`, and the fourth win earns nothing more;
`quest_progress()` reports `matchWins`, `leaderboard('beystadium')` is
accepted, and the fixture can't call `award_badge`. As anon `record_round`,
`quest_progress`, `leaderboard` and `award_badge` are denied (`42501`). It
also checks `security definer`/`search_path = ''`/one overload each and the
`authenticated`-only grants.

**Apply it before the #121 PR merges or deploys** (#138's deploy-order
rule), after #138's `20260927000000_badges.sql` and #135's
`20260927010000_igloo_wall_slots.sql`. It sorts before the feedback branch's
`20260928010000`.

1. Local: covered automatically by `sql-beystadium.test.ts`'s PGlite run in
   `npm test` (not by `run-local.sh`), which migrates every file in
   timestamp order and also proves the rerun chain.
2. Real Postgres/Supabase: apply `20260928000000_beystadium.sql` in the SQL
   editor (after every earlier migration), then open
   `80_beystadium_proof.sql`, replace every occurrence of
   `00000000-0000-0000-0000-00000000f1f0` with the real #9 H1 fixture
   Player's id, and run it. Expect every row's `pass` column to read `true`,
   including the final `ALL` row. It changes nothing (everything is rolled
   back) and prints only booleans, counts and Token amounts. Then rerun
   `138_badges_proof.sql` and `46_quests_proof.sql` the same way: both
   still pass on the new schema.
3. Save the result tables to `test-results/80-beystadium-proof-supabase/output.txt`.
