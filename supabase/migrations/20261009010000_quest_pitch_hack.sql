-- Quest "Pitch your hack in under 60 seconds" (#142): the Player talks to
-- Linda Martin in The Icebox, then pitches her hack (Problem/Solution/Ask)
-- before the clock runs out. 75 Tokens, no Badge, paid once by
-- 20261006000000_quest_registry.sql's complete_quest('pitch-hack').
--
-- Runs after 20261006000000_quest_registry.sql (the shared Quest registry,
-- #143) and needs it plus #9's 20260924000000_players.sql. A sibling Quest's
-- migration (#140, 20261009000000_quest_pair_flaky_test.sql) may sort
-- between the two; neither depends on the other. Apply by pasting into the
-- Supabase SQL editor (no CLI). Safe to rerun. Proof:
-- supabase/tests/quest_pitch_hack_proof.sql (run in PGlite by
-- src/persistence/sql-quest-pitch-hack.test.ts; the reviewer re-runs it on
-- real Postgres/Supabase).
--
-- Following the registry's rules for a new steps Quest, this file adds ONLY
-- its public.quests row, its quest_steps__pitch_hack function, its own state
-- table and its RPCs. It never redefines complete_quest or quest_progress:
-- both read public.quests, so the Quest is reported in
-- quest_progress().questSteps and paid as soon as this file is applied.
--
-- Deploy order (#138 D15): apply this migration before the client that
-- calls its RPCs merges or deploys. An old client on this schema ignores the
-- new Quest's questSteps entry. A new client on an old schema sees no
-- 'pitch-hack' steps (every step reads as not met) and its pitch RPC calls
-- fail, so the Quest can't be started; nothing else breaks.
--
-- Decisions (execution packet for #142, 2026-10-09). Each is numbered so a
-- review comment can cite it.
--
-- P1 The Quest's row: public.quests ('pitch-hack', 75), upserted so a rerun
-- refreshes the reward. Mirrored by the 'pitch-hack' entry in
-- src/quests/quest-definitions.ts (rewardTokens) and the in-memory fake's
-- registration in src/persistence/in-memory-steps-quests.ts.
--
-- P2 State: public.player_pitch_runs, one row per Player, written only by
-- the security-definer RPCs below (the table is SELECT-only for its owner,
-- as #46's player_quest_state and #141's player_coffee_runs). Every time is
-- the server's own now():
--   talked_at     set once, when the Player first talks to Linda (mark_linda_talked)
--   started_at    when the current attempt's 60 s clock started (start_pitch);
--                 cleared (null) once that attempt is scored, win or lose
--   passed_at     set once, the first time a pitch is accepted within time
--   best_seconds  the fastest accepted pitch's whole seconds, kept across replays
--
-- P3 The limit is 60 s from started_at, by the server's clock. A pitch is
-- accepted up to 65 s after the start: 60 s plus 5 s of grace for the round
-- trip of the submit call (and a slow client) that the Player's own 60 s
-- countdown doesn't see. The client's countdown is display only: no RPC
-- takes a time or a duration from the client, and the client can't write
-- the table (P2), so a tampered client timer changes nothing. now() is the
-- transaction's start time, so every check in one call sees one instant.
--
-- P4 Steps (public.quest_steps__pitch_hack, the client's step ids in
-- src/quests/quest-definitions.ts):
--   talk-to-linda    talked_at is not null
--   pitch-under-60   passed_at is not null (Linda's reaction to a sub-20 s
--                    pitch is shown client-side as part of passing this
--                    step, not a separate server step)
--
-- P5 The RPCs (identity from auth.uid() only; every one but submit_pitch
-- returns the caller's pitch run, P6; submit_pitch returns only the
-- accepted attempt's seconds, P7):
--   mark_linda_talked()           talking to Linda; coalesces talked_at,
--                                  so a repeat keeps the first talk
--   start_pitch()                 needs talked_at (else pitch_not_started);
--                                  sets started_at = now(). Each call resets
--                                  the 60 s clock, so a replay after passing
--                                  (allowed, for practice) starts a fresh
--                                  attempt; it never pays again (paying is
--                                  complete_quest's, registry R5, and the
--                                  Quest is already completed by then)
--   submit_pitch(problem, solution, ask)
--                                  each argument must be 0, 1 or 2 (the
--                                  overlay's three choices per row), else
--                                  invalid_pitch; needs an active
--                                  started_at (else pitch_not_started);
--                                  accepted only within 65 s of started_at
--                                  (P3), else raises pitch_timeout and
--                                  writes nothing; on success, clears
--                                  started_at, sets passed_at (first time
--                                  only) and best_seconds (the faster of
--                                  this attempt and any earlier one)
--   pitch_run()                   read only
-- Paying is still complete_quest('pitch-hack')'s job (registry R5): the
-- client claims it once quest_progress reports both steps.
--
-- P6 The pitch run (jsonb, built by the internal pitch_run_state):
--   { talkedToLinda: bool, passed: bool, bestSeconds: number | null }
-- No "is an attempt currently running" flag: the overlay's own countdown
-- (started by its own call to start_pitch) is the only place that state is
-- shown, so there is nothing to resume across a reload.
--
-- P7 submit_pitch's success reply: { seconds: <whole seconds taken,
-- floored> }. The server's clock is the only clock: the overlay's reaction
-- ("Closed. Sign here." under 20 s, "Smile. It's working." otherwise) is
-- picked client-side from this number, never from the client's own
-- countdown.
--
-- P8 Errors (the message is the code, as #46 Q4 and #141 C7):
--   not_authenticated (errcode 42501)  no auth.uid()
--   no_player                          mark_linda_talked with no public.players row for the caller
--   pitch_not_started                  start_pitch before mark_linda_talked, or submit_pitch
--                                       before start_pitch (or after it was already scored)
--   invalid_pitch                      submit_pitch with an argument outside 0-2
--   pitch_timeout                      submit_pitch more than 65 s (60 s plus 5 s of grace)
--                                       after started_at; nothing is written
-- Mirrored by PROGRESS_ERROR_CODES in src/persistence/progress-store.ts.
--
-- Residual risk (stated plainly, as #46 Q2 and #141's own note): the server
-- can't know the Player actually read the three rows before submitting; what
-- it does enforce is the order (talk, then start, then submit), the 65 s
-- window by its own clock, that each choice is one of the three offered, and
-- the one-time 75-Token payment.
--
-- Conventions (the leaderboard migration's D5): every function is security
-- definer with set search_path = '', every relation schema-qualified,
-- #variable_conflict use_column, identity from auth.uid() only in client-
-- callable functions, EXECUTE revoked from public/anon/authenticated and
-- granted back to authenticated only where stated.

-- ---------------------------------------------------------------------------
-- The Quest's registry row (P1)
-- ---------------------------------------------------------------------------

insert into public.quests (id, reward_tokens) values
  ('pitch-hack', 75)
on conflict (id) do update
  set reward_tokens = excluded.reward_tokens;

-- ---------------------------------------------------------------------------
-- public.player_pitch_runs (P2)
-- ---------------------------------------------------------------------------

create table if not exists public.player_pitch_runs (
  player_id uuid primary key references public.players (id) on delete cascade,
  talked_at timestamptz null,
  started_at timestamptz null,
  passed_at timestamptz null,
  best_seconds int null
);

alter table public.player_pitch_runs enable row level security;

drop policy if exists "player_pitch_runs select own rows" on public.player_pitch_runs;
create policy "player_pitch_runs select own rows"
  on public.player_pitch_runs for select to authenticated
  using (auth.uid() = player_id);

-- Read-only for the owner, nothing for anon. The functions below do every write.
revoke all on public.player_pitch_runs from anon, authenticated;
grant select on public.player_pitch_runs to authenticated;

-- ---------------------------------------------------------------------------
-- pitch_run_state(p_player) -> jsonb (P6). Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.pitch_run_state(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run public.player_pitch_runs%rowtype;
begin
  select * into v_run from public.player_pitch_runs r where r.player_id = p_player;
  if not found then
    return jsonb_build_object('talkedToLinda', false, 'passed', false, 'bestSeconds', null);
  end if;

  return jsonb_build_object(
    'talkedToLinda', v_run.talked_at is not null,
    'passed', v_run.passed_at is not null,
    'bestSeconds', v_run.best_seconds
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- quest_steps__pitch_hack(p_player) -> jsonb (registry R2, P4). Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.quest_steps__pitch_hack(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run public.player_pitch_runs%rowtype;
begin
  select * into v_run from public.player_pitch_runs r where r.player_id = p_player;
  if not found then
    return jsonb_build_object('talk-to-linda', false, 'pitch-under-60', false);
  end if;

  return jsonb_build_object(
    'talk-to-linda', v_run.talked_at is not null,
    'pitch-under-60', v_run.passed_at is not null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_linda_talked() -> jsonb (P5): talking to Linda.
-- Errors: not_authenticated, no_player.
-- ---------------------------------------------------------------------------

create or replace function public.mark_linda_talked()
returns jsonb
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

  insert into public.player_pitch_runs (player_id, talked_at)
  values (v_uid, now())
  on conflict (player_id) do update
    set talked_at = coalesce(public.player_pitch_runs.talked_at, excluded.talked_at);

  return public.pitch_run_state(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- start_pitch() -> jsonb (P5): opens the overlay's 60 s clock.
-- Errors: not_authenticated, pitch_not_started.
-- ---------------------------------------------------------------------------

create or replace function public.start_pitch()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_run public.player_pitch_runs%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_run from public.player_pitch_runs r where r.player_id = v_uid for update;
  if not found or v_run.talked_at is null then
    raise exception 'pitch_not_started';
  end if;

  update public.player_pitch_runs r
  set started_at = now()
  where r.player_id = v_uid;

  return public.pitch_run_state(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_pitch(problem, solution, ask) -> jsonb { seconds } (P5/P7): Linda
-- hears the pitch, if it lands within 65 s of start_pitch.
-- Errors: not_authenticated, invalid_pitch, pitch_not_started, pitch_timeout.
-- ---------------------------------------------------------------------------

create or replace function public.submit_pitch(problem int, solution int, ask int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_run public.player_pitch_runs%rowtype;
  v_seconds int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if problem not in (0, 1, 2) or solution not in (0, 1, 2) or ask not in (0, 1, 2) then
    raise exception 'invalid_pitch';
  end if;

  select * into v_run
  from public.player_pitch_runs r
  where r.player_id = v_uid
  for update;
  if not found or v_run.started_at is null then
    raise exception 'pitch_not_started';
  end if;

  -- P3: 60 s plus 5 s of grace, by the server's own clock.
  if now() - v_run.started_at > interval '65 seconds' then
    raise exception 'pitch_timeout';
  end if;

  v_seconds := floor(extract(epoch from (now() - v_run.started_at)))::int;

  update public.player_pitch_runs r
  set started_at = null,
      passed_at = coalesce(r.passed_at, now()),
      best_seconds = least(coalesce(r.best_seconds, v_seconds), v_seconds)
  where r.player_id = v_uid;

  return jsonb_build_object('seconds', v_seconds);
end;
$$;

-- ---------------------------------------------------------------------------
-- pitch_run() -> jsonb (P5/P6). Read only. Errors: not_authenticated.
-- ---------------------------------------------------------------------------

create or replace function public.pitch_run()
returns jsonb
language plpgsql
stable
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
  return public.pitch_run_state(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Postgres grants EXECUTE to PUBLIC by default, and Supabase adds
-- anon and authenticated. pitch_run_state and the steps function take a
-- player id, so no client role may execute them (registry R2). If a
-- signature ever changes, add `drop function if exists` for the old one
-- first.
-- ---------------------------------------------------------------------------

revoke all on function public.pitch_run_state(uuid) from public, anon, authenticated;
revoke all on function public.quest_steps__pitch_hack(uuid) from public, anon, authenticated;
revoke all on function public.mark_linda_talked() from public, anon, authenticated;
revoke all on function public.start_pitch() from public, anon, authenticated;
revoke all on function public.submit_pitch(int, int, int) from public, anon, authenticated;
revoke all on function public.pitch_run() from public, anon, authenticated;

grant execute on function public.mark_linda_talked() to authenticated;
grant execute on function public.start_pitch() to authenticated;
grant execute on function public.submit_pitch(int, int, int) to authenticated;
grant execute on function public.pitch_run() to authenticated;
