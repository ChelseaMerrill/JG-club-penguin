-- public.players.penguin: the Player's saved Penguin from the Penguin Creator
-- (name, colors, hat, belly pattern, eyes). Null until they first save one,
-- which is how the client knows to open the creator on first sign-in.
-- Apply by pasting into the Supabase SQL editor (no CLI), after
-- 20260924000000_players.sql. Safe to rerun.
--
-- The client selects this column on every sign-in, so apply this migration
-- BEFORE deploying the client that reads it.

alter table public.players add column if not exists penguin jsonb;

-- Mirrors parseAppearance() in src/penguin/appearance.ts. Keep the option
-- lists in sync with HATS / PATTERNS / EYES there. coalesce(..., false)
-- rejects a missing key, which would otherwise make the check NULL (a pass).
alter table public.players drop constraint if exists players_penguin_shape;
alter table public.players add constraint players_penguin_shape check (
  penguin is null or coalesce(
    jsonb_typeof(penguin) = 'object'
    and pg_column_size(penguin) <= 1024
    and jsonb_typeof(penguin -> 'name') = 'string'
    and char_length(penguin ->> 'name') between 1 and 20
    and (penguin ->> 'name') !~ '[[:cntrl:]]'
    and (penguin ->> 'body') ~ '^#[0-9a-f]{6}$'
    and (penguin ->> 'cap') ~ '^#[0-9a-f]{6}$'
    and (penguin ->> 'beak') ~ '^#[0-9a-f]{6}$'
    and (penguin ->> 'feet') ~ '^#[0-9a-f]{6}$'
    and (penguin ->> 'hat') in ('JG CAP', 'SNORKEL', 'HEADPHONES', 'WAR WEEK BAND', 'NONE')
    and (penguin ->> 'pattern') in ('PLAIN', 'HEX', 'STRIPES', 'JG LOGO', 'PIXEL HEART', 'SNOWFLAKE')
    and (penguin ->> 'eyes') in ('ROUND', 'SLEEPY', 'STAR', 'WINK'),
    false
  )
);

-- penguin_color stays the single color other tracks read (in-world tint,
-- Presence). Once a Penguin is saved it must equal the Penguin's body color.
alter table public.players drop constraint if exists players_penguin_color_matches_body;
alter table public.players add constraint players_penguin_color_matches_body check (
  penguin is null or penguin_color = penguin ->> 'body'
);

-- Row access is unchanged: the existing "update own row" RLS policy still
-- scopes every write to auth.uid() = id. This only widens the column grant.
grant update (penguin_color, penguin) on public.players to authenticated;
