-- #135: Igloo wall and ceiling slots.
--
-- Every Igloo Gear item gets one placement (floor, wall or ceiling), and the
-- Igloo grows from 6 slots to 11: 1-6 floor, 7-10 wall, 11 ceiling. An item
-- fits only slots of its own placement, enforced below by the
-- igloo_slots_placement_guard trigger. The RGB Light Strip moves to wall and
-- the Disco Ball to ceiling; four new wall items and the three JG award wall
-- items are seeded; existing Players' RGB Light Strips and Disco Balls in
-- floor slots move to a matching slot.
--
-- Apply by pasting into the Supabase SQL editor, after #138's
-- 20260927000000_badges.sql. Safe to rerun: every step is idempotent, and a
-- rerun of the data migration (step 5) is a no-op.
--
-- Deploy order: apply this BEFORE the #135 client deploys. The new client
-- selects shop_items.placement and fails loadAll without it. An old client
-- keeps working on this schema, degraded: it ignores slots 7-11, so a moved
-- RGB Light Strip or Disco Ball looks unplaced to it until the new build
-- loads. No ownership is ever lost.

-- ---------------------------------------------------------------------------
-- 1. shop_items.placement
-- ---------------------------------------------------------------------------

alter table public.shop_items
  add column if not exists placement text not null default 'floor';

alter table public.shop_items drop constraint if exists shop_items_placement_check;
alter table public.shop_items
  add constraint shop_items_placement_check check (placement in ('floor', 'wall', 'ceiling'));

-- ---------------------------------------------------------------------------
-- 2. Catalog: placements, four new wall items, the JG award wall items
-- ---------------------------------------------------------------------------

-- #143's decoration quest checks the three award ids below.
insert into public.shop_items (id, stall, name, price, art_key, placement) values
  ('beanbag',              'igloo', 'Beanbag',              50, 'beanbag',              'floor'),
  ('desk',                 'igloo', 'Desk',                 80, 'desk',                 'floor'),
  ('speakers',             'igloo', 'Speakers',            100, 'speakers',             'floor'),
  ('dual-monitors',        'igloo', 'Dual Monitors',       120, 'dual-monitors',        'floor'),
  ('arcade-cabinet',       'igloo', 'Arcade Cabinet',      250, 'arcade-cabinet',       'floor'),
  ('rgb-light-strip',      'igloo', 'RGB Light Strip',      60, 'rgb-light-strip',      'wall'),
  ('disco-ball',           'igloo', 'Disco Ball',          150, 'disco-ball',           'ceiling'),
  ('jg-pennant',           'igloo', 'JG Pennant',           40, 'jg-pennant',           'wall'),
  ('framed-team-photo',    'igloo', 'Framed Team Photo',    60, 'framed-team-photo',    'wall'),
  ('ship-it-sign',         'igloo', 'Neon "SHIP IT" Sign',  90, 'ship-it-sign',         'wall'),
  ('dartboard',            'igloo', 'Dartboard',           110, 'dartboard',            'wall'),
  ('award-bptw',           'igloo', 'Best Places to Work',  60, 'award-bptw',           'wall'),
  ('award-inc5000',        'igloo', 'Inc. 5000',            60, 'award-inc5000',        'wall'),
  ('award-top-workplaces', 'igloo', 'Top Workplaces',       60, 'award-top-workplaces', 'wall')
on conflict (id) do update
  set stall = excluded.stall,
      name = excluded.name,
      price = excluded.price,
      art_key = excluded.art_key,
      placement = excluded.placement;

-- ---------------------------------------------------------------------------
-- 3. igloo_slots.slot widens to 1-11
-- ---------------------------------------------------------------------------

-- igloo_slots_slot_check is the name Postgres generated for #27's inline
-- check (slot between 1 and 6).
alter table public.igloo_slots drop constraint if exists igloo_slots_slot_check;
alter table public.igloo_slots
  add constraint igloo_slots_slot_check check (slot between 1 and 11);

-- ---------------------------------------------------------------------------
-- 4. Each slot's placement
-- ---------------------------------------------------------------------------

-- Mirrors IGLOO_SLOT_PLACEMENT in src/persistence/progress-store.ts.
create or replace function public.igloo_slot_placement(s smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when s between 1 and 6 then 'floor'
    when s between 7 and 10 then 'wall'
    when s = 11 then 'ceiling'
    else null
  end
$$;

revoke all on function public.igloo_slot_placement(smallint) from public, anon, authenticated;
grant execute on function public.igloo_slot_placement(smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Data migration: misplaced items move to a matching slot
-- ---------------------------------------------------------------------------

-- On a first apply, only RGB Light Strips and Disco Balls in floor slots are
-- misplaced, and every Player's slots 7-11 are still empty, so each one
-- moves. The "no free slot" branch unplaces the item (the player_items row
-- stays, so it's still owned); it only runs on a rerun after mismatched rows
-- were written with the guard disabled.
do $$
declare
  r record;
  target smallint;
begin
  for r in
    select s.player_id, s.slot, s.item_id, i.placement
    from public.igloo_slots s
    join public.shop_items i on i.id = s.item_id
    where i.placement <> public.igloo_slot_placement(s.slot)
    order by s.player_id, s.item_id
  loop
    select min(candidate)::smallint into target
    from generate_series(1, 11) as candidate
    where public.igloo_slot_placement(candidate::smallint) = r.placement
      and not exists (
        select 1 from public.igloo_slots o
        where o.player_id = r.player_id and o.slot = candidate
      );

    if target is null then
      delete from public.igloo_slots
      where player_id = r.player_id and slot = r.slot;
    else
      update public.igloo_slots
      set slot = target
      where player_id = r.player_id and slot = r.slot;
    end if;
  end loop;

  if exists (
    select 1
    from public.igloo_slots s
    join public.shop_items i on i.id = s.item_id
    where i.placement <> public.igloo_slot_placement(s.slot)
  ) then
    raise exception 'igloo_slots still has misplaced items after the #135 data migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The placement guard (created after step 5, so step 5's moves aren't blocked)
-- ---------------------------------------------------------------------------

-- Raises wrong_placement (23514) when a row's item doesn't fit its slot.
-- An out-of-range slot returns NEW unchanged, so igloo_slots_slot_check
-- still answers invalid_slot. An unknown item id also passes through:
-- its placement lookup is null, null <> 'wall' is not true, and the
-- ownership foreign key then rejects the row with 23503 (not_owned).
-- Keep the lookup a plain `select ... into`: `into strict` or an
-- `if not found then raise` would turn that 23503 into a trigger error.
create or replace function public.igloo_slots_enforce_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  slot_placement text := public.igloo_slot_placement(new.slot);
  item_placement text;
begin
  if slot_placement is null then
    return new;
  end if;

  select i.placement into item_placement
  from public.shop_items i
  where i.id = new.item_id;

  if item_placement <> slot_placement then
    raise exception 'wrong_placement' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.igloo_slots_enforce_placement() from public, anon, authenticated;

drop trigger if exists igloo_slots_placement_guard on public.igloo_slots;
create trigger igloo_slots_placement_guard
  before insert or update of slot, item_id on public.igloo_slots
  for each row execute function public.igloo_slots_enforce_placement();
