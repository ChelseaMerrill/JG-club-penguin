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

alter table public.players
  add column if not exists penguin_name text not null default ''
    check (char_length(penguin_name) <= 20),
  add column if not exists cap text not null default '#00BDFF'
    check (cap ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists beak text not null default '#00BDFF'
    check (beak ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists feet text not null default '#00BDFF'
    check (feet ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists belly text not null default '#F4F4F4'
    check (belly ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists hat text not null default 'JG CAP'
    check (hat in ('JG CAP', 'SNORKEL', 'HEADPHONES', 'WAR WEEK BAND', 'NONE')),
  add column if not exists pattern text not null default 'PLAIN'
    check (pattern in ('PLAIN', 'HEX', 'STRIPES', 'JG LOGO', 'PIXEL HEART', 'SNOWFLAKE')),
  add column if not exists eyes text not null default 'ROUND'
    check (eyes in ('ROUND', 'SLEEPY', 'STAR', 'WINK')),
  add column if not exists idle_emote text not null default 'WADDLE'
    check (idle_emote in ('WADDLE', 'WAVE', 'DANCE', 'LAUGH', 'SIT')),
  -- Starting balance 100. Existing Players get it too.
  add column if not exists tokens int not null default 100
    check (tokens >= 0),
  -- null = the Penguin Creator has not been completed yet.
  add column if not exists profile_created_at timestamptz null;

-- Column-level grants replace #9's table-wide INSERT, which would otherwise
-- let a first-sign-in insert choose its own Token balance. The Player may set
-- the look and profile_created_at, and nothing else. id is insert-only;
-- tokens and created_at are never client-writable.
-- Note: rerunning #9's migration after this one restores its table-wide
-- INSERT grant. Rerun this migration afterwards if that ever happens.
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
  badge_id text not null
    check (badge_id in ('exterminator', 'breakfast-club', 'barista', 'brain-freeze')),
  earned_at timestamptz not null default now(),
  primary key (player_id, badge_id)
);

create table if not exists public.minigame_bests (
  player_id uuid not null references public.players (id) on delete cascade,
  minigame_id text not null
    check (minigame_id in ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone')),
  best_score int not null check (best_score >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, minigame_id)
);

create table if not exists public.minigame_rounds (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  minigame_id text not null
    check (minigame_id in ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone')),
  score int not null check (score >= 0),
  stats jsonb not null default '{}'::jsonb,
  tokens_awarded int not null check (tokens_awarded >= 0),
  finished_at timestamptz not null default now()
);

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
grant update (slot, item_id) on public.igloo_slots to authenticated;

-- ---------------------------------------------------------------------------
-- record_round(minigame_id, score, stats)
--
-- Computes the round's payout on the server from the stats, floors it at 0,
-- caps it at the Minigame's per-round maximum, rejects a round that arrives
-- sooner than the Minigame's duration after the Player's previous round of it,
-- updates the personal best, and awards the Minigame's Badge (+50 Tokens the
-- first time only).
--
-- Returns { tokensAwarded, balance, newBest, badgeEarned }. tokensAwarded is
-- the round's payout; the first-time Badge bonus shows up in balance only.
-- badgeEarned is true only on the round that first earns the Badge.
--
-- Errors (the message is the code): not_authenticated, no_player,
-- unknown_minigame, invalid_score, invalid_stats, round_too_soon.
--
-- Rules per Minigame (payout table decided 2026-09-24). Stats keys are
-- non-negative integers; a missing key counts as 0.
--
--   Minigame      Payout per round                       Best            Badge (threshold)       Cap  Interval
--   bug-squash    floor(score / 10)                      score           exterminator (500)      250  60 s
--   pancake-flip  10 golden + 5 flipNow - 5 burnt        stacked         breakfast-club (20)     400  90 s
--   coffee-rush   5 small + 10 medium + 15 large         cups served     barista (15 cups)       400  90 s
--                 + 5 perfect                            (small+medium
--                                                        +large)
--   snow-cone     5 cone5 + 10 cone10 + 15 cone15        tokens earned   brain-freeze (200)      600  120 s
--                 + 25 cone25, rush-hour cones
--                 (rushCone5 ... rushCone25) doubled
--
-- Caps are the proposals from #27, to be confirmed in the red-team review.
-- Intervals are each Minigame's round duration.
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
  v_interval interval;
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
  -- would otherwise turn a penalty (Burnt -5) into a reward.
  if jsonb_typeof(v_stats) <> 'object' then
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
      v_interval := interval '60 seconds';
      v_badge := 'exterminator';
      v_raw := v_score / 10;
      v_best := v_score;
      v_badge_met := v_score >= 500;

    when 'pancake-flip' then
      v_cap := 400;
      v_interval := interval '90 seconds';
      v_badge := 'breakfast-club';
      v_raw := 10 * coalesce((v_stats -> 'golden')::numeric, 0)::int
             + 5 * coalesce((v_stats -> 'flipNow')::numeric, 0)::int
             - 5 * coalesce((v_stats -> 'burnt')::numeric, 0)::int;
      v_best := coalesce((v_stats -> 'stacked')::numeric, 0)::int;
      v_badge_met := v_best >= 20;

    when 'coffee-rush' then
      v_cap := 400;
      v_interval := interval '90 seconds';
      v_badge := 'barista';
      v_raw := 5 * coalesce((v_stats -> 'small')::numeric, 0)::int
             + 10 * coalesce((v_stats -> 'medium')::numeric, 0)::int
             + 15 * coalesce((v_stats -> 'large')::numeric, 0)::int
             + 5 * coalesce((v_stats -> 'perfect')::numeric, 0)::int;
      v_best := coalesce((v_stats -> 'small')::numeric, 0)::int
              + coalesce((v_stats -> 'medium')::numeric, 0)::int
              + coalesce((v_stats -> 'large')::numeric, 0)::int;
      v_badge_met := v_best >= 15;

    when 'snow-cone' then
      v_cap := 600;
      v_interval := interval '120 seconds';
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
  if v_last_finished is not null and now() - v_last_finished < v_interval then
    raise exception 'round_too_soon';
  end if;

  select b.best_score into v_prev_best
  from public.minigame_bests b
  where b.player_id = v_uid and b.minigame_id = v_game;
  v_new_best := v_prev_best is null or v_best > v_prev_best;
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
revoke all on function public.record_round(text, int, jsonb) from public, anon, authenticated;
revoke all on function public.purchase_item(text) from public, anon, authenticated;
grant execute on function public.record_round(text, int, jsonb) to authenticated;
grant execute on function public.purchase_item(text) to authenticated;
