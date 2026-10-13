-- Door network guard posts (#170): re-seeds Anthony's guard posts
-- (public.phishing_guard_posts, #146) from #170's door network and lets him
-- guard THE HALLWAY too. This amends #146 P3: a post is an enabled in-scene
-- door (never an exit pill, never a locked door) of a Room in
-- GUARD_ROOM_IDS (src/phishing/guard-placement.ts: town-center, dev-pit,
-- the-melt, roof-deck, office-hallway), and the client stands Anthony on
-- that door's own guardTile (src/game/rooms/definitions/*.ts, #170 D14)
-- instead of its approach tile.
--
-- Runs after 20261011000000_stair_climb.sql and needs #146's
-- 20260928020000_phishing_quiz.sql (public.phishing_guard_posts,
-- public.phishing_challenges, public.phishing_guard_at). Apply by pasting the
-- whole file into the Supabase SQL editor (no CLI) while
-- floor(extract(epoch from now()) / 600)::bigint % 16 = 5 (DN3, H2). Proof:
-- supabase/tests/170_guard_posts_proof.sql, then the edited
-- supabase/tests/146_phishing_proof.sql (both run in PGlite by
-- src/persistence/sql-phishing.test.ts; the reviewer re-runs them on real
-- Postgres/Supabase).
--
-- Rerun order: this file re-seeds the table #146's file also seeds, so a
-- rerun of 20260928020000_phishing_quiz.sql (which restores #146's 8 posts)
-- must be followed by a rerun of this file (RT170-25).
--
-- Decisions for red-team review (#170 execution plan revision 2, approved by
-- @milliehime 2026-10-11; red-team rounds 1 and 2, RT170-21 binding). Each is
-- numbered so a review comment can cite it.
--
-- DN1 Scope. Re-seeds public.phishing_guard_posts with DN5's 16 rows,
-- relaxes its phishing_guard_posts_room_id_check to add office-hallway
-- (DN7), and aborts while a remapped guard window is in use (DN3). No
-- function, grant, policy or other table changes: phishing_guard_at,
-- record_map_bypass and start_phishing_challenge are untouched.
--
-- DN2 Preconditions: a DO block that runs first. It raises
-- phishing_quiz_missing if public.phishing_guard_posts,
-- public.phishing_challenges or public.phishing_guard_at(timestamptz) doesn't
-- exist, and room_check_name_mismatch unless a check constraint named exactly
-- phishing_guard_posts_room_id_check exists on public.phishing_guard_posts
-- (the name Postgres gave #146's inline column check; RT170-14).
--
-- DN3 One paste, one transaction (RT170-6, RT170-3, RT170-21). There's no
-- explicit begin/commit: the SQL editor runs the whole paste as one implicit
-- transaction, so an error rolls everything back and releases every lock.
-- The work is one DO block, in this order:
--   1. lock_timeout 5s for this transaction (set_config(..., true));
--   2. lock table public.phishing_guard_posts in access exclusive mode. It
--      blocks phishing_guard_at's readers (phishing_guard_now,
--      start_phishing_challenge, record_map_bypass) for the few milliseconds
--      the paste takes, so no challenge starts between step 3 and step 6;
--      lock_timeout makes the paste fail fast instead of queueing behind a
--      long reader;
--   3. v_t := clock_timestamp() (not now(), the transaction start, which
--      can sit before a window boundary), and the old post for v_t,
--      phishing_guard_at(v_t), recorded before the delete;
--   4. DN7; 5. delete every post; 6. insert DN5's rows;
--   7. the in-use abort (RT170-21): raise guard_window_in_use only if the new
--      post for v_t differs from the old one (room or door) and a guard
--      challenge exists for that window (phishing_challenges.mode = 'guard'
--      and guard_window_start = the window's start).
-- An identical rerun never remaps, so it never aborts (DN8). It takes no
-- players lock, so it can't deadlock with the RPCs, which lock players first.
-- Operator rule (H2): paste while
-- floor(extract(epoch from now()) / 600)::bigint % 16 = 5. #146's 8-row seed
-- and DN5 both map that window to the-melt / ROOF DECK (8-row position
-- 5 % 8 = 5, 16-row position 5), so nothing remaps and the abort can't fire;
-- it comes round once every 160 minutes and lasts 10. On
-- guard_window_in_use, wait for that window and paste again.
--
-- DN4 Seed rule. Every enabled in-scene door of GUARD_ROOM_IDS, labels
-- exactly as the Room definitions have them (G-1 Option A: all 16). Exit
-- pills and locked doors are never posts; a pill twin is blocked with its
-- door, because the client matches posts by label.
--
-- DN5 Order (RT170-2). No two neighbouring windows are in the same Room, and
-- no two neighbouring windows guard the two sides of one doorway (Town
-- Center THE HALLWAY / Hallway TOWN CENTER at 7/12, Town Center KITCHEN /
-- Kitchen TOWN CENTER at 1/11, Kitchen ROOF DECK / Roof Deck KITCHEN at
-- 5/14, Dev Pit THE HALLWAY / Hallway DEV PIT at 9/4), including the wrap
-- (15 -> 0). The same 16 rows are src/phishing/fake-data.ts's
-- FAKE_GUARD_POSTS, the 170 proof's expected seed and H2's post-check.
--
-- DN6 In-flight guard windows (RT170-3). Window identity stays time-based
-- (#146 P4). Because DN3 aborts when the window being remapped has a guard
-- challenge, the remap never adds a counted bypass or strands an open
-- challenge. What remains is benign: (a) a client that cached the old post
-- shows Anthony at the old door until it refreshes, with no server effect
-- without a challenge; (b) between this apply and the deploy, an old client
-- recognises 11 of the 16 labels (Town Center STAIRWELL and ELEVATOR · ROOF
-- DECK, the Dev Pit's THE ICEBOX, the Kitchen's two, the Roof Deck's
-- KITCHEN, the Hallway's TOWN CENTER and TEAM ROOM 1-4) with old
-- approach-tile placement, and for the rest finds no door, so Anthony isn't
-- drawn; (c) the new client before this apply doesn't recognise #146's
-- THE ICEBOX / DEV PIT (Town Center) and TOWN CENTER (Dev Pit) labels, with
-- the same safe degrade. Merge and deploy promptly after the apply.
--
-- DN7 Room check (Q1). Drops phishing_guard_posts_room_id_check and adds it
-- back naming the five Rooms: a strict superset of #146's four. DN2 has
-- asserted the name, so the plain drop can't miss on a first run or a rerun.
--
-- DN8 Rerunnable to an identical table (DN3: an identical rerun never
-- aborts).
--
-- DN9 Rollback: re-paste #146's guard-post block (its delete and 8-row
-- insert), only together with a pre-#170 client. The relaxed check can stay.
--
-- DN10 Proofs (RT170-7, RT170-14). supabase/tests/170_guard_posts_proof.sql
-- checks the seed by position, the neighbour rules, the Room list by
-- behaviour, the constraint name, RLS and the mod-16 schedule;
-- 146_phishing_proof.sql stays on the full chain, its seed checks reading
-- from the table.

-- ---------------------------------------------------------------------------
-- DN2: preconditions
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.phishing_guard_posts') is null
    or to_regclass('public.phishing_challenges') is null
    or to_regprocedure('public.phishing_guard_at(timestamptz)') is null then
    raise exception 'phishing_quiz_missing'
      using hint = 'apply 20260928020000_phishing_quiz.sql (#146) first';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.phishing_guard_posts'::regclass
      and c.contype = 'c'
      and c.conname = 'phishing_guard_posts_room_id_check'
  ) then
    raise exception 'room_check_name_mismatch'
      using hint = 'expected the check constraint phishing_guard_posts_room_id_check on public.phishing_guard_posts';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- DN3-DN7: lock, record the old post, relax the check, re-seed, in-use abort
-- ---------------------------------------------------------------------------

do $$
declare
  v_t timestamptz;
  v_old jsonb;
  v_new jsonb;
begin
  perform set_config('lock_timeout', '5s', true);
  lock table public.phishing_guard_posts in access exclusive mode;

  v_t := clock_timestamp();
  if exists (select 1 from public.phishing_guard_posts) then
    v_old := public.phishing_guard_at(v_t);
  end if;

  alter table public.phishing_guard_posts drop constraint phishing_guard_posts_room_id_check;
  alter table public.phishing_guard_posts add constraint phishing_guard_posts_room_id_check
    check (room_id in ('town-center', 'dev-pit', 'the-melt', 'roof-deck', 'office-hallway'));

  delete from public.phishing_guard_posts;
insert into public.phishing_guard_posts (position, room_id, door_label) values
    (0, 'office-hallway', 'TEAM ROOM 1'),
    (1, 'town-center', 'KITCHEN'),
    (2, 'office-hallway', 'TEAM ROOM 2'),
    (3, 'dev-pit', 'THE ICEBOX'),
    (4, 'office-hallway', 'DEV PIT'),
    (5, 'the-melt', 'ROOF DECK'),
    (6, 'office-hallway', 'TEAM ROOM 3'),
    (7, 'town-center', 'THE HALLWAY'),
    (8, 'office-hallway', 'BATHROOM'),
    (9, 'dev-pit', 'THE HALLWAY'),
    (10, 'office-hallway', 'TEAM ROOM 4'),
    (11, 'the-melt', 'TOWN CENTER'),
    (12, 'office-hallway', 'TOWN CENTER'),
    (13, 'town-center', 'STAIRWELL'),
    (14, 'roof-deck', 'KITCHEN'),
    (15, 'town-center', 'ELEVATOR · ROOF DECK');

  -- RT170-21: only a window whose post actually moved, and only while a
  -- guard challenge is bound to it.
  v_new := public.phishing_guard_at(v_t);
  if v_old is not null
    and (v_new ->> 'roomId', v_new ->> 'doorLabel')
      is distinct from (v_old ->> 'roomId', v_old ->> 'doorLabel')
    and exists (
      select 1
      from public.phishing_challenges c
      where c.mode = 'guard'
        and c.guard_window_start = (v_old ->> 'windowStart')::timestamptz
    ) then
    raise exception 'guard_window_in_use'
      using hint = 'paste while floor(extract(epoch from now()) / 600)::bigint % 16 = 5, when nothing remaps';
  end if;
end;
$$;
