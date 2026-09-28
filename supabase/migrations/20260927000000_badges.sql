-- Badges (#138): every designed Badge becomes a data row, one server function
-- awards a Badge once and pays its +50 Tokens once, and four new Badges are
-- earned on the server: First Waddle, Ship It, Interior Penguin and Night Owl.
--
-- Runs after 20260925000000_quests.sql (#46), and needs #9's
-- 20260924000000_players.sql and #27's 20260924010000_saved_progress.sql.
-- Apply by pasting into the Supabase SQL editor (no CLI). Safe to rerun.
--
-- Deploy order (D15): apply this migration BEFORE the client that reads
-- public.badges merges or deploys, including a Vercel preview, which uses
-- the same live Supabase project. A new client on the old schema fails its
-- first load; an old client on this schema keeps working.
--
-- Decisions (execution plan for #138, 2026-09-27):
--
-- D2 public.badges holds all 15 Badges. `available` is set on first insert
-- only, so a rerun never undoes a later issue flipping its own Badge on
-- (#51 stair-master, #121 let-it-rip, #146 phish-fry, #154 snowmageddon).
-- Signed-in Players can read it; nobody can write it through the API.
--
-- D3 player_badges.badge_id is a foreign key to badges, replacing #27's
-- 4-id check. Future Badges are a data row, not a schema change.
--
-- D4 public.award_badge(player_id, badge_id) is the only thing that awards
-- a Badge. It awards it once and pays +50 Tokens once, and returns true only
-- when it awarded it. It raises unknown_badge / badge_unavailable. It is
-- internal: no client role can execute it; only security-definer functions
-- and triggers call it. public.award_badge_if_available() is the same but
-- skips (returns false) a missing or coming-soon Badge; side-effect paths
-- (the Interior Penguin trigger, the Session check, the backfill) use it so
-- a coming-soon Badge can never make a slot save or a migration fail.
--
-- D5 Interior Penguin: an AFTER trigger on public.igloo_slots counts the
-- Player's placed slots (any slot number or placement) and awards the Badge
-- at 6. It keys off new.player_id and never reads auth.uid().
--
-- D6 First Waddle and Night Owl: check_session_badges(), called by the
-- client at Session start and every 5 minutes, evaluates them with the
-- server's own clock. Night Owl is [02:00, 05:00) America/New_York.
--
-- D7 Backfill: at the end of this file, through award_badge_if_available,
-- so each backfilled Badge pays +50 exactly once and a rerun pays nothing.
--
-- D8 record_round and complete_quest are redefined (same signatures) to
-- award through award_badge. complete_quest('main') now also awards Ship It
-- and returns badgesEarned (a text array).
--
-- Rules for later migrations (#140-#143, #154 and any other issue that
-- redefines complete_quest or quest_progress):
--   * keep the lines marked "-- #138: Ship It (keep when redefining)" in the
--     'main' branch, and the badgesEarned key on every return path;
--   * a Quest that awards its own Badge appends its id to badgesEarned and
--     re-reads the balance after the award;
--   * every migration that touches Badges, or redefines record_round or
--     complete_quest, sorts after 20260927010000 (#135's igloo slots).
--   supabase/tests/138_badges_proof.sql checks ship_it_awarded_by_complete_quest.
--
-- Rerun chain (read before rerunning any earlier migration):
--   * #27 can no longer be rerun once any Player holds a new Badge (the
--     backfill below does this straight away): its re-added 4-id check fails,
--     and the SQL editor rolls the whole paste back, so nothing is applied.
--     If no Player holds a non-Minigame Badge yet, the #27 rerun succeeds, re-
--     adds the 4-id check and the old record_round, and every new-Badge award
--     then fails with 23514 until this file is rerun.
--   * Rerunning #9 revokes the public.players column grants. #27 used to be
--     the recovery for that; this file now re-issues the same grants, so the
--     recovery is to rerun this file.
--   * Rerunning 20260925000000_quests.sql restores #46's complete_quest,
--     without Ship It or badgesEarned, and succeeds silently.
--   The rule: after rerunning any earlier migration, rerun this file and then
--   every later one, in timestamp order.
--
-- Conventions (the leaderboard migration's D5): every function is security
-- definer with set search_path = '', every relation schema-qualified,
-- #variable_conflict use_column, identity from auth.uid() only in client-
-- callable functions, EXECUTE revoked from public/anon/authenticated and
-- granted back only where stated.

-- ---------------------------------------------------------------------------
-- public.players column grants, re-issued verbatim from #27 (D3). Rerunning
-- #9's migration drops these; rerun this file afterwards to restore them.
-- ---------------------------------------------------------------------------

revoke all on public.players from anon;
revoke all on public.players from authenticated;
grant select on public.players to authenticated;
grant insert (
  id, penguin_color, penguin_name, cap, beak, feet, belly,
  hat, pattern, eyes, idle_emote, profile_created_at
) on public.players to authenticated;
grant update (
  penguin_color, penguin_name, cap, beak, feet, belly,
  hat, pattern, eyes, idle_emote, profile_created_at
) on public.players to authenticated;

-- ---------------------------------------------------------------------------
-- public.badges: the catalog (D2)
-- ---------------------------------------------------------------------------

create table if not exists public.badges (
  id text primary key,
  name text not null,
  how_to_earn text not null,
  sort_order int not null,
  available boolean not null default false
);

-- Mirrored by BADGE_CATALOG in src/persistence/badge-catalog.ts (a unit test
-- compares the two). `available` is written on first insert only: a rerun
-- refreshes the name, how-to-earn line and order, never the flag.
insert into public.badges (id, name, how_to_earn, sort_order, available) values
  ('first-waddle',     'First Waddle',     'LOG IN',                        1, true),
  ('snowmageddon',     'Snowmageddon',     '5 SNOWBALL HITS / DAY',         2, false),
  ('ship-it',          'Ship It',          'FINISH THE MAIN QUEST',         3, true),
  ('breakfast-club',   'Breakfast Club',   '20 STACKED · PANCAKE FLIP',     4, true),
  ('brain-freeze',     'Brain Freeze',     '200 TOKENS · SNOW CONES',       5, true),
  ('exterminator',     'Exterminator',     '500 · BUG SQUASH',              6, true),
  ('barista',          'Barista',          '15 CUPS · COFFEE RUSH',         7, true),
  ('rail-rider',       'Rail Rider',       'SLIDE THE STAIRWELL',           8, false),
  ('hexle-parent',     'Hexle Parent',     'ADOPT A HEXLE',                 9, false),
  ('interior-penguin', 'Interior Penguin', '6 IGLOO ITEMS',                10, true),
  ('night-owl',        'Night Owl',        'ONLINE 2–5 AM ET',             11, true),
  ('mullet-mania',     'Mullet Mania',     'HIGH SCORE · ARCADE',          12, false),
  ('let-it-rip',       'Let It Rip',       'WIN 3 BEY MATCHES',            13, false),
  ('stair-master',     'Stair Master',     'CLIMB THE STAIRWELL',          14, false),
  ('phish-fry',        'Phish Fry',        '10 PHISHING ANSWERS IN A ROW', 15, false)
on conflict (id) do update
  set name = excluded.name,
      how_to_earn = excluded.how_to_earn,
      sort_order = excluded.sort_order;

alter table public.badges enable row level security;

drop policy if exists "badges select signed in" on public.badges;
create policy "badges select signed in"
  on public.badges for select to authenticated
  using (true);

-- Read-only for signed-in Players, nothing for anon. No write policy.
revoke all on public.badges from anon, authenticated;
grant select on public.badges to authenticated;

-- ---------------------------------------------------------------------------
-- player_badges: foreign key to the catalog instead of #27's 4-id check (D3)
-- ---------------------------------------------------------------------------

alter table public.player_badges drop constraint if exists player_badges_badge_id_check;
alter table public.player_badges drop constraint if exists player_badges_badge_id_fkey;
alter table public.player_badges add constraint player_badges_badge_id_fkey
  foreign key (badge_id) references public.badges (id);

-- ---------------------------------------------------------------------------
-- award_badge(player_id, badge_id) -> boolean (D4)
--
-- Awards the Badge once and pays +50 Tokens once; returns true only when this
-- call awarded it. Locks the Player's row first (for no key update: it waits
-- behind record_round/complete_quest/check_session_badges' `for update` and
-- the tokens update, but not behind the `for key share` an igloo_slots insert
-- takes through its foreign key), so every award path takes the players lock
-- before touching player_badges.
-- Errors: no_player, unknown_badge, badge_unavailable. Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.award_badge(player_id uuid, badge_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_player uuid := award_badge.player_id;
  v_badge text := award_badge.badge_id;
  v_bonus constant int := 50;
  v_available boolean;
  v_awarded boolean;
begin
  perform 1 from public.players p where p.id = v_player for no key update;
  if not found then
    raise exception 'no_player';
  end if;

  select b.available into v_available from public.badges b where b.id = v_badge;
  if not found then
    raise exception 'unknown_badge';
  end if;
  if not v_available then
    raise exception 'badge_unavailable';
  end if;

  insert into public.player_badges (player_id, badge_id)
  values (v_player, v_badge)
  on conflict (player_id, badge_id) do nothing;
  v_awarded := found;

  if v_awarded then
    update public.players p
    set tokens = p.tokens + v_bonus
    where p.id = v_player;
  end if;

  return v_awarded;
end;
$$;

-- ---------------------------------------------------------------------------
-- award_badge_if_available(player_id, badge_id) -> boolean (D4, M5)
--
-- award_badge, except that a missing or coming-soon Badge returns false
-- instead of raising. For side-effect paths only. Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.award_badge_if_available(player_id uuid, badge_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_available boolean;
begin
  select b.available into v_available
  from public.badges b
  where b.id = award_badge_if_available.badge_id;
  if not found or not v_available then
    return false;
  end if;
  return public.award_badge(award_badge_if_available.player_id, award_badge_if_available.badge_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- is_night_owl_time(at_time) -> boolean (D6)
--
-- [02:00, 05:00) in America/New_York (JG HQ), daylight saving from tzdata.
-- Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.is_night_owl_time(at_time timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select extract(hour from (is_night_owl_time.at_time at time zone 'America/New_York')) between 2 and 4
$$;

-- ---------------------------------------------------------------------------
-- evaluate_session_badges(player_id, at_time) -> text[] (D6)
--
-- Awards First Waddle (a named Penguin), Night Owl (at_time in the window)
-- and, as a safety net for the trigger, Interior Penguin (6 placed slots).
-- Returns the ids this call newly awarded. A Player without a finished,
-- named Penguin gets nothing. Tests call it with a fixed at_time as the
-- postgres role. Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.evaluate_session_badges(player_id uuid, at_time timestamptz)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_player uuid := evaluate_session_badges.player_id;
  v_awarded text[] := '{}';
begin
  if not exists (
    select 1 from public.players p
    where p.id = v_player
      and p.profile_created_at is not null
      and p.penguin_name <> ''
  ) then
    return v_awarded;
  end if;

  if public.award_badge_if_available(v_player, 'first-waddle') then
    v_awarded := array_append(v_awarded, 'first-waddle');
  end if;

  if public.is_night_owl_time(evaluate_session_badges.at_time)
    and public.award_badge_if_available(v_player, 'night-owl') then
    v_awarded := array_append(v_awarded, 'night-owl');
  end if;

  if (select count(*) from public.igloo_slots s where s.player_id = v_player) >= 6
    and public.award_badge_if_available(v_player, 'interior-penguin') then
    v_awarded := array_append(v_awarded, 'interior-penguin');
  end if;

  return v_awarded;
end;
$$;

-- ---------------------------------------------------------------------------
-- check_session_badges() -> { badges, balance } (D6)
--
-- The client's Session check. Evaluates the Session Badges at the server's
-- now() (the client can't choose the time), then returns every Badge the
-- caller holds (by earned_at, then id) and the balance.
-- Errors: not_authenticated (42501), no_player.
-- ---------------------------------------------------------------------------

create or replace function public.check_session_badges()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_balance int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform 1 from public.players p where p.id = v_uid for update;
  if not found then
    raise exception 'no_player';
  end if;

  perform public.evaluate_session_badges(v_uid, now());

  select p.tokens into v_balance from public.players p where p.id = v_uid;

  return jsonb_build_object(
    'badges', coalesce((
      select jsonb_agg(b.badge_id order by b.earned_at, b.badge_id)
      from public.player_badges b
      where b.player_id = v_uid
    ), '[]'::jsonb),
    'balance', v_balance
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Interior Penguin trigger on public.igloo_slots (D5)
-- ---------------------------------------------------------------------------

create or replace function public.igloo_slots_award_interior_penguin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.igloo_slots s where s.player_id = new.player_id) >= 6 then
    perform public.award_badge_if_available(new.player_id, 'interior-penguin');
  end if;
  return null;
end;
$$;

drop trigger if exists igloo_slots_interior_penguin on public.igloo_slots;
create trigger igloo_slots_interior_penguin
  after insert or update on public.igloo_slots
  for each row execute function public.igloo_slots_award_interior_penguin();

-- ---------------------------------------------------------------------------
-- record_round(minigame_id, score, stats), redefined (D8)
--
-- Unchanged from #27 except the Badge block: the Badge and its first-time
-- +50 now go through award_badge, before the final Token update, so the
-- returned balance still includes the bonus. The return shape and every
-- number are the same. See #27's migration for the payout table and rules.
-- ---------------------------------------------------------------------------

create or replace function public.record_round(minigame_id text, score int, stats jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_game text := record_round.minigame_id;
  v_score int := record_round.score;
  v_stats jsonb := coalesce(record_round.stats, '{}'::jsonb);
  v_cap int;
  v_duration_s int;
  v_elapsed_s numeric;
  v_badge text;
  v_badge_met boolean;
  v_raw int;
  v_best int;
  v_payout int;
  v_balance int;
  v_last_finished timestamptz;
  v_prev_best int;
  v_new_best boolean;
  v_badge_earned boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_score is null or v_score < 0 or v_score > 1000000 then
    raise exception 'invalid_score';
  end if;

  if jsonb_typeof(v_stats) <> 'object'
    or (select count(*) from jsonb_object_keys(v_stats)) > 16
    or exists (select 1 from jsonb_object_keys(v_stats) as k (key) where char_length(k.key) > 32) then
    raise exception 'invalid_stats';
  end if;
  if exists (
    select 1
    from jsonb_each(v_stats) as e (key, value)
    where case
      when jsonb_typeof(e.value) <> 'number' then true
      else (e.value)::numeric < 0
        or (e.value)::numeric > 100000
        or (e.value)::numeric <> trunc((e.value)::numeric)
    end
  ) then
    raise exception 'invalid_stats';
  end if;

  case v_game
    when 'bug-squash' then
      v_cap := 250;
      v_duration_s := 60;
      v_badge := 'exterminator';
      v_raw := v_score / 10;
      v_best := v_score;
      v_badge_met := v_score >= 500;

    when 'pancake-flip' then
      v_cap := 400;
      v_duration_s := 90;
      v_badge := 'breakfast-club';
      v_raw := 10 * coalesce((v_stats -> 'golden')::numeric, 0)::int
             + 5 * coalesce((v_stats -> 'flipNow')::numeric, 0)::int
             - 5 * coalesce((v_stats -> 'burnt')::numeric, 0)::int;
      v_best := coalesce((v_stats -> 'stacked')::numeric, 0)::int;
      v_badge_met := v_best >= 20;

    when 'coffee-rush' then
      v_cap := 400;
      v_duration_s := 90;
      v_badge := 'barista';
      v_raw := 5 * coalesce((v_stats -> 'small')::numeric, 0)::int
             + 10 * coalesce((v_stats -> 'medium')::numeric, 0)::int
             + 15 * coalesce((v_stats -> 'large')::numeric, 0)::int
             + 5 * coalesce((v_stats -> 'perfect')::numeric, 0)::int;
      v_best := coalesce((v_stats -> 'small')::numeric, 0)::int
              + coalesce((v_stats -> 'medium')::numeric, 0)::int
              + coalesce((v_stats -> 'large')::numeric, 0)::int;
      v_badge_met := v_best >= 15;

    when 'snow-cone-stand' then
      v_cap := 600;
      v_duration_s := 120;
      v_badge := 'brain-freeze';
      v_raw := 5 * coalesce((v_stats -> 'cone5')::numeric, 0)::int
             + 10 * coalesce((v_stats -> 'cone10')::numeric, 0)::int
             + 15 * coalesce((v_stats -> 'cone15')::numeric, 0)::int
             + 25 * coalesce((v_stats -> 'cone25')::numeric, 0)::int
             + 2 * (5 * coalesce((v_stats -> 'rushCone5')::numeric, 0)::int
                  + 10 * coalesce((v_stats -> 'rushCone10')::numeric, 0)::int
                  + 15 * coalesce((v_stats -> 'rushCone15')::numeric, 0)::int
                  + 25 * coalesce((v_stats -> 'rushCone25')::numeric, 0)::int);
      v_best := greatest(v_raw, 0);
      v_badge_met := v_best >= 200;

    else
      raise exception 'unknown_minigame';
  end case;

  v_payout := least(greatest(v_raw, 0), v_cap);

  select p.tokens into v_balance
  from public.players p
  where p.id = v_uid
  for update;
  if not found then
    raise exception 'no_player';
  end if;

  select max(r.finished_at) into v_last_finished
  from public.minigame_rounds r
  where r.player_id = v_uid and r.minigame_id = v_game;
  if v_last_finished is not null then
    v_elapsed_s := extract(epoch from now() - v_last_finished);
    if v_elapsed_s < 10 then
      raise exception 'round_too_soon';
    end if;
    v_payout := least(
      v_payout,
      floor(v_cap * least(1.0, v_elapsed_s / v_duration_s))::int
    );
  end if;

  select b.best_score into v_prev_best
  from public.minigame_bests b
  where b.player_id = v_uid and b.minigame_id = v_game;
  v_new_best := v_best > coalesce(v_prev_best, 0);
  if v_new_best then
    insert into public.minigame_bests (player_id, minigame_id, best_score, updated_at)
    values (v_uid, v_game, v_best, now())
    on conflict (player_id, minigame_id) do update
      set best_score = excluded.best_score,
          updated_at = excluded.updated_at;
  end if;

  -- #138: the Badge and its first-time +50 go through award_badge.
  if v_badge_met then
    v_badge_earned := public.award_badge(v_uid, v_badge);
  end if;

  update public.players p
  set tokens = p.tokens + v_payout
  where p.id = v_uid
  returning p.tokens into v_balance;

  insert into public.minigame_rounds (player_id, minigame_id, score, stats, tokens_awarded)
  values (v_uid, v_game, v_score, v_stats, v_payout);

  return jsonb_build_object(
    'tokensAwarded', v_payout,
    'balance', v_balance,
    'newBest', v_new_best,
    'badgeEarned', v_badge_earned
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_quest(quest_id), redefined (D8)
--
-- Unchanged from #46 except that the 'main' success path also awards Ship It
-- through award_badge, re-reads the balance so it includes the +50, and
-- every return path carries badgesEarned: the Badge ids this call awarded.
-- Returns { tokensAwarded, balance, alreadyCompleted, badgesEarned }.
-- Errors: not_authenticated, unknown_quest, no_player, quest_incomplete.
-- ---------------------------------------------------------------------------

create or replace function public.complete_quest(quest_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_quest text := complete_quest.quest_id;
  v_reward constant int := 150;
  v_balance int;
  v_profile_created_at timestamptz;
  v_steps_met boolean;
  v_badges text[] := '{}';
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_quest is null or v_quest <> 'main' then
    raise exception 'unknown_quest';
  end if;

  select p.tokens, p.profile_created_at into v_balance, v_profile_created_at
  from public.players p
  where p.id = v_uid
  for update;
  if not found then
    raise exception 'no_player';
  end if;

  if exists (
    select 1 from public.player_quest_completions c
    where c.player_id = v_uid and c.quest_id = v_quest
  ) then
    return jsonb_build_object(
      'tokensAwarded', 0,
      'balance', v_balance,
      'alreadyCompleted', true,
      'badgesEarned', to_jsonb(v_badges)
    );
  end if;

  v_steps_met :=
    v_profile_created_at is not null
    and exists (
      select 1 from public.player_quest_state s
      where s.player_id = v_uid and s.dev_pit_visited_at is not null
    )
    and exists (
      select 1 from public.minigame_rounds r
      where r.player_id = v_uid and r.minigame_id = 'bug-squash'
    )
    and exists (
      select 1 from public.minigame_rounds r
      where r.player_id = v_uid and r.minigame_id = 'pancake-flip'
    )
    and exists (
      select 1
      from public.player_items o
      join public.shop_items i on i.id = o.item_id
      where o.player_id = v_uid and i.stall = 'igloo'
    );
  if not v_steps_met then
    raise exception 'quest_incomplete';
  end if;

  update public.players p
  set tokens = p.tokens + v_reward
  where p.id = v_uid
  returning p.tokens into v_balance;

  insert into public.player_quest_completions (player_id, quest_id, tokens_awarded)
  values (v_uid, v_quest, v_reward);

  -- #138: Ship It (keep when redefining)
  if public.award_badge(v_uid, 'ship-it') then
    v_badges := array_append(v_badges, 'ship-it');
  end if;
  -- #138: Ship It (keep when redefining) -- the balance includes the +50.
  select p.tokens into v_balance from public.players p where p.id = v_uid;

  return jsonb_build_object(
    'tokensAwarded', v_reward,
    'balance', v_balance,
    'alreadyCompleted', false,
    'badgesEarned', to_jsonb(v_badges)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Postgres grants EXECUTE to PUBLIC by default, and Supabase adds
-- anon and authenticated. The award and evaluation functions are internal:
-- no client role may execute them. If a signature ever changes, add `drop
-- function if exists` for the old one first.
-- ---------------------------------------------------------------------------

revoke all on function public.award_badge(uuid, text) from public, anon, authenticated;
revoke all on function public.award_badge_if_available(uuid, text) from public, anon, authenticated;
revoke all on function public.is_night_owl_time(timestamptz) from public, anon, authenticated;
revoke all on function public.evaluate_session_badges(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.igloo_slots_award_interior_penguin() from public, anon, authenticated;
revoke all on function public.check_session_badges() from public, anon, authenticated;
revoke all on function public.record_round(text, int, jsonb) from public, anon, authenticated;
revoke all on function public.complete_quest(text) from public, anon, authenticated;

grant execute on function public.check_session_badges() to authenticated;
grant execute on function public.record_round(text, int, jsonb) to authenticated;
grant execute on function public.complete_quest(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill (D7): each backfilled Badge pays +50 exactly once; a rerun pays
-- nothing and grants any Player who became eligible since.
-- ---------------------------------------------------------------------------

do $$
begin
  perform public.award_badge_if_available(p.id, 'first-waddle')
  from public.players p
  where p.profile_created_at is not null and p.penguin_name <> '';

  perform public.award_badge_if_available(c.player_id, 'ship-it')
  from public.player_quest_completions c
  where c.quest_id = 'main';

  perform public.award_badge_if_available(s.player_id, 'interior-penguin')
  from public.igloo_slots s
  group by s.player_id
  having count(*) >= 6;
end
$$;
