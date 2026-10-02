-- Stairs Challenge (#51 slice 4): the floor 0-5 climb up the Stairwell
-- (`design/Stairwell.dc.html`). The server logs each flight climbed in
-- order, pays 10 Tokens a flight up to 100 a day (America/New_York), and the
-- first full climb earns the Stair Master Badge (#138). Not a Minigame: it
-- has no timer, score, best or leaderboard, so record_round isn't used.
--
-- Runs after 20260928020000_phishing_quiz.sql (#146) and needs #9's
-- 20260924000000_players.sql, #27's 20260924010000_saved_progress.sql and
-- #138's 20260927000000_badges.sql (public.badges, public.award_badge). Apply
-- by pasting into the Supabase SQL editor (no CLI). Safe to rerun: if a paste
-- fails partway, fix the cause and rerun the whole file. Proof:
-- supabase/tests/51_stair_climb_proof.sql (run in PGlite by
-- src/persistence/sql-stair-climb.test.ts; the reviewer re-runs it on real
-- Postgres/Supabase).
--
-- Decisions for red-team review (#51 amendment 2, approved by @milliehime
-- 2026-09-29; round-2 red-team fold-in RT2-10, RT2-14, RT2-15). Each is
-- numbered so a review comment can cite it.
--
-- SC1 Scope. One new table (public.player_stair_climbs), two client RPCs
-- (log_stair_flight, stair_climb_progress), one internal helper (stair_day,
-- RT2-10) and one catalog update (SC14). It doesn't redefine record_round,
-- complete_quest, award_badge or any other existing object.
--
-- SC2 Preconditions: a DO block that runs before anything else. It raises
-- badge_award_missing if public.badges, public.award_badge(uuid,text) or
-- public.award_badge_if_available(uuid,text) doesn't exist (RT2-14);
-- stair_master_badge_missing if there's no 'stair-master' row; and
-- badge_award_executable if anon or authenticated may execute either award
-- function. Both roles inherit PUBLIC's grants, so this covers PUBLIC too.
-- Stated rule: award_badge must never be client-executable (#138 D4
-- "internal only"); if it is, this file stops and the fix goes back to #138.
--
-- SC3 Table public.player_stair_climbs, one row per Player who has started a
-- climb: player_id (primary key, references public.players, on delete
-- cascade), floor smallint not null (the last floor logged in the current
-- climb, so also the flights logged), updated_at timestamptz (when it was
-- logged), completed_at timestamptz null (the first full climb), tokens_day
-- date null (the Eastern date the tally belongs to) and tokens_today int not
-- null default 0. Columns are added with `add column if not exists` and no
-- inline checks; the named constraints player_stair_climbs_floor_check
-- (floor 0-5) and player_stair_climbs_tokens_today_check (0-100) are dropped
-- and re-added on every run (#27's rerun pattern).
--
-- SC4 RLS is enabled with no policies, and every privilege is revoked from
-- public, anon and authenticated (#146 P2: Supabase's default privileges
-- grant them everything on a new table, so the revokes are load-bearing). No
-- client role reads or writes the table; every read goes through SC13.
--
-- SC5 public.log_stair_flight(floor int) returns jsonb: plpgsql, security
-- definer, search_path = '', #variable_conflict use_column. The parameter is
-- copied straight into v_floor and every column is aliased. Identity comes
-- from auth.uid() only.
--
-- SC6 Errors (the message is the code): not_authenticated (42501),
-- invalid_floor (null or outside 0-5), no_player, plus award_badge's
-- unknown_badge and badge_unavailable.
--
-- SC7 Locking: the caller's public.players row `for update` first (the same
-- lock record_round, complete_quest and #146 P13 take, so parallel calls
-- serialize with each other and with them), then the climb row `for
-- update`; the floor-0 upsert runs under the players lock. award_badge's own
-- `for no key update` on the same row, in the same transaction, doesn't
-- block.
--
-- SC8 Floor 0 = (re)start: upsert floor = 0, updated_at = now(), keeping
-- completed_at and the tally. Returns logged = true, tokensAwarded = 0. The
-- server doesn't check where the Player came from: the client's start rule
-- (only a floor-0 arrival from the Map or from outside the Stairwell, UD-5)
-- is enforced by the client and bounded by SC16.
--
-- SC9 Floor k (1-5), checked in this order; each returns logged = false
-- with a reason and writes nothing: no row is not_started; floor >= k is
-- already_logged; floor < k-1 is out_of_order; now() - updated_at under
-- 2 seconds is too_soon.
--
-- SC10 Pay and the Eastern-day cap. v_today := public.stair_day(now()),
-- i.e. (now() at time zone 'America/New_York')::date. If tokens_day is
-- distinct from v_today the tally resets (tokens_day = v_today,
-- tokens_today = 0). v_pay := greatest(0, least(10, 100 - tokens_today)).
-- The row gets floor = k, updated_at = now(), tokens_today = tokens_today +
-- v_pay, and players.tokens gains v_pay. The day starts at 00:00 Eastern
-- inclusive, with daylight saving from tzdata (as #138's is_night_owl_time
-- and #146 P7). A flight past the cap is still logged and pays 0.
--
-- SC11 Completion (k = 5): v_first := completed_at is null, then
-- completed_at = coalesce(completed_at, now()). If v_first, it calls
-- public.award_badge(v_uid, 'stair-master'): the explicit reward path, so it
-- raises if the Badge is unavailable and the whole call rolls back (the #121
-- precedent). award_badge pays the +50, which doesn't count toward
-- tokens_today or tokensAwarded. When it returns true, badgesEarned =
-- {stair-master}.
--
-- SC12 Returns { logged, reason, flightsLogged, tokensAwarded,
-- flightTokensToday, badgesEarned (text[], default '{}'), balance } on every
-- path, logged = false included. reason is null when logged. balance is
-- re-read from players after any award (#138's contract).
--
-- SC13 public.stair_climb_progress() returns jsonb, stable, security definer,
-- search_path = '': { flightsLogged, completed, flightTokensToday } for
-- auth.uid(), with flightTokensToday = 0 when tokens_day isn't today
-- (Eastern), and the defaults (0, false, 0) when there's no row. Raises
-- not_authenticated (42501) for anon.
--
-- SC14 Stair Master on: `update public.badges set available = true where id =
-- 'stair-master';` (#138 seeded it coming soon; its insert never touches
-- `available` on conflict, so rerunning #138 keeps it on). The client mirrors
-- it in src/persistence/badge-catalog.ts (BADGE_CATALOG's entry is available,
-- and 'stair-master' is in BADGE_AVAILABILITY_OVERRIDES).
--
-- SC15 Grants: EXECUTE on log_stair_flight(int) and stair_climb_progress()
-- is revoked from public, anon and authenticated, then granted to
-- authenticated only. stair_day(timestamptz) stays internal, as award_badge
-- does. One overload each; if a signature ever changes, add a `drop function
-- if exists` for the old one.
--
-- SC16 Accepted risk (HD-8, accepted 2026-09-27). Movement is
-- client-authoritative, so a signed-in Player can script log_stair_flight
-- calls and collect up to the 100-Token daily flight cap, plus Stair
-- Master's +50 once. Order, pacing (2 s), the daily cap and the once-only
-- award are enforced here. This knowingly departs from #138's "a client
-- can't award itself a Badge or the +50" for this one Badge, as accepted for
-- #140 and #154.
--
-- SC17 Reruns and deploy order (#138 D15). Every statement is idempotent
-- (create table if not exists, add column if not exists, drop/re-add named
-- constraints, enable RLS, revoke, create or replace, a plain update,
-- revoke/grant); rerunning keeps every Player's climb. After rerunning any
-- earlier migration, rerun every later one in timestamp order. Apply this
-- file before the client that calls these functions merges or deploys
-- (including a Vercel preview): without it the client logs each failure and
-- the climb panel shows the design's lines without the count.

-- ---------------------------------------------------------------------------
-- Preconditions (SC2): runs first, before any object is created or changed.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.badges') is null
    or to_regprocedure('public.award_badge(uuid,text)') is null
    or to_regprocedure('public.award_badge_if_available(uuid,text)') is null then
    raise exception 'badge_award_missing';
  end if;
  if not exists (select 1 from public.badges b where b.id = 'stair-master') then
    raise exception 'stair_master_badge_missing';
  end if;
  if has_function_privilege('anon', 'public.award_badge(uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.award_badge(uuid,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.award_badge_if_available(uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.award_badge_if_available(uuid,text)', 'EXECUTE') then
    raise exception 'badge_award_executable';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Table (SC3, SC4)
-- ---------------------------------------------------------------------------

create table if not exists public.player_stair_climbs (
  player_id uuid primary key references public.players (id) on delete cascade
);

alter table public.player_stair_climbs
  add column if not exists floor smallint not null default 0,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz null,
  add column if not exists tokens_day date null,
  add column if not exists tokens_today int not null default 0;

alter table public.player_stair_climbs
  drop constraint if exists player_stair_climbs_floor_check,
  drop constraint if exists player_stair_climbs_tokens_today_check;
alter table public.player_stair_climbs
  add constraint player_stair_climbs_floor_check check (floor between 0 and 5),
  add constraint player_stair_climbs_tokens_today_check check (tokens_today between 0 and 100);

alter table public.player_stair_climbs enable row level security;

revoke all on table public.player_stair_climbs from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- stair_day(at_time) -> date (SC10, RT2-10)
--
-- The America/New_York calendar day `at_time` falls on, daylight saving from
-- tzdata. Internal only; the proof checks it at fixed instants.
-- ---------------------------------------------------------------------------

create or replace function public.stair_day(at_time timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (stair_day.at_time at time zone 'America/New_York')::date
$$;

-- ---------------------------------------------------------------------------
-- log_stair_flight(floor) -> { logged, reason, flightsLogged, tokensAwarded,
-- flightTokensToday, badgesEarned, balance } (SC5-SC12)
-- ---------------------------------------------------------------------------

create or replace function public.log_stair_flight(floor int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_floor int := log_stair_flight.floor;
  v_today date := public.stair_day(now());
  v_found boolean;
  v_row_floor int;
  v_row_updated_at timestamptz;
  v_row_completed_at timestamptz;
  v_row_tokens_day date;
  v_row_tokens_today int;
  v_tally int;
  v_pay int := 0;
  v_logged boolean := false;
  v_reason text := null;
  v_badges text[] := '{}';
  v_flights int := 0;
  v_tokens_today int := 0;
  v_balance int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_floor is null or v_floor < 0 or v_floor > 5 then
    raise exception 'invalid_floor';
  end if;

  -- SC7: the Player's row first, then their climb.
  perform 1 from public.players p where p.id = v_uid for update;
  if not found then
    raise exception 'no_player';
  end if;

  select c.floor, c.updated_at, c.completed_at, c.tokens_day, c.tokens_today
    into v_row_floor, v_row_updated_at, v_row_completed_at, v_row_tokens_day, v_row_tokens_today
  from public.player_stair_climbs c
  where c.player_id = v_uid
  for update;
  v_found := found;

  if v_floor = 0 then
    -- SC8: a (re)start, keeping completed_at and the tally.
    insert into public.player_stair_climbs as c (player_id, floor, updated_at)
    values (v_uid, 0, now())
    on conflict (player_id) do update
      set floor = 0, updated_at = now();
    v_logged := true;
  elsif not v_found then
    v_reason := 'not_started';
  elsif v_row_floor >= v_floor then
    v_reason := 'already_logged';
  elsif v_row_floor < v_floor - 1 then
    v_reason := 'out_of_order';
  elsif now() - v_row_updated_at < interval '2 seconds' then
    v_reason := 'too_soon';
  else
    -- SC10: the Eastern-day tally, reset on a new day, and the clamped pay.
    v_tally := case when v_row_tokens_day is distinct from v_today then 0 else v_row_tokens_today end;
    v_pay := greatest(0, least(10, 100 - v_tally));

    update public.player_stair_climbs c
    set floor = v_floor,
        updated_at = now(),
        completed_at = case when v_floor = 5 then coalesce(c.completed_at, now()) else c.completed_at end,
        tokens_day = v_today,
        tokens_today = v_tally + v_pay
    where c.player_id = v_uid;

    -- SC11: Stair Master on the first full climb, through #138's award_badge.
    if v_floor = 5 and v_row_completed_at is null then
      if public.award_badge(v_uid, 'stair-master') then
        v_badges := array_append(v_badges, 'stair-master');
      end if;
    end if;

    update public.players p
    set tokens = p.tokens + v_pay
    where p.id = v_uid;
    v_logged := true;
  end if;

  -- SC12: the climb as it stands now, and the balance after any award.
  select c.floor,
         case when c.tokens_day = v_today then c.tokens_today else 0 end
    into v_flights, v_tokens_today
  from public.player_stair_climbs c
  where c.player_id = v_uid;
  if not found then
    v_flights := 0;
    v_tokens_today := 0;
  end if;
  select p.tokens into v_balance from public.players p where p.id = v_uid;

  return jsonb_build_object(
    'logged', v_logged,
    'reason', v_reason,
    'flightsLogged', v_flights,
    'tokensAwarded', v_pay,
    'flightTokensToday', v_tokens_today,
    'badgesEarned', to_jsonb(v_badges),
    'balance', v_balance
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- stair_climb_progress() -> { flightsLogged, completed, flightTokensToday }
-- (SC13)
-- ---------------------------------------------------------------------------

create or replace function public.stair_climb_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_floor int;
  v_completed_at timestamptz;
  v_tokens_day date;
  v_tokens_today int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select c.floor, c.completed_at, c.tokens_day, c.tokens_today
    into v_floor, v_completed_at, v_tokens_day, v_tokens_today
  from public.player_stair_climbs c
  where c.player_id = v_uid;
  if not found then
    return jsonb_build_object('flightsLogged', 0, 'completed', false, 'flightTokensToday', 0);
  end if;

  return jsonb_build_object(
    'flightsLogged', v_floor,
    'completed', v_completed_at is not null,
    'flightTokensToday',
      case when v_tokens_day = public.stair_day(now()) then v_tokens_today else 0 end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Stair Master on (SC14)
-- ---------------------------------------------------------------------------

update public.badges set available = true where id = 'stair-master';

-- ---------------------------------------------------------------------------
-- Grants (SC15). Postgres grants EXECUTE to PUBLIC by default, and Supabase
-- adds anon and authenticated. stair_day stays internal.
-- ---------------------------------------------------------------------------

revoke all on function public.stair_day(timestamptz) from public, anon, authenticated;
revoke all on function public.log_stair_flight(int) from public, anon, authenticated;
revoke all on function public.stair_climb_progress() from public, anon, authenticated;
grant execute on function public.log_stair_flight(int) to authenticated;
grant execute on function public.stair_climb_progress() to authenticated;
