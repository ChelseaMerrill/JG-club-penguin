-- Pão de Queijo Memory (#218): the LATAM Café's Minigame
-- (`design/Minigame Pao de Queijo Memory.dc.html`), hosted by Sander Nonaka,
-- and its Mestre do Pão de Queijo Badge, on #138's Badge system.
--
-- *** record_round is redefined WHOLE, not patched. *** Every Minigame
-- branch below (bug-squash through carnaval-parade) is copied verbatim from
-- 20261012020000_carnaval_parade.sql (the latest definition); only the new
-- 'pao-de-queijo' branch is this file's own. leaderboard() is likewise
-- copied verbatim from that file, with 'pao-de-queijo' added to its known
-- ids (no new ceiling case -- D7 below). quest_progress() is untouched (and
-- so not redefined here at all) -- D5 below explains why this Minigame's own
-- 'match-wins' Badge still needs no change there.
--
-- *** Deploy order and rerun chain: this file sorts after
-- 20261012020000_carnaval_parade.sql, which itself sorts after
-- 20261012010000_penalty_kick.sql -- apply all three in timestamp order (or,
-- on a fresh project, this file already includes both earlier ones'
-- branches, ids and badge rows, so applying this one alone is equivalent to
-- applying all three in order). Rerunning an EARLIER one of those two files
-- after this one reverts record_round/leaderboard to that earlier file's own
-- version (losing every later branch/id) without touching any Badge row (a
-- plain insert, not part of any one file's own seed) -- the fix, every time,
-- is the same: rerun this file, then every migration after it, in timestamp
-- order.
--
-- Apply by pasting into the Supabase SQL editor (no CLI). Safe to rerun.
-- Proof: supabase/tests/218_pao_de_queijo_proof.sql (run in PGlite by
-- src/persistence/sql-pao-de-queijo.test.ts; the reviewer re-runs it on real
-- Postgres/Supabase).
--
-- Deploy order: apply this migration before the client that turns Pão de
-- Queijo Memory on (Sander Nonaka's own NPC dialog in the LATAM Café) merges
-- or deploys (including a Vercel preview). An old client on this schema
-- keeps working: it never sends minigame_id = 'pao-de-queijo', so the new
-- branch and Badge row are simply unused until the client ships.
--
-- Decisions (#218; owner-approved defaults 2026-10-09), each numbered so a
-- review comment can cite it.
--
-- D1 Scope. This file (a) re-adds the two Minigame id check constraints,
-- minigame_bests_minigame_id_check and minigame_rounds_minigame_id_check
-- (last defined by 20261012020000_carnaval_parade.sql), with 'pao-de-queijo'
-- added -- both tables, the same reason every earlier Minigame migration
-- touches both: a scoring round that beats the Player's best inserts into
-- minigame_bests too, so that table's own constraint needs the id as well,
-- or every such round would fail outright; (b) adds a fresh row to
-- public.badges for 'mestre-do-pao-de-queijo' (D2); and (c) replaces
-- record_round(text, int, jsonb) and leaderboard(text, int), each rebased on
-- 20261012020000_carnaval_parade.sql's own (the latest definition). No new
-- tables, columns, policies, table grants or error codes.
--
-- D2 Mestre do Pão de Queijo, seeded fresh. The fresh row this file adds to
-- public.badges below (id 'mestre-do-pao-de-queijo', name 'Mestre do Pão de
-- Queijo', how-to-earn 'CLEAR ALL 3 ROUNDS', sort_order 18, after #219's
-- Passista at 17) sets `available` true directly, on first insert, with no
-- separate `update ... set available = true` step and no entry needed in the
-- client's BADGE_AVAILABILITY_OVERRIDES (src/persistence/badge-catalog.ts
-- mirrors this: BADGE_CATALOG's own 'mestre-do-pao-de-queijo' row is already
-- `available: true`). Its own `on conflict (id) do nothing` (not Badges'
-- usual `do update`) is deliberate: nothing later should ever need to touch
-- this row's name/order/how-to-earn from a rerun of this file.
--
-- D3 Payout, computed on the server, but *not* recomputed purely from stats
-- the way most branches here are. The design's streak multiplier (x1/x2/x3)
-- depends on match *order* within and across rounds, which the round's own
-- aggregate stats -- roundsCleared, matches, bestStreak -- can't
-- reconstruct (the same reason Carnaval Parade's own branch, and now this
-- one, bound the client's score instead of recomputing it). So this branch
-- trusts the client's own `score`, but bounds it first (D6). Payout is
-- `floor(score / 10)`, capped at 300.
--
-- D4 Best and the leaderboard. The personal best (and so the leaderboard)
-- is the bound-checked score itself, not `roundsCleared` -- `v_best :=
-- v_score` -- exactly like Carnaval Parade's own branch. See D5 for why the
-- Badge below is gated on `roundsCleared` directly instead.
--
-- D5 The Badge: a 'match-wins' Badge, reused at a 1-win threshold rather
-- than a new rule kind or a `v_best` threshold. Because `v_best` is the
-- round's own score (D4), and a slow, careful full clear can score lower
-- than an unlucky partial one (the same tension the client's
-- quest-definitions.ts comment on this Minigame's own Quest explains), no
-- fixed score threshold can both award the Badge on every honest full clear
-- and withhold it from every honest partial one. `roundsCleared >= 3` can,
-- directly -- so this branch treats a round reporting that as a "win", the
-- same shape Beystadium's own 'match-wins' Badge already uses (one win is
-- enough here, so `v_badge_match_wins := 1`). quest_progress()'s own
-- `matchWins` object stays hardcoded to 'beystadium' (untouched by this
-- file): this Minigame's own Quest still finishes correctly regardless,
-- since `evaluateQuest` (src/quests/quest-engine.ts) always also checks
-- `badges.includes(badgeId)` -- see minigame-rules.ts's and
-- quest-definitions.ts's own comments on this Minigame for the fuller
-- explanation.
--
-- D6 Validation. On top of #27's shared checks (whole numbers 0-100000, at
-- most 16 keys of at most 32 characters) this branch rejects `roundsCleared`
-- over 3, `matches` over 24 (every round's `cols * rows / 2` pairs, summed:
-- 6 + 8 + 10), a `bestStreak` over `matches` (a streak can't outrun the
-- matches that built it), and a `score` over the most those stats could
-- honestly score: every match worth at most 300 (the x3 streak cap) plus
-- 180 (`3 * 60`, the design's own longest round timer, a loose but safe
-- per-cleared-round time-bonus cap) per cleared round -- `matches * 300 +
-- roundsCleared * 180`. This bound is deliberately loose (it never ties the
-- bonus to each round's own, shorter timer), so it never rejects a
-- legitimate round; the true ceiling a flawless full clear can reach is
-- 6,795, comfortably under this check's own 7,740 at
-- `roundsCleared = 3, matches = 24`. Mirrored exactly in
-- src/persistence/minigame-rules.ts's `paoDeQueijoStatsValid` (client-side,
-- for the in-memory fake); stats keys match
-- MinigameStatsMap['pao-de-queijo'] (src/contracts/game-events.ts):
-- roundsCleared, matches, bestStreak.
--
-- D7 Anti-farm (#27 RT3's interval rule, unchanged): a round less than 10 s
-- after the Player's previous Pão de Queijo Memory round is round_too_soon;
-- otherwise the payout is at most `floor(300 * min(1, seconds since
-- previous / 165))`. Duration 165 is the design's own three round timers
-- summed (60 + 55 + 50), so an honest Player replaying back to back is
-- always paid in full; a scripted caller can earn at most one 300-Token cap
-- per 165 s.
--
-- D8 leaderboard(): 'pao-de-queijo' joins the known ids, with no
-- plausibility ceiling (the `else` branch): D6's own invalid_stats check
-- ties a stored score to roundsCleared/matches at the moment it's recorded,
-- but this migration leaves leaderboard()'s own ceiling `case` otherwise
-- untouched (the same choice Penalty Kick's and Carnaval Parade's own
-- migrations made), matching LEADERBOARD_SCORE_CEILINGS['pao-de-queijo'] =
-- null in src/persistence/leaderboard-rules.ts.
--
-- D9 Security posture, unchanged from every earlier migration: both
-- functions stay `security definer` with `set search_path = ''`, every
-- relation schema-qualified, `#variable_conflict use_column`, identity from
-- auth.uid() only (no player id argument), EXECUTE revoked from
-- public/anon/authenticated and granted back to authenticated only. anon
-- gets nothing (42501). Residual risk, stated plainly, same as every other
-- Minigame: the stats are client-asserted; a signed-in Player calling
-- record_round directly can claim any score up to the D6 bound for whatever
-- roundsCleared/matches they also claim, which pays at most the honest rate
-- (D7) and can earn Mestre do Pão de Queijo on one forged round claiming
-- `roundsCleared: 3` -- the same trust model as every other Badge here.
--
-- D10 Ordering and reruns. Every statement is idempotent (drop/re-add
-- constraints, an insert with `on conflict`, create or replace,
-- revoke/grant). Rerunning an earlier Minigame migration after this file
-- silently reverts record_round/leaderboard to that earlier version (losing
-- this file's own 'pao-de-queijo' branch/id) without touching the Mestre do
-- Pão de Queijo row; the fix is the one stated in the header above: rerun
-- this file, then every later migration, in timestamp order.

-- ---------------------------------------------------------------------------
-- Minigame id constraints (named, dropped and re-added each run, as #27 does)
-- ---------------------------------------------------------------------------

alter table public.minigame_bests drop constraint if exists minigame_bests_minigame_id_check;
alter table public.minigame_bests add constraint minigame_bests_minigame_id_check
  check (minigame_id in
    ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium', 'penalty-kick', 'carnaval-parade', 'pao-de-queijo'));
alter table public.minigame_rounds drop constraint if exists minigame_rounds_minigame_id_check;
alter table public.minigame_rounds add constraint minigame_rounds_minigame_id_check
  check (minigame_id in
    ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium', 'penalty-kick', 'carnaval-parade', 'pao-de-queijo'));

-- ---------------------------------------------------------------------------
-- Mestre do Pão de Queijo, seeded fresh (D2)
-- ---------------------------------------------------------------------------

insert into public.badges (id, name, how_to_earn, sort_order, available) values
  ('mestre-do-pao-de-queijo', 'Mestre do Pão de Queijo', 'CLEAR ALL 3 ROUNDS', 18, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- record_round(minigame_id, score, stats)
--
-- 20261012020000_carnaval_parade.sql's function plus one Minigame:
--
--   Minigame         Payout per round                Best   Badge                              Cap  Duration
--   pao-de-queijo    floor(score/10), score bounded   score  mestre-do-pao-de-queijo             300  165 s
--                     by matches*300 + roundsCleared*180            (roundsCleared >= 3, 1 "win")
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
  -- Beystadium (B5/B7) and now Pão de Queijo Memory (D5): the match-win
  -- threshold its own Badge needs (null for every threshold-Badge Minigame),
  -- and whether *this* round counts as one, decided per-branch below (D5's
  -- `v_is_win`) since each Minigame's own "win" predicate differs.
  v_won int;
  v_rounds_won int;
  v_rounds_lost int;
  v_badge_match_wins int;
  v_is_win boolean;
  -- Penalty Kick (20261012010000_penalty_kick.sql P5/P6).
  v_goals int;
  v_golazos int;
  -- Pão de Queijo Memory (D5/D6).
  v_rounds_cleared int;
  v_matches int;
  v_best_streak int;
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
      v_is_win := v_won = 1;
      v_badge_met := false;

    when 'penalty-kick' then
      v_cap := 250;
      v_duration_s := 30;
      v_badge := 'goleador';
      v_goals := coalesce((v_stats -> 'goals')::numeric, 0)::int;
      v_golazos := coalesce((v_stats -> 'golazos')::numeric, 0)::int;
      -- P5: a solo, 5-shot round can never claim more than 5 scores.
      if v_goals + v_golazos > 5 then
        raise exception 'invalid_stats';
      end if;
      -- P3: 30 per goal, 50 per golazo.
      v_raw := 30 * v_goals + 50 * v_golazos;
      -- P6: the best is goals + golazos.
      v_best := v_goals + v_golazos;
      -- P6: Goleador at 4 or 5 scored.
      v_badge_met := v_best >= 4;


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

    when 'pao-de-queijo' then
      v_cap := 300;
      v_duration_s := 165;
      v_badge := 'mestre-do-pao-de-queijo';
      v_rounds_cleared := coalesce((v_stats -> 'roundsCleared')::numeric, 0)::int;
      v_matches := coalesce((v_stats -> 'matches')::numeric, 0)::int;
      v_best_streak := coalesce((v_stats -> 'bestStreak')::numeric, 0)::int;
      -- D6: roundsCleared can't exceed the design's own 3 rounds, matches
      -- can't exceed the 24 pairs across all three, a streak can't outrun
      -- the matches that built it, and the score can't exceed the most
      -- those stats could honestly score (every match worth at most 300,
      -- plus a loose 180-per-cleared-round time-bonus cap).
      if v_rounds_cleared > 3
        or v_matches > 24
        or v_best_streak > v_matches
        or v_score > v_matches * 300 + v_rounds_cleared * 180 then
        raise exception 'invalid_stats';
      end if;
      -- D3: floor(score / 10), capped below at 300.
      v_raw := v_score / 10;
      -- D4: the best is the bound-checked score itself.
      v_best := v_score;
      -- D5: a 'match-wins' Badge at a 1-win threshold -- "cleared all 3
      -- rounds" is this Minigame's only kind of win, decided below (B7's
      -- same pattern) under the Player's row lock.
      v_badge_match_wins := 1;
      v_is_win := v_rounds_cleared >= 3;
      v_badge_met := false;

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

  -- B7/D5: a match-win Badge counts the earlier winning rounds plus this one
  -- (inserted at the end of this function), under the row lock above. Each
  -- Minigame's own "win" column is read by its own `case` branch below
  -- (`stats -> 'won'` for Beystadium, `stats -> 'roundsCleared'` for Pão de
  -- Queijo Memory); `v_is_win` (set per-branch above) decides whether *this*
  -- round counts.
  if v_badge_match_wins is not null then
    v_badge_met := v_is_win and (
      select count(*)
      from public.minigame_rounds r
      where r.player_id = v_uid
        and r.minigame_id = v_game
        and case v_game
              when 'beystadium' then r.stats -> 'won' = '1'::jsonb
              when 'pao-de-queijo' then
                coalesce((r.stats -> 'roundsCleared')::numeric, 0) >= 3
              else false
            end
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
  -- B7: an awarded id goes into badgesEarned.
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
-- 20261012020000_carnaval_parade.sql's function (see
-- 20260924020000_leaderboard.sql for its R1-R9 decisions), unchanged except
-- that 'pao-de-queijo' is a known id (D8).
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
    ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium', 'penalty-kick', 'carnaval-parade', 'pao-de-queijo') then
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
              '[\u0000-\u001F\u007F-\u009F ­͏؜ᅟ-ᅠ ឴-឵᠋-᠏ - ​-‏  ‪-‮  ⁠-⁯⠀　ㅤ︀-️﻿ﾠ￰-￸\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF[:space:]]',
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
