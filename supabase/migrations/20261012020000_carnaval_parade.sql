-- Carnaval Parade (#219): the LATAM Disco Hall's Minigame
-- (`design/Minigame Carnaval Parade.dc.html`), hosted by Hector Grecco, and
-- its Passista Badge, on #138's Badge system.
--
-- *** record_round is redefined WHOLE, not patched. *** Every Minigame
-- branch below (bug-squash through beystadium) is copied verbatim from
-- 20260928000000_beystadium.sql (the latest definition); only the new
-- 'carnaval-parade' branch is this file's own. leaderboard() is likewise
-- copied verbatim from that file, with 'carnaval-parade' added to its known
-- ids. quest_progress() is untouched (and so not redefined here at all):
-- Passista is a threshold Badge, not a match-win one, so it adds nothing to
-- quest_progress()'s matchWins object.
--
-- *** Rebase note: a sibling LATAM Minigame, Penalty Kick
-- (20261012010000_penalty_kick.sql), is being built in parallel and is
-- expected to land first. Whichever of the two merges second must rebase its
-- own record_round/leaderboard redefinition onto the other's (the same rule
-- 20260928000000_beystadium.sql's own header states): copy the already-merged
-- file's bodies and keep both new branches. As authored, this file does not
-- yet know about Penalty Kick's 'penalty-kick' id.
--
-- Runs after 20261011000000_stair_climb.sql (#51 slice 4). Apply by pasting
-- into the Supabase SQL editor (no CLI). Safe to rerun. Proof:
-- supabase/tests/219_carnaval_parade_proof.sql (run in PGlite by
-- src/persistence/sql-carnaval-parade.test.ts; the reviewer re-runs it on
-- real Postgres/Supabase).
--
-- Deploy order: apply this migration before the client that turns Carnaval
-- Parade on (the DJ turntable hotspot / Hector's dialog) merges or deploys
-- (including a Vercel preview). An old client on this schema keeps working:
-- it never sends minigame_id = 'carnaval-parade', so the new branch and
-- Badge row are simply unused until the client ships.
--
-- Decisions (#219; owner-approved defaults 2026-10-09), each numbered so a
-- review comment can cite it.
--
-- C1 Scope. This file (a) re-adds the two Minigame id check constraints,
-- minigame_bests_minigame_id_check and minigame_rounds_minigame_id_check
-- (last defined by 20260928000000_beystadium.sql), with 'carnaval-parade'
-- added -- both tables, not just minigame_rounds: a scoring round that beats
-- the Player's best inserts into minigame_bests too, so that table's own
-- constraint needs the id as well, or every such round would fail outright;
-- (b) adds a fresh row to public.badges for 'passista' (C2); and (c)
-- replaces record_round(text, int, jsonb) and leaderboard(text, int), each
-- rebased on 20260928000000_beystadium.sql's own (the latest definition). No
-- new tables, columns, policies, table grants or error codes.
--
-- C2 Passista, seeded fresh. Every Badge id up to and including Beystadium's
-- Let It Rip was already seeded "coming soon" (available = false) by
-- 20260927000000_badges.sql, so each one's own follow-up migration only ever
-- flips `available` on. Passista is the first wholly new Badge id since that
-- seed: the fresh row this file adds to public.badges below (id 'passista',
-- name 'Passista', how-to-earn 'SCORE 400 IN THE PARADE', sort_order 16) sets
-- `available` true directly, on first insert, with no separate
-- `update ... set available = true` step and no entry needed in the client's
-- BADGE_AVAILABILITY_OVERRIDES (src/persistence/badge-catalog.ts mirrors
-- this: BADGE_CATALOG's own 'passista' row is already `available: true`).
-- Its own `on conflict (id) do nothing` (not Badges' usual `do update`) is
-- deliberate: nothing later should ever need to touch this row's
-- name/order/how-to-earn from a rerun of this file.
--
-- C3 Payout, computed on the server, but *not* recomputed purely from
-- stats the way every other branch here is. Carnaval Parade's score depends
-- on pickup *order* (the x1-x4 multiplier rides a streak that resets on a
-- miss or a barrier), which the round's own aggregate stats -- feathers,
-- stars, barriersHit, bestStreak -- can't reconstruct. So this branch trusts
-- the client's own `score`, but bounds it first: a score over
-- `(10 * feathers + 25 * stars) * 4` (the most those pickups could possibly
-- have scored, every one at the max x4 multiplier) is invalid_stats, as is
-- `barriersHit` over 3 (the round's own 3 lives mean a 4th hit can't happen
-- honestly -- the round ends the instant the 3rd one lands). Payout is
-- `floor(score / 10)`, capped at 120.
--
-- C4 Best and the Badge. The personal best (and so the leaderboard) is the
-- bound-checked score itself, not a stats-derived number -- `v_best :=
-- v_score`. Passista is earned at `v_score >= 400`, the design's own
-- threshold, exactly like #138's threshold Badges (Barista, Brain Freeze,
-- Exterminator, Breakfast Club): one `public.award_badge` call, paying +50
-- the first time only.
--
-- C5 Anti-farm (#27 RT3's interval rule, unchanged): a round less than 10 s
-- after the Player's previous Carnaval Parade round is round_too_soon;
-- otherwise the payout is at most `floor(120 * min(1, seconds since previous
-- / 45))`. Duration 45 matches the round's own real length (design: `DUR =
-- 45000`), so an honest Player replaying back to back is always paid in
-- full; a scripted caller can earn at most one 120-Token cap per 45 s (160
-- Tokens a minute).
--
-- C6 Validation. On top of #27's shared checks (whole numbers 0-100000, at
-- most 16 keys of at most 32 characters) this branch requires `barriersHit`
-- at or under 3 and `score` at or under the C3 bound. A missing key counts
-- as 0, as everywhere else in record_round. Stats keys match
-- MinigameStatsMap['carnaval-parade'] (src/contracts/game-events.ts):
-- feathers, stars, barriersHit, bestStreak.
--
-- C7 leaderboard(): 'carnaval-parade' joins the known ids, with no
-- plausibility ceiling (the `else` branch): the round's own invalid_stats
-- check (C6) ties a stored score to feathers/stars at the moment it's
-- recorded, but doesn't itself cap how high feathers/stars can honestly
-- climb over a 45 s round (there's no fixed engine constant this migration
-- could cite the way Bug Squash's and Pancake Flip's ceilings do), matching
-- LEADERBOARD_SCORE_CEILINGS['carnaval-parade'] = null in
-- src/persistence/leaderboard-rules.ts (the same choice Coffee Rush, Snow
-- Cone Stand and Beystadium already made).
--
-- C8 Security posture, unchanged from every earlier migration: both
-- functions stay `security definer` with `set search_path = ''`, every
-- relation schema-qualified, `#variable_conflict use_column`, identity from
-- auth.uid() only (no player id argument), EXECUTE revoked from
-- public/anon/authenticated and granted back to authenticated only. anon
-- gets nothing (42501). Residual risk, stated plainly, same as every
-- Minigame: the stats are client-asserted; a signed-in Player calling
-- record_round directly can claim any score up to the C3 bound for whatever
-- feathers/stars they also claim, which pays at most the honest rate (C5)
-- and can earn Passista on one forged round -- the same trust model as every
-- other threshold Badge.
--
-- C9 Ordering and reruns. It sorts after 20261011000000 and, per the rebase
-- note above, before or after 20261012010000_penalty_kick.sql depending on
-- merge order; a later migration that redefines record_round or
-- leaderboard must copy them from whichever of this file and Penalty Kick's
-- merged last, keeping both new branches. Every statement is idempotent
-- (drop/re-add constraints, an insert with `on conflict`, create or
-- replace, revoke/grant). Rerunning 20260927000000_badges.sql or
-- 20260928000000_beystadium.sql after this file silently reverts
-- record_round/leaderboard to their own versions (losing the
-- 'carnaval-parade' branch/id) without touching the Passista row (a plain
-- insert, not part of either file's own seed); the rule stays the same as
-- every earlier migration's: after rerunning any earlier migration, rerun
-- this file and then every later one, in timestamp order.

-- ---------------------------------------------------------------------------
-- Minigame id constraints (named, dropped and re-added each run, as #27 does)
-- ---------------------------------------------------------------------------

alter table public.minigame_bests drop constraint if exists minigame_bests_minigame_id_check;
alter table public.minigame_bests add constraint minigame_bests_minigame_id_check
  check (minigame_id in
    ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium', 'carnaval-parade'));
alter table public.minigame_rounds drop constraint if exists minigame_rounds_minigame_id_check;
alter table public.minigame_rounds add constraint minigame_rounds_minigame_id_check
  check (minigame_id in
    ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium', 'carnaval-parade'));

-- ---------------------------------------------------------------------------
-- Passista, seeded fresh (C2)
-- ---------------------------------------------------------------------------

insert into public.badges (id, name, how_to_earn, sort_order, available) values
  ('passista', 'Passista', 'SCORE 400 IN THE PARADE', 16, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- record_round(minigame_id, score, stats)
--
-- 20260928000000_beystadium.sql's function (see 20260924010000_saved_progress.sql
-- for the full contract, rules table and interval rule) plus one Minigame:
--
--   Minigame          Payout per round                 Best    Badge                      Cap  Duration
--   carnaval-parade   floor(score/10), score bounded    score   passista (score >= 400)    120  45 s
--                      by (10*feathers + 25*stars) * 4
--
-- Returns { tokensAwarded, balance, newBest, badgeEarned, badgesEarned }.
-- Errors (the message is the code), unchanged: not_authenticated,
-- no_player, unknown_minigame, invalid_score, invalid_stats, round_too_soon,
-- and award_badge's unknown_badge / badge_unavailable.
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
  -- B8: the Badge ids this call awarded.
  v_badges text[] := '{}';
  -- Beystadium (B5/B7): the match result, and the match-win count its
  -- Badge needs (null for every threshold-Badge Minigame).
  v_won int;
  v_rounds_won int;
  v_rounds_lost int;
  v_badge_match_wins int;
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

    when 'beystadium' then
      v_cap := 60;
      v_duration_s := 45;
      v_badge := 'let-it-rip';
      v_won := coalesce((v_stats -> 'won')::numeric, 0)::int;
      v_rounds_won := coalesce((v_stats -> 'roundsWon')::numeric, 0)::int;
      v_rounds_lost := coalesce((v_stats -> 'roundsLost')::numeric, 0)::int;
      -- B5: a match result that can't happen is rejected outright.
      if v_won not in (0, 1)
        or v_rounds_won > 2
        or v_rounds_lost > 2
        or (v_rounds_won = 2 and v_rounds_lost = 2)
        or (v_won = 1) <> (v_rounds_won = 2)
        or coalesce((v_stats -> 'bey')::numeric, 0) > 2 then
        raise exception 'invalid_stats';
      end if;
      -- B3: 60 for a win, 15 otherwise.
      v_raw := case when v_won = 1 then 60 else 15 end;
      -- B6: the best is strikes landed.
      v_best := coalesce((v_stats -> 'strikes')::numeric, 0)::int;
      -- B7: decided below, after the Player's row is locked.
      v_badge_match_wins := 3;
      v_badge_met := false;

    when 'carnaval-parade' then
      v_cap := 120;
      v_duration_s := 45;
      v_badge := 'passista';
      -- C3/C6: the score can't exceed what feathers/stars could possibly
      -- have scored at the max x4 multiplier, and a 4th barrier hit can't
      -- happen honestly (the round's own 3 lives).
      if coalesce((v_stats -> 'barriersHit')::numeric, 0) > 3
        or v_score > (
          10 * coalesce((v_stats -> 'feathers')::numeric, 0)::int
          + 25 * coalesce((v_stats -> 'stars')::numeric, 0)::int
        ) * 4 then
        raise exception 'invalid_stats';
      end if;
      -- C3: floor(score / 10), capped below at 120.
      v_raw := v_score / 10;
      -- C4: the best is the bound-checked score itself.
      v_best := v_score;
      v_badge_met := v_score >= 400;

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

  -- B7: a match-win Badge counts the earlier winning rounds plus this one
  -- (inserted at the end of this function), under the row lock above.
  if v_badge_match_wins is not null then
    v_badge_met := v_won = 1 and (
      select count(*)
      from public.minigame_rounds r
      where r.player_id = v_uid
        and r.minigame_id = v_game
        and r.stats -> 'won' = '1'::jsonb
    ) + 1 >= v_badge_match_wins;
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
  -- B7: Let It Rip too; B8: an awarded id goes into badgesEarned.
  if v_badge_met then
    v_badge_earned := public.award_badge(v_uid, v_badge);
    if v_badge_earned then
      v_badges := array_append(v_badges, v_badge);
    end if;
  end if;

  -- The balance is re-read here, after the award, so it includes the +50.
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
    'badgeEarned', v_badge_earned,
    'badgesEarned', to_jsonb(v_badges)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- leaderboard(minigame_id, max_rows)
--
-- 20260928000000_beystadium.sql's function (see 20260924020000_leaderboard.sql
-- for its R1-R9 decisions), unchanged except that 'carnaval-parade' is a
-- known id (C7).
-- ---------------------------------------------------------------------------

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

  if v_game not in
    ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium', 'carnaval-parade') then
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
              '[\u0000-\u001F\u007F-\u009F ­͏؜ᅟ-ᅠ ឴-឵᠋-᠏ - ​-‏  ‪-‮  ⁠-⁯⠀　ㅤ︀-️﻿ﾠ￰-￸\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF[:space:]]',
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

-- Postgres grants EXECUTE to PUBLIC by default, and Supabase adds anon and
-- authenticated. Same signatures as before, so `create or replace` kept
-- each function's single overload; the grants are restated anyway so this
-- file alone leaves them right.
revoke all on function public.record_round(text, int, jsonb) from public, anon, authenticated;
revoke all on function public.leaderboard(text, int) from public, anon, authenticated;
grant execute on function public.record_round(text, int, jsonb) to authenticated;
grant execute on function public.leaderboard(text, int) to authenticated;
