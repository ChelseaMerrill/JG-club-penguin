-- Quest "Pair with a JGer and fix the flaky test" (#140, part of #129): talk
-- to Paul Carnival in The Icebox, check the CI board in the Dev Pit, pair up
-- with another JGer (or, solo, with Paul himself) for 10 continuous seconds,
-- squash 3 flaky bugs in one Bug Squash round, then report back to Paul.
-- Reward: 150 Tokens, paid once by the shared registry's `complete_quest`
-- (no code change there).
--
-- Runs after 20261006000000_quest_registry.sql (#143's shared foundation for
-- #140, #141 and #143), and so after everything that migration needs. A
-- sibling Quest's migration (#141, #143, or #142's own
-- 20261009010000_quest_pitch_hack.sql) may land before or after this one:
-- this file touches only its own row, its own function and its own four
-- columns, so the order between sibling Quest migrations never matters.
-- Apply by pasting into the Supabase SQL editor (no CLI). Safe to rerun.
-- Proof: supabase/tests/quest_pair_flaky_test_proof.sql (run in PGlite by
-- src/persistence/sql-quest-pair-flaky-test.test.ts; the reviewer re-runs it
-- on real Postgres/Supabase).
--
-- Deploy order (the registry's own rule): apply this migration before the
-- client that lists the 'pair-flaky-test' Quest merges or deploys (including
-- a Vercel preview). An old client on this schema keeps working (it never
-- reads `public.quests` at all); a new client on an old server (this
-- migration not yet applied) sees `questSteps['pair-flaky-test']` read as
-- `{}` (the registry's `quest_steps_for` fallback), so the Quest always
-- shows 0 / 5 and `complete_quest('pair-flaky-test')` always refuses with
-- `quest_incomplete` -- never paid early, never broken.
--
-- Decisions (execution packet for #140, 2026-10-09). Each is numbered so a
-- review comment can cite it.
--
-- P1 The registry row. `insert ... on conflict (id) do update` exactly as
-- the registry's own rule requires (R1): `('pair-flaky-test', 150)`.
--
-- P2 Four nullable timestamps on `player_quest_state` (mirroring #143's
-- `casey_talked_at` and #46's `dev_pit_visited_at`), every one the server's
-- own `now()`, written only by this migration's own functions:
--   paul_talked_at       set once, by `mark_paul_talked()`
--   ci_board_checked_at  set once, by `mark_ci_board_checked()`
--   paired_at            set once, by `mark_paired()`
--   paul_reported_at     set once, by `report_to_paul()`, only once steps 1-4
--                        are all met
--
-- P3 `quest_steps__pair_flaky_test(p_player)` (the registry's R2 convention:
-- security definer, `set search_path = ''`, stable, schema-qualified,
-- EXECUTE revoked from public/anon/authenticated, nothing granted back).
-- Five steps, in the client's step ids:
--   talk-to-paul      paul_talked_at is not null
--   check-ci-board    ci_board_checked_at is not null
--   pair-with-jger    paired_at is not null
--   squash-flakes     a public.minigame_rounds row for 'bug-squash' whose
--                     `(stats->>'flakyHits')::int >= 3` (the key is missing,
--                     not an integer, or just absent reads as not met -- the
--                     cast is guarded with a `jsonb_typeof`/numeric check
--                     rather than trusted blind, even though `record_round`'s
--                     own stats validation (#27, unchanged here) already
--                     guarantees every stored `stats` value is a JSON number)
--   report-to-paul    paul_reported_at is not null
--
-- P4 `mark_paul_talked()`, `mark_ci_board_checked()` and `mark_paired()`
-- follow #46's `mark_dev_pit_visited()` / #143's `mark_casey_talked()`
-- pattern exactly: client-asserted, idempotent (the first call's time
-- sticks), no Player id argument -- always `auth.uid()`'s own row, so no
-- caller can ever set one of these for someone else. Same residual risk as
-- #46 Q2 and #143 I3, stated plainly: three of this Quest's five steps are
-- this client-asserted (the fourth, `report-to-paul`, re-checks the first
-- three plus the fifth server-checked one before it will set anything, P5).
-- The pairing step in particular (`pair-with-jger`) is doubly so -- Presence
-- positions are live-only, never stored, so there is no way for the server
-- to itself check "within 1.5 tiles of another Penguin for 10 s"; the
-- client's own `src/quests/pairing.ts` decides when to call
-- `mark_paired()`. Accepted for a 150-Token Quest, the same call #46 and
-- #143 already made for a cheaper one.
--
-- P5 `report_to_paul()`: security definer, no arguments, identity from
-- `auth.uid()`. Calls `quest_steps__pair_flaky_test(v_uid)` itself and
-- raises `quest_steps_incomplete` unless `talk-to-paul`, `check-ci-board`,
-- `pair-with-jger` and `squash-flakes` are all `true` -- `report-to-paul`
-- itself is excluded from that check (it's what this call is about to set).
-- Nothing is written on a refusal. Otherwise coalesces `paul_reported_at` (a
-- repeat call once reported changes nothing). Paying is still
-- `complete_quest('pair-flaky-test')`'s job (registry R5): the client calls
-- it once `quest_progress` reports every one of this Quest's five steps,
-- exactly as #141's delivery does (coffee-run-rules.ts's own comment).
--
-- P6 New error code: `quest_steps_incomplete` (`report_to_paul` before
-- steps 1-4 are all met). Distinct from the registry's own `quest_incomplete`
-- (raised by `complete_quest` itself): this one is raised by
-- `report_to_paul`, a Quest-specific RPC `complete_quest` never calls.
-- Mirrored by `PROGRESS_ERROR_CODES` in `src/persistence/progress-store.ts`.
--
-- P7 No Badge branch here: `badgesEarned` stays `[]` for 'pair-flaky-test'
-- (only 'main' awards Ship It, per the registry's R5).
--
-- P8 Never redefines `complete_quest` or `quest_progress` (the registry's
-- own rule): both already read `public.quests` and dispatch through
-- `quest_steps_for`, so this Quest is paid and reported as soon as its row,
-- its function and its four columns exist. `record_round` is never
-- redefined either (the registry's own rule extended to #27's functions
-- too): `squash-flakes` reads `minigame_rounds.stats` exactly as it is
-- already stored, trusting `record_round`'s existing stats validation (#27:
-- every `stats` value is a whole JSON number from 0 to 100000) to keep
-- `flakyHits` well-formed.
--
-- Rerun chain: rerunning this file re-adds the 'pair-flaky-test' row
-- (refreshing `reward_tokens` only) and replaces
-- `quest_steps__pair_flaky_test`, `mark_paul_talked`,
-- `mark_ci_board_checked`, `mark_paired` and `report_to_paul`; it never
-- touches `complete_quest`, `quest_progress`, `record_round` or any other
-- Quest's row/function. The registry's own rerun-chain notes still apply to
-- everything upstream of this file.
--
-- Conventions (the registry's own, from the leaderboard migration's D5):
-- every function is security definer with set search_path = '', every
-- relation schema-qualified, #variable_conflict use_column, identity from
-- auth.uid() only in client-callable functions, EXECUTE revoked from
-- public/anon/authenticated and granted back to authenticated only where
-- stated.

-- ---------------------------------------------------------------------------
-- public.quests: the 'pair-flaky-test' row (P1)
-- ---------------------------------------------------------------------------

-- Mirrored by the 'pair-flaky-test' entry in src/quests/quest-definitions.ts
-- (rewardTokens) and in src/persistence/in-memory-steps-quests.ts.
insert into public.quests (id, reward_tokens) values
  ('pair-flaky-test', 150)
on conflict (id) do update
  set reward_tokens = excluded.reward_tokens;

-- ---------------------------------------------------------------------------
-- player_quest_state's four columns (P2), written only by the functions
-- below. Additive: a sibling Quest's own migration may add its own columns
-- to this same table without conflict.
-- ---------------------------------------------------------------------------

alter table public.player_quest_state
  add column if not exists paul_talked_at timestamptz null;

alter table public.player_quest_state
  add column if not exists ci_board_checked_at timestamptz null;

alter table public.player_quest_state
  add column if not exists paired_at timestamptz null;

alter table public.player_quest_state
  add column if not exists paul_reported_at timestamptz null;

-- ---------------------------------------------------------------------------
-- mark_paul_talked() (P4)
--
-- Records the caller's first "talk to Paul" moment at the server's now(); a
-- later call keeps the first time. No Player id argument: always the
-- caller's own row. Errors: not_authenticated, no_player.
-- ---------------------------------------------------------------------------

create or replace function public.mark_paul_talked()
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.players p where p.id = v_uid) then
    raise exception 'no_player';
  end if;

  insert into public.player_quest_state as s (player_id, paul_talked_at)
  values (v_uid, now())
  on conflict (player_id) do update
    set paul_talked_at = coalesce(s.paul_talked_at, excluded.paul_talked_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_ci_board_checked() (P4)
--
-- Records the caller's first "checked the CI board" moment. Same shape as
-- mark_paul_talked(). Errors: not_authenticated, no_player.
-- ---------------------------------------------------------------------------

create or replace function public.mark_ci_board_checked()
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.players p where p.id = v_uid) then
    raise exception 'no_player';
  end if;

  insert into public.player_quest_state as s (player_id, ci_board_checked_at)
  values (v_uid, now())
  on conflict (player_id) do update
    set ci_board_checked_at = coalesce(s.ci_board_checked_at, excluded.ci_board_checked_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_paired() (P4)
--
-- Records the caller's first "paired up for 10 s" moment, client-asserted
-- (see P4's note on why). Same shape as mark_paul_talked(). Errors:
-- not_authenticated, no_player.
-- ---------------------------------------------------------------------------

create or replace function public.mark_paired()
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.players p where p.id = v_uid) then
    raise exception 'no_player';
  end if;

  insert into public.player_quest_state as s (player_id, paired_at)
  values (v_uid, now())
  on conflict (player_id) do update
    set paired_at = coalesce(s.paired_at, excluded.paired_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- quest_steps__pair_flaky_test(p_player) -> jsonb (P3). Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.quest_steps__pair_flaky_test(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return jsonb_build_object(
    'talk-to-paul', exists (
      select 1 from public.player_quest_state s
      where s.player_id = p_player and s.paul_talked_at is not null
    ),
    'check-ci-board', exists (
      select 1 from public.player_quest_state s
      where s.player_id = p_player and s.ci_board_checked_at is not null
    ),
    'pair-with-jger', exists (
      select 1 from public.player_quest_state s
      where s.player_id = p_player and s.paired_at is not null
    ),
    'squash-flakes', exists (
      select 1 from public.minigame_rounds r
      where r.player_id = p_player
        and r.minigame_id = 'bug-squash'
        -- Guarded: a missing key reads as 0 (coalesce), and anything that
        -- isn't a JSON number (jsonb_typeof) is treated as 0 rather than
        -- raising a cast error, even though record_round's own validation
        -- (#27) already guarantees every stored stats value is numeric.
        and coalesce(
          case
            when jsonb_typeof(r.stats -> 'flakyHits') = 'number'
              then (r.stats ->> 'flakyHits')::numeric
            else 0
          end,
          0
        ) >= 3
    ),
    'report-to-paul', exists (
      select 1 from public.player_quest_state s
      where s.player_id = p_player and s.paul_reported_at is not null
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- report_to_paul() -> void (P5). Errors: not_authenticated, no_player,
-- quest_steps_incomplete.
-- ---------------------------------------------------------------------------

create or replace function public.report_to_paul()
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_steps jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.players p where p.id = v_uid) then
    raise exception 'no_player';
  end if;

  v_steps := public.quest_steps__pair_flaky_test(v_uid);
  if not (
    coalesce((v_steps ->> 'talk-to-paul')::boolean, false)
    and coalesce((v_steps ->> 'check-ci-board')::boolean, false)
    and coalesce((v_steps ->> 'pair-with-jger')::boolean, false)
    and coalesce((v_steps ->> 'squash-flakes')::boolean, false)
  ) then
    raise exception 'quest_steps_incomplete';
  end if;

  insert into public.player_quest_state as s (player_id, paul_reported_at)
  values (v_uid, now())
  on conflict (player_id) do update
    set paul_reported_at = coalesce(s.paul_reported_at, excluded.paul_reported_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Postgres grants EXECUTE to PUBLIC by default, and Supabase adds
-- anon and authenticated. quest_steps__pair_flaky_test takes a player id, so
-- no client role may execute it (registry R2).
-- ---------------------------------------------------------------------------

revoke all on function public.mark_paul_talked() from public, anon, authenticated;
revoke all on function public.mark_ci_board_checked() from public, anon, authenticated;
revoke all on function public.mark_paired() from public, anon, authenticated;
revoke all on function public.report_to_paul() from public, anon, authenticated;
revoke all on function public.quest_steps__pair_flaky_test(uuid) from public, anon, authenticated;

grant execute on function public.mark_paul_talked() to authenticated;
grant execute on function public.mark_ci_board_checked() to authenticated;
grant execute on function public.mark_paired() to authenticated;
grant execute on function public.report_to_paul() to authenticated;
