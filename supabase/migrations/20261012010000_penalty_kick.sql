-- Penalty Kick (#220): the sixth Minigame (five solo penalties against a
-- keeper at the LATAM Futebol Field, `design/Minigame Penalty Kick.dc.html`,
-- hosted by Chrystian Rissoli) and its Goleador Badge.
--
-- Runs after 20261011000000_stair_climb.sql, and needs #27's
-- 20260924010000_saved_progress.sql, #70's 20260924020000_leaderboard.sql,
-- #46's 20260925000000_quests.sql and #138's 20260927000000_badges.sql.
-- Apply by pasting into the Supabase SQL editor (no CLI). Safe to rerun.
-- Proof: supabase/tests/penalty_kick_proof.sql (run in PGlite by
-- src/persistence/sql-penalty-kick.test.ts; the reviewer re-runs it on real
-- Postgres/Supabase).
--
-- Deploy order: apply this migration before the client that turns Penalty
-- Kick on merges or deploys (including a Vercel preview). An old client on
-- this schema keeps working: it never sends minigame_id = 'penalty-kick'.
--
-- *** record_round is redefined IN FULL below, not patched. *** Any sibling
-- LATAM Minigame migration that lands after this one (Carnaval Parade,
-- `20261012020000_carnaval_parade.sql`, #219, built in parallel) MUST rebase
-- its own record_round redefinition on top of THIS file's -- i.e. copy this
-- file's record_round body verbatim and add only its own `when
-- 'carnaval-parade' then` case -- or it will silently drop the
-- 'penalty-kick' branch below and break every Penalty Kick round. The same
-- rule applies in reverse if Carnaval Parade lands first: this file would
-- need to rebase onto it instead. Whichever lands second rebases.
--
-- Decisions for red-team review (#220; owner-approved defaults 2026-10-09).
-- Each is numbered so a review comment can cite it.
--
-- P1 Scope. No new tables, columns or policies. This file only
-- (a) extends #27's two Minigame id check constraints,
-- minigame_bests_minigame_id_check and minigame_rounds_minigame_id_check
-- (last defined by 20260928000000_beystadium.sql; nothing later changed
-- them), with 'penalty-kick' added; (b) inserts the Goleador Badge, already
-- available -- unlike every Badge #138 seeded (including Beystadium's Let
-- It Rip and Snow Cone Stand's Brain Freeze), Goleador didn't exist before
-- this ticket, so it has no earlier placeholder row to flip on; and
-- (c) redefines record_round(text, int, jsonb), copied whole from
-- 20260928000000_beystadium.sql (the latest definition) with exactly one
-- added case, 'penalty-kick'; and (d) redefines leaderboard(text, int), copied
-- whole from the same file with 'penalty-kick' added to its known ids (P9),
-- so the Minigame done screen's leaderboard works for this game.
-- quest_progress() is not touched.
--
-- P2 Goleador: `insert into public.badges (...) values ('goleador',
-- 'Goleador', 'SCORE 4 OF 5 PENALTIES', 16, true) on conflict (id) do
-- update set name = excluded.name, how_to_earn = excluded.how_to_earn,
-- sort_order = excluded.sort_order` -- #138's own insert pattern, minus
-- ever touching `available` on conflict (so a rerun can't un-flip it, same
-- rule as every other Badge). Mirrored in src/persistence/badge-catalog.ts
-- (BADGE_CATALOG's own entry, appended after the original 15 -- not a
-- BADGE_AVAILABILITY_OVERRIDES flip, since nothing earlier seeded it
-- unavailable).
--
-- P3 Payout, computed on the server from the stats, never from a
-- client-sent amount: 30 Tokens per goal, 50 per golazo
-- (30 * stats.goals + 50 * stats.golazos). Cap 250, i.e. 5 golazos (the
-- most a 5-shot round can ever claim, P5).
--
-- P4 Anti-farm (#27 RT3's interval rule, unchanged): a round less than 10 s
-- after the Player's previous Penalty Kick round is round_too_soon;
-- otherwise the payout is at most floor(250 * min(1, seconds since
-- previous / 30)). Why duration 30: five shots, each a couple of seconds
-- including the sweep and the result pause (and faster each kick), take
-- roughly 15-25 s in total, so a real Player replaying back to back is
-- (nearly) always paid in full, while a scripted caller can earn at most one
-- 250-Token cap per 30 s (500 Tokens a minute).
--
-- P5 Validation (invalid_stats, raised before anything is written, like
-- every other stats check). On top of #27's shared checks (whole numbers
-- 0-100000, at most 16 keys of at most 32 characters) the Penalty Kick
-- branch requires: goals + golazos <= 5 (it is a solo, 5-shot round, so a
-- round can never claim more scores than it had shots). Stats keys match
-- MinigameStatsMap['penalty-kick'] (src/contracts/game-events.ts): goals,
-- golazos, saved, wide, over. A missing key counts as 0, as everywhere else.
--
-- P6 Score, best and Badge: score is goals + golazos (the round's total
-- scored shots, out of 5); the personal best (and so, once a later migration
-- extends leaderboard() per the note above, the leaderboard) is the same
-- goals + golazos. Goleador is earned at goals + golazos >= 4 (score 4 of
-- the 5 penalties) -- a threshold Badge, #138's shape, not Beystadium's
-- match-win one: no match-win counting needed here.
--
-- P7 Security posture, unchanged from #27/#46/#70/#138/#121: every function
-- is `security definer` with `set search_path = ''`, every relation
-- schema-qualified, `#variable_conflict use_column`, identity from
-- auth.uid() only (no player id argument), EXECUTE revoked from
-- public/anon/authenticated and granted back to authenticated only. anon
-- gets nothing (42501). Residual risk, stated plainly: like every Minigame,
-- the stats are client-asserted. A signed-in Player calling record_round
-- directly can claim 4+ goals/golazos and Goleador on the very first call;
-- that pays at most what P4 allows (250 per 30 s, the honest rate) and earns
-- the Badge once, the same trust model as every other threshold Badge.
--
-- P9 leaderboard(): 'penalty-kick' joins the known ids, exactly as
-- Beystadium's own migration added 'beystadium' (its B9). Its best_score is
-- minigame_bests.best_score, goals + golazos (0-5); no score ceiling is
-- needed (LEADERBOARD_SCORE_CEILINGS['penalty-kick'] is null, like
-- Beystadium's). A sibling Minigame migration that lands later must keep
-- 'penalty-kick' in this list too.
--
-- P8 Ordering and reruns. It sorts after 20261011000000_stair_climb.sql (the
-- latest migration as of this ticket) and before any sibling LATAM Minigame
-- migration that lands after it (see the note above); a later migration that
-- redefines record_round must copy it from this file and keep the
-- 'penalty-kick' branch. Every statement is idempotent (drop/re-add
-- constraints, an upsert, create or replace, revoke/grant). Rerunning #27,
-- #70, #46, #138 or #121 after this file silently reverts the function it
-- defines, and rerunning #27 also re-adds its 4-id constraints, which fail
-- once any 'penalty-kick' round exists. The rule stays #138's: after
-- rerunning any earlier migration, rerun this file and then every later one,
-- in timestamp order.

-- ---------------------------------------------------------------------------
-- Minigame id constraints (named, dropped and re-added each run, as #27 does)
-- ---------------------------------------------------------------------------

alter table public.minigame_bests drop constraint if exists minigame_bests_minigame_id_check;
alter table public.minigame_bests add constraint minigame_bests_minigame_id_check
  check (minigame_id in
    ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium', 'penalty-kick'));
alter table public.minigame_rounds drop constraint if exists minigame_rounds_minigame_id_check;
alter table public.minigame_rounds add constraint minigame_rounds_minigame_id_check
  check (minigame_id in
    ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium', 'penalty-kick'));

-- ---------------------------------------------------------------------------
-- Goleador (P2): inserted fresh, already available -- it isn't one of #138's
-- original 15 rows, so there is nothing to flip on later.
-- ---------------------------------------------------------------------------

insert into public.badges (id, name, how_to_earn, sort_order, available) values
  ('goleador', 'Goleador', 'SCORE 4 OF 5 PENALTIES', 16, true)
on conflict (id) do update
  set name = excluded.name,
      how_to_earn = excluded.how_to_earn,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- record_round(minigame_id, score, stats)
--
-- #138's function shape (20260927000000_badges.sql), rebased on the latest
-- definition (20260928000000_beystadium.sql; see that file for the full
-- contract, shared validation and the interval rule) plus one Minigame:
--
--   Minigame      Payout per round             Best            Badge                      Cap  Duration
--   penalty-kick  30*goals + 50*golazos        goals + golazos  goleador (>= 4 scored)     250  30 s
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
  -- B8/P6: the Badge ids this call awarded.
  v_badges text[] := '{}';
  -- Beystadium (B5/B7): the match result, and the match-win count its
  -- Badge needs (null for every threshold-Badge Minigame).
  v_won int;
  v_rounds_won int;
  v_rounds_lost int;
  v_badge_match_wins int;
  -- Penalty Kick (P5/P6): goals and golazos, counted separately since they
  -- pay differently.
  v_goals int;
  v_golazos int;
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
  -- B7/P6: an awarded id goes into badgesEarned.
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

-- Postgres grants EXECUTE to PUBLIC by default, and Supabase adds anon and
-- authenticated. Same signature as before, so `create or replace` kept the
-- single overload; the grant is restated anyway so this file alone leaves
-- it right.
revoke all on function public.record_round(text, int, jsonb) from public, anon, authenticated;
grant execute on function public.record_round(text, int, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- leaderboard(minigame_id, max_rows)
--
-- #70's function (see 20260924020000_leaderboard.sql for its R1-R9
-- decisions), unchanged from 20260928000000_beystadium.sql except that 'penalty-kick' is
-- a known id too (P9).
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

  if v_game not in ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium', 'penalty-kick') then
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

revoke all on function public.leaderboard(text, int) from public, anon, authenticated;
grant execute on function public.leaderboard(text, int) to authenticated;
