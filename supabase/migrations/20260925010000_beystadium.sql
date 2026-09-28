-- Beystadium: the fifth Minigame (a best-of-3 Beyblade match against
-- Michael, `design/Minigame Beystadium.dc.html`) and its Let It Rip Badge.
--
-- Runs after 20260925000000_quests.sql (#46), and needs #27's
-- 20260924010000_saved_progress.sql and #70's 20260924020000_leaderboard.sql.
-- Apply by pasting into the Supabase SQL editor (no CLI). Safe to rerun.
-- Proof: supabase/tests/80_beystadium_proof.sql (run in PGlite by
-- src/persistence/sql-beystadium.test.ts; the reviewer re-runs it on real
-- Postgres/Supabase).
--
-- Decisions for red-team review (owner-approved defaults, 2026-09-25; no
-- GitHub issue yet). Each is numbered so a review comment can cite it.
--
-- B1 Scope. No new tables, columns, policies or table grants. This file
-- only (a) re-adds three named check constraints with the new ids,
-- 'beystadium' in minigame_bests/minigame_rounds and 'let-it-rip' in
-- player_badges, and (b) replaces three existing functions with the same
-- signatures: record_round(text, int, jsonb) (new 'beystadium' branch),
-- leaderboard(text, int) (accepts 'beystadium'; body otherwise identical to
-- #70's) and quest_progress() (adds matchWins). Every other line of those
-- bodies is copied unchanged from the migration that last defined them.
--
-- B2 Payout, computed on the server from the stats, never from a
-- client-sent amount: 60 Tokens when stats.won = 1 (a match win), else 15
-- (a loss, or a match that ended unfinished: the Minigame shell's timer ran
-- out or the test hook ended it). Cap 60, i.e. exactly the win payout.
--
-- B3 Anti-farm (#27 RT3's interval rule, unchanged): a round less than 10 s
-- after the Player's previous Beystadium round is round_too_soon; otherwise
-- the payout is at most floor(60 * min(1, seconds since previous / 45)).
-- Why duration 45: an honest match (Bey pick, up to three launches and
-- fights, two 1.6 s pauses between battle rounds) takes roughly 30-90 s,
-- plus the how-to screen before it, so a real Player replaying back to back
-- is (nearly) always paid in full, while a scripted caller can earn at most
-- one 60-Token cap per 45 s (80 Tokens a minute; Bug Squash's is 250 per
-- 60 s). A loss replayed every 10 s pays floor(60 * 10 / 45) = 13.
--
-- B4 Validation (invalid_stats, raised before anything is written, like
-- every other stats check). On top of #27's shared checks (whole numbers
-- 0-100000, at most 16 keys of at most 32 characters) the Beystadium branch
-- requires: won is 0 or 1; roundsWon and roundsLost are each 0-2 and not
-- both 2; won = 1 exactly when roundsWon = 2; bey is 0-2. A missing key
-- counts as 0, as everywhere else in record_round. Stats keys match
-- MinigameStatsMap['beystadium'] (src/contracts/game-events.ts): won,
-- roundsWon, roundsLost, strikes, perfectLaunches, bey.
--
-- B5 Score and best: score is strikes landed; the personal best (and so
-- the leaderboard) is stats.strikes, the most strikes in one match.
--
-- B6 Let It Rip is a different Badge shape from the score thresholds: it is
-- earned by the Player's third match win in total. On a winning round,
-- record_round counts the Player's earlier public.minigame_rounds rows for
-- 'beystadium' whose stats.won = 1, adds 1 for this round, and awards the
-- Badge at 3 or more (the existing first-time +50 bonus, once, via the
-- player_badges primary key's `on conflict do nothing`). A losing round
-- never awards it. The count runs after the Player's row is locked (`for
-- update`, like every Token change), so two parallel rounds can't both miss
-- or double-count it; the 10 s rule then rejects the second one anyway.
-- It compares `stats -> 'won' = '1'::jsonb` (jsonb numeric equality, so a
-- stored 1.0 also counts) rather than the text form stats ->> 'won' = '1',
-- which would miss a 1.0 that B4 accepts as a win.
--
-- B7 quest_progress() adds `matchWins`: an object of Minigame id to match
-- wins (the same row count as B6, including rounds recorded before this
-- migration, of which there are none for 'beystadium'), for the Beystadium
-- Quest's "x / 3". Only Minigames with a match-win Badge are counted
-- (Beystadium); a Minigame with no win has no key. Read-only, like the rest
-- of quest_progress().
--
-- B8 leaderboard(): 'beystadium' joins the known ids. No plausibility
-- ceiling (the `else` branch): strikes are not hard-bounded by the game
-- (every SPACE press inside the 450 ms strike zone lands one), matching
-- LEADERBOARD_SCORE_CEILINGS['beystadium'] = null in
-- src/persistence/leaderboard-rules.ts.
--
-- B9 Security posture, unchanged from #27/#46/#70: every function is
-- `security definer` with `set search_path = ''`, every relation
-- schema-qualified, `#variable_conflict use_column`, identity from
-- auth.uid() only (no player id argument), EXECUTE revoked from
-- public/anon/authenticated and granted back to authenticated only. anon
-- gets nothing (42501). No new error codes.
--
-- B10 Residual risk (stated plainly): like every Minigame, the stats are
-- client-asserted. A signed-in Player calling record_round directly can
-- claim a win: that pays at most what B3 allows (60 per 45 s, the honest
-- rate), and three claimed wins (at least 20 s apart) earn Let It Rip --
-- the same trust model as the threshold Badges, each of which one forged
-- round can earn. A forged strikes count can top the Beystadium
-- leaderboard (B8); removing it is a one-line moderation delete from
-- public.minigame_bests.
--
-- B11 Reruns and ordering. Every statement is idempotent (drop/re-add
-- constraints, create or replace, revoke/grant). Because this file
-- replaces functions an earlier migration defined, rerunning
-- saved_progress.sql, leaderboard.sql or quests.sql after it reverts those
-- functions (and, once any 'beystadium' round or 'let-it-rip' Badge exists,
-- saved_progress.sql's own constraint re-add fails on those rows). After
-- rerunning an earlier migration, rerun this one.

-- ---------------------------------------------------------------------------
-- Constraints (named, dropped and re-added each run, as #27 does)
-- ---------------------------------------------------------------------------

alter table public.player_badges drop constraint if exists player_badges_badge_id_check;
alter table public.player_badges add constraint player_badges_badge_id_check
  check (badge_id in ('exterminator', 'breakfast-club', 'barista', 'brain-freeze', 'let-it-rip'));
alter table public.minigame_bests drop constraint if exists minigame_bests_minigame_id_check;
alter table public.minigame_bests add constraint minigame_bests_minigame_id_check
  check (minigame_id in ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium'));
alter table public.minigame_rounds drop constraint if exists minigame_rounds_minigame_id_check;
alter table public.minigame_rounds add constraint minigame_rounds_minigame_id_check
  check (minigame_id in ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium'));

-- ---------------------------------------------------------------------------
-- record_round(minigame_id, score, stats)
--
-- #27's function (see 20260924010000_saved_progress.sql for its full
-- contract, rules table and interval rule) plus one Minigame:
--
--   Minigame     Payout per round        Best      Badge                         Cap  Duration
--   beystadium   60 if won = 1, else 15  strikes   let-it-rip (3rd match win)    60   45 s
--
-- Errors (the message is the code), unchanged: not_authenticated,
-- no_player, unknown_minigame, invalid_score, invalid_stats, round_too_soon.
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
  -- Beystadium (B4/B6): the match result, and the match-win count its
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

    when 'beystadium' then
      v_cap := 60;
      v_duration_s := 45;
      v_badge := 'let-it-rip';
      v_won := coalesce((v_stats -> 'won')::numeric, 0)::int;
      v_rounds_won := coalesce((v_stats -> 'roundsWon')::numeric, 0)::int;
      v_rounds_lost := coalesce((v_stats -> 'roundsLost')::numeric, 0)::int;
      -- B4: a match result that can't happen is rejected outright.
      if v_won not in (0, 1)
        or v_rounds_won > 2
        or v_rounds_lost > 2
        or (v_rounds_won = 2 and v_rounds_lost = 2)
        or (v_won = 1) <> (v_rounds_won = 2)
        or coalesce((v_stats -> 'bey')::numeric, 0) > 2 then
        raise exception 'invalid_stats';
      end if;
      v_raw := case when v_won = 1 then 60 else 15 end;
      v_best := coalesce((v_stats -> 'strikes')::numeric, 0)::int;
      -- B6: decided below, after the Player's row is locked.
      v_badge_match_wins := 3;
      v_badge_met := false;

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

  -- B6: a match-win Badge counts the earlier winning rounds plus this one
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
-- leaderboard(minigame_id, max_rows)
--
-- #70's function (see 20260924020000_leaderboard.sql for its R1-R9
-- decisions), unchanged except that 'beystadium' is a known id (B8).
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

  if v_game not in ('bug-squash', 'pancake-flip', 'coffee-rush', 'snow-cone-stand', 'beystadium') then
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

-- ---------------------------------------------------------------------------
-- quest_progress()
--
-- #46's function, plus `matchWins` (B7). Returns { devPitVisited,
-- roundsFinished, completedQuests, matchWins } for the caller. Read-only.
-- Errors: not_authenticated.
-- ---------------------------------------------------------------------------

create or replace function public.quest_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'devPitVisited', exists (
      select 1 from public.player_quest_state s
      where s.player_id = v_uid and s.dev_pit_visited_at is not null
    ),
    'roundsFinished', coalesce((
      select jsonb_agg(g.minigame_id order by g.minigame_id)
      from (
        select distinct r.minigame_id
        from public.minigame_rounds r
        where r.player_id = v_uid
      ) g
    ), '[]'::jsonb),
    'completedQuests', coalesce((
      select jsonb_agg(c.quest_id order by c.quest_id)
      from public.player_quest_completions c
      where c.player_id = v_uid
    ), '[]'::jsonb),
    -- B7: the same count record_round's B6 makes, per match-win Minigame.
    'matchWins', coalesce((
      select jsonb_object_agg(w.minigame_id, w.wins)
      from (
        select r.minigame_id, count(*) as wins
        from public.minigame_rounds r
        where r.player_id = v_uid
          and r.minigame_id = 'beystadium'
          and r.stats -> 'won' = '1'::jsonb
        group by r.minigame_id
      ) w
    ), '{}'::jsonb)
  );
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and Supabase adds anon and
-- authenticated. Same signatures as before, so `create or replace` kept
-- each function's single overload; the grants are restated anyway so this
-- file alone leaves them right.
revoke all on function public.record_round(text, int, jsonb) from public, anon, authenticated;
revoke all on function public.leaderboard(text, int) from public, anon, authenticated;
revoke all on function public.quest_progress() from public, anon, authenticated;
grant execute on function public.record_round(text, int, jsonb) to authenticated;
grant execute on function public.leaderboard(text, int) to authenticated;
grant execute on function public.quest_progress() to authenticated;
