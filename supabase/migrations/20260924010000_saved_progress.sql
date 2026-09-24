-- Saved progress (contract C-1, #27): the Penguin look, Tokens, Badges,
-- Minigame personal bests and rounds, the Igloo Gear catalog, owned
-- Furniture and the Igloo's six furniture slots.
--
-- Anti-cheat rule: the client can read its Token balance but never write it.
-- Tokens change only inside record_round() and purchase_item(), which run as
-- the table owner and validate every change on the server.
--
-- Runs after 20260924000000_players.sql (#9). Apply by pasting into the
-- Supabase SQL editor (no CLI). Safe to rerun.

-- ---------------------------------------------------------------------------
-- public.players: the Penguin look, Token balance and Creator completion
-- ---------------------------------------------------------------------------

-- penguin_color stays as the body colour. New Players get the design body.
alter table public.players alter column penguin_color set default '#161719';

-- Columns are added without inline checks: `add column if not exists` skips
-- the whole clause on a rerun, so an edited inline check would never apply.
-- Every check is a named constraint below, dropped and re-added each run.
alter table public.players
  add column if not exists penguin_name text not null default '',
  add column if not exists cap text not null default '#00BDFF',
  add column if not exists beak text not null default '#00BDFF',
  add column if not exists feet text not null default '#00BDFF',
  add column if not exists belly text not null default '#F4F4F4',
  add column if not exists hat text not null default 'JG CAP',
  add column if not exists pattern text not null default 'PLAIN',
  add column if not exists eyes text not null default 'ROUND',
  add column if not exists idle_emote text not null default 'WADDLE',
  -- Starting balance 100. Existing Players get it too.
  add column if not exists tokens int not null default 100,
  -- null = the Penguin Creator has not been completed yet.
  add column if not exists profile_created_at timestamptz null;

alter table public.players
  drop constraint if exists players_penguin_name_check,
  drop constraint if exists players_cap_check,
  drop constraint if exists players_beak_check,
  drop constraint if exists players_feet_check,
  drop constraint if exists players_belly_check,
  drop constraint if exists players_hat_check,
  drop constraint if exists players_pattern_check,
  drop constraint if exists players_eyes_check,
  drop constraint if exists players_idle_emote_check,
  drop constraint if exists players_tokens_check,
  drop constraint if exists players_name_set_once_created;

alter table public.players
  -- #26: trimmed, at most 16 characters; '' only before the Creator is done.
  add constraint players_penguin_name_check
    check (char_length(penguin_name) <= 16 and penguin_name !~ '^\s|\s$'),
  add constraint players_cap_check check (cap ~ '^#[0-9a-fA-F]{6}$'),
  add constraint players_beak_check check (beak ~ '^#[0-9a-fA-F]{6}$'),
  add constraint players_feet_check check (feet ~ '^#[0-9a-fA-F]{6}$'),
  add constraint players_belly_check check (belly ~ '^#[0-9a-fA-F]{6}$'),
  add constraint players_hat_check
    check (hat in ('JG CAP', 'SNORKEL', 'HEADPHONES', 'WAR WEEK BAND', 'NONE')),
  add constraint players_pattern_check
    check (pattern in ('PLAIN', 'HEX', 'STRIPES', 'JG LOGO', 'PIXEL HEART', 'SNOWFLAKE')),
  add constraint players_eyes_check check (eyes in ('ROUND', 'SLEEPY', 'STAR', 'WINK')),
  add constraint players_idle_emote_check
    check (idle_emote in ('WADDLE', 'WAVE', 'DANCE', 'LAUGH', 'SIT')),
  add constraint players_tokens_check check (tokens >= 0),
  -- Once the Creator is completed, the Penguin has a name (1-16 characters).
  add constraint players_name_set_once_created
    check (profile_created_at is null or char_length(penguin_name) >= 1);

-- Column-level grants replace #9's table-wide INSERT, which would otherwise
-- let a first-sign-in insert choose its own Token balance. The Player may set
-- the look and profile_created_at, and nothing else. id is insert-only;
-- tokens and created_at are never client-writable.
-- Note: rerunning #9's migration after this one drops these grants (it
-- revokes all first). Rerun this migration afterwards if that ever happens.
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
-- Badges, personal bests and rounds: readable by their owner, written only by
-- record_round()
-- ---------------------------------------------------------------------------

create table if not exists public.player_badges (
  player_id uuid not null references public.players (id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  primary key (player_id, badge_id)
);

create table if not exists public.minigame_bests (
  player_id uuid not null references public.players (id) on delete cascade,
  minigame_id text not null,
  best_score int not null check (best_score >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, minigame_id)
);

create table if not exists public.minigame_rounds (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  minigame_id text not null,
  score int not null check (score >= 0),
  stats jsonb not null default '{}'::jsonb,
  tokens_awarded int not null check (tokens_awarded >= 0),
  finished_at timestamptz not null default now()
);

-- Enum checks as named constraints, re-added each run (see players above).
-- Ids match src/contracts/game-events.ts (#26).
alter table public.player_badges drop constraint if exists player_badges_badge_id_check;
alter table public.player_badges add constraint player_badges_badge_id_check
  check (badge_id in ('exterminator', 'breakfast-club', 'barista', 'brain-freeze'));
alter table public.minigame_bests drop constraint if exists minigame_bests_minigame_id_check;
alter table public.minigame_bests add constraint minigame_bests_minigame_id_check
  check (minigame_id in ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand'));
alter table public.minigame_rounds drop constraint if exists minigame_rounds_minigame_id_check;
alter table public.minigame_rounds add constraint minigame_rounds_minigame_id_check
  check (minigame_id in ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand'));

-- record_round() looks up the Player's previous round of a Minigame.
create index if not exists minigame_rounds_player_game_finished_idx
  on public.minigame_rounds (player_id, minigame_id, finished_at desc);

-- ---------------------------------------------------------------------------
-- Stalls and Furniture
-- ---------------------------------------------------------------------------

create table if not exists public.shop_items (
  id text primary key,
  stall text not null,
  name text not null,
  price int not null check (price > 0),
  art_key text not null
);

-- Igloo Gear catalog proposed in #40. The designs have no IGLOO tab items, so
-- the team may adjust this seed. Rerunning refreshes names and prices.
insert into public.shop_items (id, stall, name, price, art_key) values
  ('beanbag',         'igloo', 'Beanbag',          50, 'beanbag'),
  ('rgb-light-strip', 'igloo', 'RGB Light Strip',  60, 'rgb-light-strip'),
  ('desk',            'igloo', 'Desk',             80, 'desk'),
  ('speakers',        'igloo', 'Speakers',        100, 'speakers'),
  ('dual-monitors',   'igloo', 'Dual Monitors',   120, 'dual-monitors'),
  ('disco-ball',      'igloo', 'Disco Ball',      150, 'disco-ball'),
  ('arcade-cabinet',  'igloo', 'Arcade Cabinet',  250, 'arcade-cabinet')
on conflict (id) do update
  set stall = excluded.stall,
      name = excluded.name,
      price = excluded.price,
      art_key = excluded.art_key;

-- Furniture a Player owns. Written only by purchase_item().
create table if not exists public.player_items (
  player_id uuid not null references public.players (id) on delete cascade,
  item_id text not null references public.shop_items (id),
  acquired_at timestamptz not null default now(),
  primary key (player_id, item_id)
);

-- The Igloo's six furniture slots. The composite foreign key means a slot can
-- hold only Furniture its owner owns. Each owned item fills at most one slot.
create table if not exists public.igloo_slots (
  player_id uuid not null references public.players (id) on delete cascade,
  slot smallint not null check (slot between 1 and 6),
  item_id text not null,
  primary key (player_id, slot),
  unique (player_id, item_id),
  foreign key (player_id, item_id)
    references public.player_items (player_id, item_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Row-level security: own rows only, nothing for anon
-- ---------------------------------------------------------------------------

alter table public.player_badges enable row level security;
alter table public.minigame_bests enable row level security;
alter table public.minigame_rounds enable row level security;
alter table public.shop_items enable row level security;
alter table public.player_items enable row level security;
alter table public.igloo_slots enable row level security;

drop policy if exists "player_badges select own rows" on public.player_badges;
create policy "player_badges select own rows"
  on public.player_badges for select to authenticated
  using (auth.uid() = player_id);

drop policy if exists "minigame_bests select own rows" on public.minigame_bests;
create policy "minigame_bests select own rows"
  on public.minigame_bests for select to authenticated
  using (auth.uid() = player_id);

drop policy if exists "minigame_rounds select own rows" on public.minigame_rounds;
create policy "minigame_rounds select own rows"
  on public.minigame_rounds for select to authenticated
  using (auth.uid() = player_id);

drop policy if exists "player_items select own rows" on public.player_items;
create policy "player_items select own rows"
  on public.player_items for select to authenticated
  using (auth.uid() = player_id);

-- The catalog is readable by every signed-in Player.
drop policy if exists "shop_items select signed in" on public.shop_items;
create policy "shop_items select signed in"
  on public.shop_items for select to authenticated
  using (true);

-- The owner arranges their own Igloo.
drop policy if exists "igloo_slots select own rows" on public.igloo_slots;
create policy "igloo_slots select own rows"
  on public.igloo_slots for select to authenticated
  using (auth.uid() = player_id);

drop policy if exists "igloo_slots insert own rows" on public.igloo_slots;
create policy "igloo_slots insert own rows"
  on public.igloo_slots for insert to authenticated
  with check (auth.uid() = player_id);

drop policy if exists "igloo_slots update own rows" on public.igloo_slots;
create policy "igloo_slots update own rows"
  on public.igloo_slots for update to authenticated
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

drop policy if exists "igloo_slots delete own rows" on public.igloo_slots;
create policy "igloo_slots delete own rows"
  on public.igloo_slots for delete to authenticated
  using (auth.uid() = player_id);

-- Explicit grants instead of Supabase defaults. Read-only tables get SELECT
-- only; the database functions do every write to them.
revoke all on public.player_badges from anon, authenticated;
revoke all on public.minigame_bests from anon, authenticated;
revoke all on public.minigame_rounds from anon, authenticated;
revoke all on public.shop_items from anon, authenticated;
revoke all on public.player_items from anon, authenticated;
revoke all on public.igloo_slots from anon, authenticated;

grant select on public.player_badges to authenticated;
grant select on public.minigame_bests to authenticated;
grant select on public.minigame_rounds to authenticated;
grant select on public.shop_items to authenticated;
grant select on public.player_items to authenticated;
grant select, insert, delete on public.igloo_slots to authenticated;
-- player_id is included because a PostgREST upsert sets every sent column;
-- the RLS WITH CHECK still pins it to the Player's own id.
grant update (player_id, slot, item_id) on public.igloo_slots to authenticated;

-- Supabase's default privileges also grant the rounds id sequence to anon and
-- authenticated; revoking the table doesn't touch it.
revoke all on sequence public.minigame_rounds_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- record_round(minigame_id, score, stats)
--
-- Computes the round's payout on the server from the stats, floors it at 0,
-- caps it at the Minigame's per-round maximum, rejects a round that arrives
-- less than 10 s after the Player's previous round of that Minigame, clamps
-- the payout by the time since that previous round (below), updates the
-- personal best, and awards the Minigame's Badge (+50 Tokens the
-- first time only).
--
-- Returns { tokensAwarded, balance, newBest, badgeEarned }. tokensAwarded is
-- the round's payout; the first-time Badge bonus shows up in balance only.
-- badgeEarned is true only on the round that first earns the Badge. newBest
-- is true only when the best score beats the previous best, or 0 when there
-- is none. score is stored with every round but only Bug Squash pays from it;
-- the other Minigames pay and rank from their stats.
--
-- Errors (the message is the code): not_authenticated, no_player,
-- unknown_minigame, invalid_score, invalid_stats, round_too_soon.
--
-- Rules per Minigame (payout table decided 2026-09-24). Minigame, Badge and
-- Pancake Flip stats keys match src/contracts/game-events.ts (#26). Stats
-- values are non-negative integers; a missing key counts as 0.
--
--   Minigame      Payout per round                       Best            Badge (threshold)       Cap  Duration
--   bug-squash    floor(score / 10)                      score           exterminator (500)      250  60 s
--   pancake-flip  10 golden + 5 flipNow - 5 burnt        stacked         breakfast-club (20)     400  90 s
--   coffee-rush   5 small + 10 medium + 15 large         cups served     barista (15 cups)       400  90 s
--                 + 5 perfect                            (small+medium
--                                                        +large)
--   snow-cone-    5 cone5 + 10 cone10 + 15 cone15        tokens earned   brain-freeze (200)      600  120 s
--   stand         + 25 cone25, rush-hour cones
--                 (rushCone5 ... rushCone25) doubled
--
-- Caps confirmed in the #27 red-team review (2026-09-24).
--
-- Interval rule (option A, #27 red-team RT3, decided 2026-09-24): a round
-- less than 10 s after the previous round of the same Minigame is rejected
-- with round_too_soon. Otherwise the payout is at most
-- floor(cap * min(1, seconds since the previous round / duration)), so a
-- Player can never earn more than one cap per duration, while an honest
-- round that ends early (a Bug Squash with three escapes) still counts. The
-- personal best and Badge are recorded whatever the clamp.
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
  v_bonus int := 0;
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

  -- Every stat must be a whole number from 0 to 100000. A negative count
  -- would otherwise turn a penalty (Burnt -5) into a reward. At most 16 keys
  -- of at most 32 characters, so a round can't be used to bloat storage.
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

  -- Floor at 0, then cap.
  v_payout := least(greatest(v_raw, 0), v_cap);

  -- Lock the Player's row so parallel rounds and purchases run one at a time.
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
  -- A best must beat the previous one; a first round scoring 0 is not a best.
  v_new_best := v_best > coalesce(v_prev_best, 0);
  if v_new_best then
    insert into public.minigame_bests (player_id, minigame_id, best_score, updated_at)
    values (v_uid, v_game, v_best, now())
    on conflict (player_id, minigame_id) do update
      set best_score = excluded.best_score,
          updated_at = excluded.updated_at;
  end if;

  if v_badge_met then
    insert into public.player_badges (player_id, badge_id)
    values (v_uid, v_badge)
    on conflict (player_id, badge_id) do nothing;
    v_badge_earned := found;
    if v_badge_earned then
      v_bonus := 50;
    end if;
  end if;

  update public.players p
  set tokens = p.tokens + v_payout + v_bonus
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
-- purchase_item(item_id)
--
-- In one transaction: checks the item exists and isn't owned, checks the
-- balance covers the price, deducts the Tokens and grants the item. Locking
-- the Player's row means two parallel purchases run one after the other, so
-- together they can never spend more than the balance.
--
-- Returns { balance }. Errors (the message is the code): not_authenticated,
-- no_player, unknown_item, already_owned, insufficient_tokens.
-- ---------------------------------------------------------------------------

create or replace function public.purchase_item(item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_item text := purchase_item.item_id;
  v_price int;
  v_balance int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select p.tokens into v_balance
  from public.players p
  where p.id = v_uid
  for update;
  if not found then
    raise exception 'no_player';
  end if;

  select s.price into v_price
  from public.shop_items s
  where s.id = v_item;
  if not found then
    raise exception 'unknown_item';
  end if;

  if exists (
    select 1 from public.player_items o
    where o.player_id = v_uid and o.item_id = v_item
  ) then
    raise exception 'already_owned';
  end if;

  if v_balance < v_price then
    raise exception 'insufficient_tokens';
  end if;

  update public.players p
  set tokens = p.tokens - v_price
  where p.id = v_uid
  returning p.tokens into v_balance;

  insert into public.player_items (player_id, item_id)
  values (v_uid, v_item);

  return jsonb_build_object('balance', v_balance);
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and Supabase adds anon and
-- authenticated. Only signed-in Players may call these.
-- If a signature ever changes, `create or replace` adds a second overload
-- that anon can call: add `drop function if exists` for the old signature.
revoke all on function public.record_round(text, int, jsonb) from public, anon, authenticated;
revoke all on function public.purchase_item(text) from public, anon, authenticated;
grant execute on function public.record_round(text, int, jsonb) to authenticated;
grant execute on function public.purchase_item(text) to authenticated;
