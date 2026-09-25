-- Mini-game leaderboard (#70): the top personal bests across named Players,
-- one board per Minigame, all-time, read from #27's `public.minigame_bests`.
--
-- Runs after 20260924010000_saved_progress.sql (#27). Apply by pasting into
-- the Supabase SQL editor (no CLI). Safe to rerun.
--
-- D1-D11 (2026-09-24 execution plan) and the red-team round 1 findings folded
-- in below:
--
-- D2/R8: ordered by best_score desc, then updated_at asc (#27's record_round
-- only bumps updated_at on a strictly better round, so it is "who reached
-- this score first"), then player_id asc as a final, never-returned
-- tiebreak so the order is always the same. Ranks come from row_number(),
-- so a tie still gets distinct ranks. Cost is O(named Players) per call;
-- `minigame_bests_leaderboard_idx` below (and #27's own
-- `create index if not exists` caveat) keeps that cheap.
-- D3/R1: a Player is left out of the board entirely when their
-- `penguin_name` is blank after stripping the invisible/control/bidi
-- character set below plus [:space:]. #27's `players_penguin_name_check`
-- only forbids *leading/trailing* ASCII whitespace, so a name made only of
-- zero-width or bidi-control characters (invisible, but not blank by that
-- constraint) must be excluded here explicitly. Postgres has no `\p{}`
-- Unicode property classes, so the ranges below are spelled out in hex code
-- points instead (kept aligned with, but not generated from, #75's broader
-- Unicode-property-based `UNSAFE_NAME_CHARS_RE` in
-- `src/contracts/penguin.ts`, which Postgres has no equivalent for): C0
-- controls U+0000-U+001F, DEL and C1 controls U+007F-U+009F, NBSP U+00A0,
-- soft hyphen U+00AD, combining grapheme joiner U+034F, Arabic letter mark
-- U+061C, Hangul fillers U+115F-U+1160, Khmer inherent vowels
-- U+17B4-U+17B5, Mongolian free variation selectors/vowel separator
-- U+180B-U+180F, zero-width space through right-to-left mark
-- U+200B-U+200F, bidi embedding/override controls U+202A-U+202E, word
-- joiner and friends U+2060-U+206F, the Braille blank pattern U+2800, the
-- Hangul filler U+3164, variation selectors U+FE00-U+FE0F, the zero-width
-- no-break space/BOM U+FEFF, and the halfwidth Hangul filler U+FFA0.
--
-- Red-team round 2 (2026-09-25) widened the set further, each spelled out
-- explicitly rather than trusted to a POSIX `[:space:]`/`\s` fallback
-- (which, under the "C" locale PGlite and a hosted Postgres both normally
-- run in, only ever matches ASCII whitespace): Ogham space mark U+1680,
-- every other Unicode space separator U+2000-U+200A, line/paragraph
-- separators U+2028-U+2029, narrow no-break space U+202F, medium
-- mathematical space U+205F, ideographic space U+3000, the unassigned
-- "specials" range U+FFF0-U+FFF8, and four supplementary-plane format-
-- control ranges (`\U` with 8 hex digits, not `\u`'s 4): Egyptian
-- hieroglyph format controls U+13430-U+1343F, Shorthand format controls
-- U+1BCA0-U+1BCA3, musical symbol format controls U+1D173-U+1D17A, and the
-- Tags block U+E0000-U+E0FFF.
-- D4: the caller's own row is appended (with `is_me = true`) when it falls
-- outside the requested `max_rows`; a caller with no best, or whose name is
-- blank, gets no such row (R5). A caller already inside the top `max_rows`
-- is not duplicated.
-- D5: `security definer`, `set search_path = ''`, every relation
-- schema-qualified, `#variable_conflict use_column` (as #27's functions).
-- `max_rows` is clamped to 1..50, defaulting to 10 when omitted or null.
-- R2 (decided 2026-09-24): a `best_score` above a per-Minigame plausibility
-- ceiling is excluded, so a forged client-asserted best (the score isn't
-- recomputed server-side from real play) can't sit at #1 for everyone. The
-- ceilings are derived from each Minigame's own engine constants -- the
-- most a single round could possibly score -- and mirrored in
-- `src/persistence/leaderboard-rules.ts`'s `LEADERBOARD_SCORE_CEILINGS`,
-- with a test asserting the two agree. See that file for the derivation of
-- each number. Coffee Rush and Snow Cone Stand have no engine yet, so
-- nothing is excluded for them (the `else` branch below is a no-op).
-- Residual risk (documented, not fixed here): a forged score under the
-- ceiling still shows; removing one is a one-line moderation delete from
-- `minigame_bests`.
-- Security: the return shape is fixed by `returns table (...)` --
-- `rank`, `penguin_name`, `best_score`, `is_me` only. No `player_id`, email
-- or Google name is ever read or returned; `auth.users` is never touched.
-- Exposure (R9, stated plainly): any signed-in Player can list up to 50
-- named Players' Penguin names and bests per Minigame, including offline
-- Players. Penguin names are already public in-game.

create or replace function public.leaderboard(minigame_id text, max_rows int default 10)
returns table (rank int, penguin_name text, best_score int, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_game text := leaderboard.minigame_id;
  v_max_rows int := least(greatest(coalesce(leaderboard.max_rows, 10), 1), 50);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_game not in ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand') then
    raise exception 'unknown_minigame';
  end if;

  return query
    with eligible as (
      select
        b.player_id,
        pl.penguin_name as penguin_name,
        b.best_score,
        b.updated_at
      from public.minigame_bests b
      join public.players pl on pl.id = b.player_id
      where b.minigame_id = v_game
        -- R1: blank after stripping the invisible/control/bidi set plus
        -- ordinary whitespace (see the header comment for the full range
        -- list and rationale).
        and length(regexp_replace(
              pl.penguin_name,
              '[\u0000-\u001F\u007F-\u009F\u00A0\u00AD\u034F\u061C\u115F-\u1160\u1680\u17B4-\u17B5\u180B-\u180F\u2000-\u200A\u200B-\u200F\u2028\u2029\u202A-\u202E\u202F\u205F\u2060-\u206F\u2800\u3000\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFF8\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF[:space:]]',
              '',
              'g'
            )) > 0
        -- R2: per-Minigame plausibility ceiling. Keep in step with
        -- `LEADERBOARD_SCORE_CEILINGS` (src/persistence/leaderboard-rules.ts).
        and b.best_score <= (
          case v_game
            when 'bug-squash' then 60000
            when 'pancake-flip' then 148
            else b.best_score
          end
        )
    ),
    ranked as (
      select
        (row_number() over (
          order by e.best_score desc, e.updated_at asc, e.player_id asc
        ))::int as rank,
        e.player_id,
        e.penguin_name,
        e.best_score
      from eligible e
    )
    select r.rank, r.penguin_name, r.best_score, (r.player_id = v_uid) as is_me
    from ranked r
    where r.rank <= v_max_rows
    union all
    select r.rank, r.penguin_name, r.best_score, true as is_me
    from ranked r
    where r.player_id = v_uid and r.rank > v_max_rows
    order by rank;
end;
$$;

-- Supports the `order by best_score desc, updated_at asc` ranking above,
-- scoped per Minigame. As #27 notes for its own indexes: `create index if
-- not exists` means an index definition edited later needs a manual drop
-- first for the edit to take effect on a rerun.
create index if not exists minigame_bests_leaderboard_idx
  on public.minigame_bests (minigame_id, best_score desc, updated_at, player_id);

-- Postgres grants EXECUTE to PUBLIC by default, and Supabase adds anon and
-- authenticated. Only signed-in Players may call this. If this signature
-- ever changes, add `drop function if exists` for the old one first (a
-- `create or replace` with a different signature adds a second overload
-- that anon could still call).
revoke all on function public.leaderboard(text, int) from public, anon, authenticated;
grant execute on function public.leaderboard(text, int) to authenticated;
