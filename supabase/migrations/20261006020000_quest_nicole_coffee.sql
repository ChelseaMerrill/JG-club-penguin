-- Quest "Bring Nicole a coffee before kickoff" (#141, part of #129): the
-- Player talks to Nicole in The Icebox, goes to The Kitchen, asks Tom for
-- her oat latte and carries it back within 1:00. 75 Tokens, paid once by
-- 20261006000000_quest_registry.sql's complete_quest('nicole-coffee').
--
-- Runs after 20261006000000_quest_registry.sql (the shared Quest registry,
-- #143) and needs it plus #9's 20260924000000_players.sql. A sibling Quest's
-- migration (#143, 20261006010000) may sort between the two; neither depends
-- on the other. Apply by pasting into the Supabase SQL editor (no CLI). Safe
-- to rerun. Proof: supabase/tests/quest_nicole_coffee_proof.sql (run in
-- PGlite by src/persistence/sql-quest-nicole-coffee.test.ts; the reviewer
-- re-runs it on real Postgres/Supabase).
--
-- Following the registry's rules for a new steps Quest, this file adds ONLY
-- its public.quests row, its quest_steps__nicole_coffee function, its own
-- state table and its RPCs. It never redefines complete_quest or
-- quest_progress: both read public.quests, so the Quest is reported in
-- quest_progress().questSteps and paid as soon as this file is applied.
--
-- Deploy order (#138 D15): apply this migration before the client that
-- calls its RPCs merges or deploys. An old client on this schema ignores the
-- new Quest's questSteps entry. A new client on an old schema sees no
-- 'nicole-coffee' steps (every step reads as not met) and its coffee RPC
-- calls fail, so the Quest can't be started; nothing else breaks.
--
-- Decisions (execution packet for #141, 2026-10-06). Each is numbered so a
-- review comment can cite it.
--
-- C1 The Quest's row: public.quests ('nicole-coffee', 75), upserted so a
-- rerun refreshes the reward. Mirrored by the 'nicole-coffee' entry in
-- src/quests/quest-definitions.ts (rewardTokens) and the in-memory fake's
-- registration in src/persistence/in-memory-steps-quests.ts.
--
-- C2 State: public.player_coffee_runs, one row per Player, written only by
-- the security-definer RPCs below (the table is SELECT-only for its owner,
-- as #46's player_quest_state). Every time is the server's own now():
--   talked_at            set once, when the Player first talks to Nicole (the row's creation)
--   kitchen_visited_at   set once, on the first Kitchen visit after talking to her
--   handed_over_at       when Tom handed over the cup now being carried; replaced by a new ask once that cup has gone cold
--   delivered_at         set once, when Nicole accepted a cup still within the limit
--
-- C3 The limit is 60 s from handed_over_at, by the server's clock. A
-- delivery is accepted up to 65 s after it: 60 s plus 5 s of grace for the
-- round trips of the ask and the delivery (and a slow Map transition) that
-- the Player's own 1:00 countdown doesn't see. The client's countdown is
-- display only: no RPC takes a time, a duration or a "still hot" flag from
-- the client, and the client can't write the table (C2), so a tampered
-- client timer changes nothing. now() is the transaction's start time, so
-- every check in one call sees one instant.
--
-- C4 Steps (public.quest_steps__nicole_coffee, the client's step ids in
-- src/quests/quest-definitions.ts):
--   talk-to-nicole   a player_coffee_runs row exists
--   visit-kitchen    kitchen_visited_at is not null
--   ask-tom          delivered_at is not null, or handed_over_at is within the 60 s limit
--   carry-coffee     delivered_at is not null (carried back in time)
--   deliver-coffee   delivered_at is not null
-- So all five are true only after a successful delivery, and steps 3-5
-- reset on their own once a cup goes past 60 s undelivered: no write is
-- needed to "reset", and nothing is lost (talk-to-nicole and visit-kitchen
-- stay done, the Player just asks Tom again, no penalty). The 5 s grace
-- (C3) applies only to accepting a delivery, never to the steps or the
-- countdown, so the Player never sees a cup that is "cold" on screen but
-- still counted as carried.
--
-- C5 The RPCs (identity from auth.uid() only; every one returns the
-- caller's coffee run, C6):
--   coffee_run()            read only
--   start_coffee_run()      talking to Nicole starts it; a repeat keeps the first talk
--   mark_kitchen_visited()  needs the run started; a repeat keeps the first visit
--   ask_tom_for_coffee()    needs the run started; hands over a fresh cup (now()) when
--                           none is being carried or the last one is past 60 s; while
--                           a cup is still hot, or once delivered, it changes nothing
--                           (so re-asking can't extend a running timer). Asking Tom
--                           also counts as the Kitchen visit (he is in the Kitchen).
--   deliver_coffee()        needs the run started and a cup handed over; accepts only
--                           within 65 s (C3), else raises coffee_cold and writes
--                           nothing (steps 3-5 already read as reset, C4); once
--                           delivered, a repeat changes nothing.
-- Paying is still complete_quest('nicole-coffee')'s job (registry R5): the
-- client claims it once quest_progress reports all five steps.
--
-- C6 The coffee run (jsonb, built by the internal coffee_run_state):
--   { talkedToNicole: bool, kitchenVisited: bool, delivered: bool,
--     handedOverAt: timestamptz | null, secondsLeft: number | null }
-- handedOverAt and secondsLeft (60 minus the seconds since the hand-over,
-- by the server's clock) are null unless a cup is being carried within the
-- 60 s limit. The client starts its countdown from secondsLeft, so a
-- difference between the two clocks never shows.
--
-- C7 Errors (the message is the code, as #46 Q4):
--   not_authenticated (errcode 42501)  no auth.uid()
--   no_player                          start_coffee_run with no public.players row for the caller
--   coffee_not_started                 mark_kitchen_visited, ask_tom_for_coffee or deliver_coffee before start_coffee_run
--   coffee_not_carrying                deliver_coffee before Tom handed over any cup
--   coffee_cold                        deliver_coffee more than 65 s after the hand-over (C3); nothing is written
-- Mirrored by PROGRESS_ERROR_CODES in src/persistence/progress-store.ts.
--
-- Residual risk (stated plainly, as #46 Q2): the server can't know the
-- Penguin really walked from the Kitchen to The Icebox; a signed-in Player
-- could call ask_tom_for_coffee and deliver_coffee back to back. What the
-- server does enforce is the order (talk, then ask, then deliver), the
-- 65 s window by its own clock, and the one-time 75-Token payment.
--
-- Conventions (the leaderboard migration's D5): every function is security
-- definer with set search_path = '', every relation schema-qualified,
-- #variable_conflict use_column, identity from auth.uid() only in client-
-- callable functions, EXECUTE revoked from public/anon/authenticated and
-- granted back to authenticated only where stated.

-- ---------------------------------------------------------------------------
-- The Quest's registry row (C1)
-- ---------------------------------------------------------------------------

insert into public.quests (id, reward_tokens) values
  ('nicole-coffee', 75)
on conflict (id) do update
  set reward_tokens = excluded.reward_tokens;

-- ---------------------------------------------------------------------------
-- public.player_coffee_runs (C2)
-- ---------------------------------------------------------------------------

create table if not exists public.player_coffee_runs (
  player_id uuid primary key references public.players (id) on delete cascade,
  talked_at timestamptz not null default now(),
  kitchen_visited_at timestamptz null,
  handed_over_at timestamptz null,
  delivered_at timestamptz null
);

alter table public.player_coffee_runs enable row level security;

drop policy if exists "player_coffee_runs select own rows" on public.player_coffee_runs;
create policy "player_coffee_runs select own rows"
  on public.player_coffee_runs for select to authenticated
  using (auth.uid() = player_id);

-- Read-only for the owner, nothing for anon. The functions below do every write.
revoke all on public.player_coffee_runs from anon, authenticated;
grant select on public.player_coffee_runs to authenticated;

-- ---------------------------------------------------------------------------
-- coffee_run_state(p_player) -> jsonb (C6). Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.coffee_run_state(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run public.player_coffee_runs%rowtype;
  v_carrying boolean;
begin
  select * into v_run from public.player_coffee_runs r where r.player_id = p_player;
  if not found then
    return jsonb_build_object(
      'talkedToNicole', false,
      'kitchenVisited', false,
      'delivered', false,
      'handedOverAt', null,
      'secondsLeft', null
    );
  end if;

  -- C3/C6: a cup is being carried while it is undelivered and within 60 s.
  v_carrying := v_run.delivered_at is null
    and v_run.handed_over_at is not null
    and now() - v_run.handed_over_at <= interval '60 seconds';

  return jsonb_build_object(
    'talkedToNicole', true,
    'kitchenVisited', v_run.kitchen_visited_at is not null,
    'delivered', v_run.delivered_at is not null,
    'handedOverAt', case when v_carrying then to_jsonb(v_run.handed_over_at) else null end,
    'secondsLeft', case
      when v_carrying then to_jsonb(
        greatest(0, 60 - extract(epoch from (now() - v_run.handed_over_at)))
      )
      else null
    end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- quest_steps__nicole_coffee(p_player) -> jsonb (registry R2, C4). Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.quest_steps__nicole_coffee(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run public.player_coffee_runs%rowtype;
  v_delivered boolean;
begin
  select * into v_run from public.player_coffee_runs r where r.player_id = p_player;
  if not found then
    return jsonb_build_object(
      'talk-to-nicole', false,
      'visit-kitchen', false,
      'ask-tom', false,
      'carry-coffee', false,
      'deliver-coffee', false
    );
  end if;

  v_delivered := v_run.delivered_at is not null;
  return jsonb_build_object(
    'talk-to-nicole', true,
    'visit-kitchen', v_run.kitchen_visited_at is not null,
    'ask-tom', v_delivered or (
      v_run.handed_over_at is not null
      and now() - v_run.handed_over_at <= interval '60 seconds'
    ),
    'carry-coffee', v_delivered,
    'deliver-coffee', v_delivered
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- coffee_run() -> jsonb (C5). Read only. Errors: not_authenticated.
-- ---------------------------------------------------------------------------

create or replace function public.coffee_run()
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
  return public.coffee_run_state(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- start_coffee_run() -> jsonb (C5): talking to Nicole.
-- Errors: not_authenticated, no_player.
-- ---------------------------------------------------------------------------

create or replace function public.start_coffee_run()
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

  insert into public.player_coffee_runs (player_id, talked_at)
  values (v_uid, now())
  on conflict (player_id) do nothing;

  return public.coffee_run_state(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_kitchen_visited() -> jsonb (C5).
-- Errors: not_authenticated, coffee_not_started.
-- ---------------------------------------------------------------------------

create or replace function public.mark_kitchen_visited()
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

  update public.player_coffee_runs r
  set kitchen_visited_at = coalesce(r.kitchen_visited_at, now())
  where r.player_id = v_uid;
  if not found then
    raise exception 'coffee_not_started';
  end if;

  return public.coffee_run_state(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- ask_tom_for_coffee() -> jsonb (C5): Tom hands over a fresh cup.
-- Errors: not_authenticated, coffee_not_started.
-- ---------------------------------------------------------------------------

create or replace function public.ask_tom_for_coffee()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_run public.player_coffee_runs%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Locked so two parallel asks hand over one cup, one after the other.
  select * into v_run
  from public.player_coffee_runs r
  where r.player_id = v_uid
  for update;
  if not found then
    raise exception 'coffee_not_started';
  end if;

  if v_run.delivered_at is null
    and (v_run.handed_over_at is null
      or now() - v_run.handed_over_at > interval '60 seconds') then
    update public.player_coffee_runs r
    set handed_over_at = now(),
        kitchen_visited_at = coalesce(r.kitchen_visited_at, now())
    where r.player_id = v_uid;
  end if;

  return public.coffee_run_state(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- deliver_coffee() -> jsonb (C5): Nicole takes the cup, if it is still hot.
-- Errors: not_authenticated, coffee_not_started, coffee_not_carrying,
-- coffee_cold.
-- ---------------------------------------------------------------------------

create or replace function public.deliver_coffee()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_run public.player_coffee_runs%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_run
  from public.player_coffee_runs r
  where r.player_id = v_uid
  for update;
  if not found then
    raise exception 'coffee_not_started';
  end if;

  if v_run.delivered_at is not null then
    return public.coffee_run_state(v_uid);
  end if;

  if v_run.handed_over_at is null then
    raise exception 'coffee_not_carrying';
  end if;

  -- C3: 60 s plus 5 s of grace, by the server's own clock.
  if now() - v_run.handed_over_at > interval '65 seconds' then
    raise exception 'coffee_cold';
  end if;

  update public.player_coffee_runs r
  set delivered_at = now()
  where r.player_id = v_uid;

  return public.coffee_run_state(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Postgres grants EXECUTE to PUBLIC by default, and Supabase adds
-- anon and authenticated. coffee_run_state and the steps function take a
-- player id, so no client role may execute them (registry R2). If a
-- signature ever changes, add `drop function if exists` for the old one
-- first.
-- ---------------------------------------------------------------------------

revoke all on function public.coffee_run_state(uuid) from public, anon, authenticated;
revoke all on function public.quest_steps__nicole_coffee(uuid) from public, anon, authenticated;
revoke all on function public.coffee_run() from public, anon, authenticated;
revoke all on function public.start_coffee_run() from public, anon, authenticated;
revoke all on function public.mark_kitchen_visited() from public, anon, authenticated;
revoke all on function public.ask_tom_for_coffee() from public, anon, authenticated;
revoke all on function public.deliver_coffee() from public, anon, authenticated;

grant execute on function public.coffee_run() to authenticated;
grant execute on function public.start_coffee_run() to authenticated;
grant execute on function public.mark_kitchen_visited() to authenticated;
grant execute on function public.ask_tom_for_coffee() to authenticated;
grant execute on function public.deliver_coffee() to authenticated;
