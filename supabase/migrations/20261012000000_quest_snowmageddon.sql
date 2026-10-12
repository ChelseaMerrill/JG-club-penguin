-- Quest "Snowmageddon: hit 5 penguins today" (#154, part of #129): hit 5
-- different Players with snowballs in one Eastern calendar day. No giver,
-- active from the start. Reward: 75 Tokens plus the Snowmageddon Badge's
-- standard first-time +50 (#138), 125 Tokens total.
--
-- Runs after 20261011000000_stair_climb.sql (#51 slice 4) and needs
-- 20261006000000_quest_registry.sql (the shared registry, #143) and #138's
-- 20260927000000_badges.sql (public.badges, public.award_badge). Apply by
-- pasting into the Supabase SQL editor (no CLI). Safe to rerun. Proof:
-- supabase/tests/quest_snowmageddon_proof.sql (run in PGlite by
-- src/persistence/sql-quest-snowmageddon.test.ts; the reviewer re-runs it on
-- real Postgres/Supabase).
--
-- Deploy order (the registry's own rule): apply this migration before the
-- client that lists the 'snowmageddon' Quest or calls `record_snowball_hit`
-- merges or deploys (including a Vercel preview). An old client on this
-- schema keeps working (it never calls `record_snowball_hit` and never reads
-- `public.quests`); a new client on an old server (this migration not yet
-- applied) sees `questSteps['snowmageddon']` read as `{}` (the registry's
-- `quest_steps_for` fallback, so the Quest always shows 0 / 5) and every
-- `record_snowball_hit` call fails outright -- caught and ignored by the
-- client (D5 below) -- so nothing is paid early and nothing else breaks.
--
-- Decisions (orchestrator execution packet for #154, 2026-10-12, resolving
-- the ticket against the registry's own rule -- flagged for milliehime's
-- 30-minute red-team per the ticket's "Shared rules"). Each is numbered so a
-- review comment can cite it.
--
-- S1 The registry row. `insert ... on conflict (id) do update` exactly as
-- the registry's own rule requires (R1): `('snowmageddon', 75)`.
--
-- S2 `public.snowball_hits`: one row per counted hit -- thrower_id, target_id,
-- throw_id, day (the Eastern calendar day, S3) and created_at. Named
-- constraints (#27's rerun pattern, also SC3's): unique (thrower_id,
-- target_id, day) so a repeat target in one Eastern day never counts twice,
-- and unique (throw_id) so one real snowball throw can never be replayed
-- against a different target. RLS on; no insert/update/delete policy at all
-- (every write goes through S4's security-definer RPC, which bypasses RLS as
-- its owner); the one select policy lets either party -- the thrower or the
-- target -- read a row naming them, which the client happens never to use
-- (nothing reads this table directly; `quest_steps__snowmageddon`, S5, is
-- internal), kept only for Supabase Studio debugging, as #141/#142's own
-- "select own rows" policies are.
--
-- S3 `public.snowball_day(at_time)` -> date: `(at_time at time zone
-- 'America/New_York')::date`, exactly #51 slice 4's `stair_day` (SC10),
-- under its own name here rather than a cross-feature call so this file
-- reads standalone. Internal only; daylight saving from tzdata.
--
-- S4 `public.record_snowball_hit(target_id uuid, throw_id text)` -> jsonb
-- `{ counted: boolean, today: int }` (security definer, identity from
-- auth.uid() only). Never raises for a business-rule rejection -- only for
-- `not_authenticated` (42501) and `no_player` (the caller has no
-- `public.players` row). Every other reason nothing is recorded just comes
-- back as `counted: false` with the caller's own unchanged `today` count, per
-- the ticket's checks, in this order:
--   * the Quest is already completed (`player_quest_completions`) -- hits
--     aren't recorded once it's done, so the five steps (S5) can't be
--     disturbed by a stray hit after midnight;
--   * `target_id` is null, equals the caller (no self-hits), or isn't a real
--     Player with a named Penguin (`profile_created_at is not null and
--     penguin_name <> ''`, #46's own "real Player" shape);
--   * a reused `throw_id`, or a repeat target already counted today, each
--     checked explicitly before the insert (`not exists`, S2's own two
--     unique constraints stand as the backstop against a race between two
--     concurrent calls, via a plain `on conflict do nothing`).
-- "Today" (`v_today`) is computed once, from the server's own `now()`, via
-- S3 -- never from anything the client sends. `throw_id` is the thrower's own
-- client-generated id (`generateThrowId`, #53 D1), already sender-unique
-- end-to-end; this migration adds no length/shape check of its own beyond the
-- column's `not null`.
--
-- S5 `public.quest_steps__snowmageddon(p_player)` -> jsonb (the registry's R2
-- convention: security definer, `set search_path = ''`, stable,
-- schema-qualified, EXECUTE revoked from public/anon/authenticated, nothing
-- granted back). Five steps, `hit-1` .. `hit-5`, each true once today's
-- (S3) distinct `target_id` count for `p_player` reaches that many. Once a
-- `player_quest_completions` row exists for 'snowmageddon' (checked first),
-- every one of the five reads true regardless of the count or the day, so
-- progress never "un-completes" at midnight (the ticket's own requirement):
-- once earned, the Quest stays shown as 5 / 5 and done forever, exactly as
-- `completedQuests` already would have forced `done` to in `quest-engine.ts`
-- -- this keeps the steps themselves consistent with that, rather than
-- relying on the fallback alone.
--
-- S6 The Badge, without touching `complete_quest` (the registry's own rule,
-- and #143's igloo-badge I4 precedent for a Quest whose Badge is awarded
-- outside the registry's own payout branch): an `after insert` trigger on
-- `public.player_quest_completions`, scoped to `quest_id = 'snowmageddon'`,
-- calls `public.award_badge(new.player_id, 'snowmageddon')` -- the explicit
-- reward path (not `award_badge_if_available`): since S7 turns the Badge on
-- in this same migration, a raise here (an unavailable or missing Badge)
-- would mean this file was applied out of order, and the whole
-- `complete_quest` call rolling back is the stair-climb SC11 precedent for
-- exactly that failure mode. So `complete_quest`'s own `badgesEarned` stays
-- `[]` for 'snowmageddon' (the registry's R5, unchanged): the Badge is
-- announced the normal way, by the next Session Badge check
-- (`check_session_badges`, #138 D6) noticing the new `player_badges` row --
-- `src/persistence/progress-session.ts`'s `completeQuest` wrapper forces one
-- immediately after a first-time 'snowmageddon' completion (I4's same
-- immediate-check precedent for Interior Penguin's own trigger, in that
-- file's `setSlot`), rather than waiting out the periodic 5-minute one.
--
-- S7 Turn the Badge on: `update public.badges set available = true where id
-- = 'snowmageddon';` (#138 seeded it coming soon). The client mirrors it in
-- `src/persistence/badge-catalog.ts` (`BADGE_AVAILABILITY_OVERRIDES` plus the
-- matching `BADGE_CATALOG` entry).
--
-- S8 Grants. Postgres grants EXECUTE to PUBLIC by default, and Supabase adds
-- anon and authenticated. `record_snowball_hit` takes no Player id (identity
-- is always `auth.uid()`), so it's granted to authenticated only, same as
-- every other client RPC in this build. `snowball_day`,
-- `quest_steps__snowmageddon` and the trigger function stay internal (EXECUTE
-- revoked from all three roles, nothing granted back): `quest_steps__<id>`
-- takes a Player id (R2) and the other two are never meant to be called
-- directly.
--
-- S9 Never redefines `complete_quest` or `quest_progress` (the registry's own
-- rule, restated here because S6 is the first Quest in this build whose
-- Badge needs a side channel): both already read `public.quests` and
-- dispatch through `quest_steps_for`, so this Quest is paid and reported as
-- soon as its row and its steps function exist; the Badge trigger is a
-- completely separate object this file alone owns.
--
-- S10 Precondition (SC2's pattern): a `do` block, first, raises
-- `badge_award_missing` if `public.badges` or `public.award_badge(uuid,text)`
-- doesn't exist, `snowmageddon_badge_missing` if there's no 'snowmageddon'
-- row, and `badge_award_executable` if anon or authenticated may execute
-- `award_badge` -- so an out-of-order or already-broken apply stops before
-- anything here is created.
--
-- Rerun chain: rerunning this file re-adds the 'snowmageddon' row (refreshing
-- `reward_tokens` only), replaces `snowball_day`, `record_snowball_hit`,
-- `quest_steps__snowmageddon` and the trigger function, and reapplies the
-- `available = true` update (a no-op once it's already on); it keeps every
-- recorded `snowball_hits` row and never touches `complete_quest`,
-- `quest_progress`, `award_badge` or any other Quest's row/function. The
-- registry's own rerun-chain notes still apply to everything upstream of
-- this file.
--
-- Conventions (the registry's own, from the leaderboard migration's D5):
-- every function is security definer with set search_path = '', every
-- relation schema-qualified, #variable_conflict use_column, identity from
-- auth.uid() only in client-callable functions, EXECUTE revoked from
-- public/anon/authenticated and granted back to authenticated only where
-- stated.

-- ---------------------------------------------------------------------------
-- Preconditions (S10): runs first, before any object is created or changed.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.badges') is null
    or to_regprocedure('public.award_badge(uuid,text)') is null then
    raise exception 'badge_award_missing';
  end if;
  if not exists (select 1 from public.badges b where b.id = 'snowmageddon') then
    raise exception 'snowmageddon_badge_missing';
  end if;
  if has_function_privilege('anon', 'public.award_badge(uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.award_badge(uuid,text)', 'EXECUTE') then
    raise exception 'badge_award_executable';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- public.quests: the 'snowmageddon' row (S1)
-- ---------------------------------------------------------------------------

-- Mirrored by the 'snowmageddon' entry in src/quests/quest-definitions.ts
-- (rewardTokens) and in src/persistence/in-memory-steps-quests.ts.
insert into public.quests (id, reward_tokens) values
  ('snowmageddon', 75)
on conflict (id) do update
  set reward_tokens = excluded.reward_tokens;

-- ---------------------------------------------------------------------------
-- public.snowball_hits (S2)
-- ---------------------------------------------------------------------------

create table if not exists public.snowball_hits (
  thrower_id uuid not null references public.players (id) on delete cascade,
  target_id uuid not null references public.players (id) on delete cascade,
  throw_id text not null,
  day date not null,
  created_at timestamptz not null default now()
);

alter table public.snowball_hits
  drop constraint if exists snowball_hits_throw_id_not_blank_check;
alter table public.snowball_hits
  add constraint snowball_hits_throw_id_not_blank_check check (throw_id <> '');

alter table public.snowball_hits
  drop constraint if exists snowball_hits_thrower_target_day_key;
alter table public.snowball_hits
  add constraint snowball_hits_thrower_target_day_key unique (thrower_id, target_id, day);
alter table public.snowball_hits
  drop constraint if exists snowball_hits_throw_id_key;
alter table public.snowball_hits
  add constraint snowball_hits_throw_id_key unique (throw_id);

create index if not exists snowball_hits_thrower_day_idx
  on public.snowball_hits (thrower_id, day);

alter table public.snowball_hits enable row level security;

drop policy if exists "snowball_hits select own rows" on public.snowball_hits;
create policy "snowball_hits select own rows"
  on public.snowball_hits for select to authenticated
  using (auth.uid() = thrower_id or auth.uid() = target_id);

-- Read-only for either party, nothing for anon. record_snowball_hit (S4) does
-- every write, as security definer -- it bypasses RLS as the table's owner.
revoke all on public.snowball_hits from anon, authenticated;
grant select on public.snowball_hits to authenticated;

-- ---------------------------------------------------------------------------
-- snowball_day(at_time) -> date (S3)
--
-- The America/New_York calendar day `at_time` falls on, daylight saving from
-- tzdata. Internal only; the proof checks it at fixed instants.
-- ---------------------------------------------------------------------------

create or replace function public.snowball_day(at_time timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (snowball_day.at_time at time zone 'America/New_York')::date
$$;

-- ---------------------------------------------------------------------------
-- record_snowball_hit(target_id, throw_id) -> { counted, today } (S4).
-- Errors: not_authenticated, no_player.
-- ---------------------------------------------------------------------------

create or replace function public.record_snowball_hit(target_id uuid, throw_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_target uuid := record_snowball_hit.target_id;
  v_throw text := record_snowball_hit.throw_id;
  v_today date := public.snowball_day(now());
  v_counted boolean := false;
  v_inserted int;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.players p where p.id = v_uid) then
    raise exception 'no_player';
  end if;

  -- Nothing is recorded once the Quest is complete (the ticket's own rule).
  -- Every rejection reason (completed, no target, self, unknown/unnamed
  -- target, a repeat target already counted today, or a reused throw_id) is
  -- checked explicitly before the insert, rather than leaning on the table's
  -- own unique constraints (S2) alone: they still stand as the backstop
  -- against a race between two concurrent calls, but the ordinary path never
  -- reaches a constraint violation at all.
  if not exists (
    select 1 from public.player_quest_completions c
    where c.player_id = v_uid and c.quest_id = 'snowmageddon'
  )
  and v_target is not null
  and v_target <> v_uid
  and exists (
    select 1 from public.players p
    where p.id = v_target and p.profile_created_at is not null and p.penguin_name <> ''
  )
  and not exists (
    select 1 from public.snowball_hits h
    where h.thrower_id = v_uid and h.target_id = v_target and h.day = v_today
  )
  and not exists (
    select 1 from public.snowball_hits h where h.throw_id = v_throw
  ) then
    insert into public.snowball_hits (thrower_id, target_id, throw_id, day)
    values (v_uid, v_target, v_throw, v_today)
    on conflict do nothing;
    get diagnostics v_inserted = row_count;
    v_counted := v_inserted > 0;
  end if;

  select count(distinct h.target_id) into v_count
  from public.snowball_hits h
  where h.thrower_id = v_uid and h.day = v_today;

  return jsonb_build_object('counted', v_counted, 'today', coalesce(v_count, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- quest_steps__snowmageddon(p_player) -> jsonb (S5). Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.quest_steps__snowmageddon(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_count int;
begin
  if exists (
    select 1 from public.player_quest_completions c
    where c.player_id = p_player and c.quest_id = 'snowmageddon'
  ) then
    return jsonb_build_object(
      'hit-1', true, 'hit-2', true, 'hit-3', true, 'hit-4', true, 'hit-5', true
    );
  end if;

  select count(distinct h.target_id) into v_count
  from public.snowball_hits h
  where h.thrower_id = p_player and h.day = public.snowball_day(now());
  v_count := coalesce(v_count, 0);

  return jsonb_build_object(
    'hit-1', v_count >= 1,
    'hit-2', v_count >= 2,
    'hit-3', v_count >= 3,
    'hit-4', v_count >= 4,
    'hit-5', v_count >= 5
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Badge trigger on public.player_quest_completions (S6)
-- ---------------------------------------------------------------------------

create or replace function public.award_snowmageddon_badge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quest_id = 'snowmageddon' then
    perform public.award_badge(new.player_id, 'snowmageddon');
  end if;
  return null;
end;
$$;

drop trigger if exists player_quest_completions_award_snowmageddon
  on public.player_quest_completions;
create trigger player_quest_completions_award_snowmageddon
  after insert on public.player_quest_completions
  for each row execute function public.award_snowmageddon_badge();

-- ---------------------------------------------------------------------------
-- Snowmageddon Badge on (S7)
-- ---------------------------------------------------------------------------

update public.badges set available = true where id = 'snowmageddon';

-- ---------------------------------------------------------------------------
-- Grants (S8). Postgres grants EXECUTE to PUBLIC by default, and Supabase
-- adds anon and authenticated.
-- ---------------------------------------------------------------------------

revoke all on function public.snowball_day(timestamptz) from public, anon, authenticated;
revoke all on function public.record_snowball_hit(uuid, text) from public, anon, authenticated;
revoke all on function public.quest_steps__snowmageddon(uuid) from public, anon, authenticated;
revoke all on function public.award_snowmageddon_badge() from public, anon, authenticated;

grant execute on function public.record_snowball_hit(uuid, text) to authenticated;
