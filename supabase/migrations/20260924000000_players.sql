-- public.players: one row per Player, keyed by their Supabase auth user.
-- Google identity stays in auth.users; this table only holds game state.
-- Apply by pasting into the Supabase SQL editor (no CLI). Safe to rerun.

create table if not exists public.players (
  id uuid primary key references auth.users (id) on delete cascade,
  penguin_color text not null default '#00bdff'
    check (penguin_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

alter table public.players enable row level security;

-- A Player sees only their own row. Other Penguins' colors travel in Presence.
drop policy if exists "players select own row" on public.players;
create policy "players select own row"
  on public.players for select to authenticated
  using (auth.uid() = id);

-- First sign-in creates the Player's own row.
drop policy if exists "players insert own row" on public.players;
create policy "players insert own row"
  on public.players for insert to authenticated
  with check (auth.uid() = id);

-- A Player may change only their own row.
drop policy if exists "players update own row" on public.players;
create policy "players update own row"
  on public.players for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No delete policy: rows go away only via the auth.users cascade.

-- Explicit grants instead of Supabase defaults. Column-level UPDATE keeps
-- id and created_at immutable.
revoke all on public.players from anon;
revoke all on public.players from authenticated;
-- Column-level INSERT, so a first sign-in can't choose columns added later
-- (such as #27's Token balance) if this file is ever rerun.
grant select on public.players to authenticated;
grant insert (id, penguin_color) on public.players to authenticated;
grant update (penguin_color) on public.players to authenticated;
