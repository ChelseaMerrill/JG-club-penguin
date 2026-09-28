-- Beystadium proof, against the #9 H1 fixture Player, in #46's
-- 46_quests_proof.sql style. Covers 20260928000000_beystadium.sql's
-- decisions B1-B10.
--
-- What this proves, as the fixture signed in (role authenticated):
-- record_round('beystadium', ...) pays 60 for a won match and 15 for a lost
-- one (B3), with the best set to strikes landed (B6); a second round inside
-- 10 s is round_too_soon and a round half the 45 s window after the
-- previous one is clamped to 30 (B4); an impossible match result is
-- invalid_stats and pays nothing (B5); Let It Rip is awarded on exactly the
-- third match win, through public.award_badge (with the Badge switched off,
-- that same third win fails with award_badge's own badge_unavailable), a
-- loss in between never counts, the +50 is paid once, badgesEarned is
-- ["let-it-rip"] on that call only and [] on every other, and a fourth win
-- earns nothing more (B7, B8); public.badges has Let It Rip available
-- (B2); quest_progress() reports matchWins (B9); leaderboard('beystadium')
-- is accepted (B9); as anon every touched function is denied (42501).
-- Also: each of the three functions is security definer with
-- search_path = '' and exactly one overload, with EXECUTE granted to
-- authenticated only, and award_badge stays internal (B10).
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside pg_temp.proof_80(), which
-- ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the fixture's rounds, best, Badge and Tokens).
-- It prints only booleans, counts and Token amounts -- no Player's name, id
-- or email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_80(fixture uuid)
returns table (check_name text, pass boolean, detail text)
language plpgsql
as $$
declare
  v_names text[] := array[]::text[];
  v_pass boolean[] := array[]::boolean[];
  v_detail text[] := array[]::text[];
  v_count int;
  v_err text;
  v_state text;
  v_result jsonb;
  v_second jsonb;
  v_loss jsonb;
  v_third jsonb;
  v_fourth jsonb;
  v_progress jsonb;
  v_tokens int;
  v_best int;
  v_available boolean;
  v_all boolean;
  v_total int;
  i int;
  v_none constant jsonb := '[]';
  v_won constant jsonb :=
    '{"won":1,"roundsWon":2,"roundsLost":1,"strikes":7,"perfectLaunches":2,"bey":0}';
  v_lost constant jsonb :=
    '{"won":0,"roundsWon":1,"roundsLost":2,"strikes":3,"perfectLaunches":0,"bey":2}';
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: the fixture has 1000 Tokens and no
    -- Beystadium rounds, best or Let It Rip Badge, so every run starts
    -- from the same place.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.minigame_rounds where player_id = fixture and minigame_id = 'beystadium';
    delete from public.minigame_bests where player_id = fixture and minigame_id = 'beystadium';
    delete from public.player_badges where player_id = fixture and badge_id = 'let-it-rip';
    update public.players set tokens = 1000 where id = fixture;

    -- B2: this migration turned Let It Rip on in #138's catalog.
    select b.available into v_available from public.badges b where b.id = 'let-it-rip';
    v_names := array_append(v_names, 'let_it_rip_available_in_catalog');
    v_pass := array_append(v_pass, v_available is true);
    v_detail := array_append(v_detail, format('available=%s (expected true)', v_available));

    -- B1: no Badge check constraint is re-added; #138's foreign key stays.
    v_names := array_append(v_names, 'badge_fk_kept_no_check_constraint');
    v_pass := array_append(
      v_pass,
      not exists (
        select 1 from pg_constraint
        where conname = 'player_badges_badge_id_check'
          and conrelid = 'public.player_badges'::regclass
      )
      and exists (
        select 1 from pg_constraint
        where conname = 'player_badges_badge_id_fkey'
          and conrelid = 'public.player_badges'::regclass
          and contype = 'f'
      )
    );
    v_detail := array_append(v_detail, 'pg_constraint checked on public.player_badges');

    -----------------------------------------------------------------------
    -- As the fixture (signed in).
    -----------------------------------------------------------------------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );

    -- B5: impossible match results pay nothing and write nothing.
    v_count := 0;
    foreach v_result in array array[
      v_won || '{"won":2}',
      v_won || '{"roundsWon":1}',
      v_lost || '{"roundsWon":2,"roundsLost":1}',
      v_won || '{"roundsWon":3}',
      v_lost || '{"roundsLost":3}',
      v_won || '{"roundsLost":2}',
      v_won || '{"bey":3}'
    ]::jsonb[] loop
      v_err := null;
      begin
        perform public.record_round('beystadium', 0, v_result);
      exception when others then
        v_err := sqlerrm;
      end;
      if v_err is not distinct from 'invalid_stats' then
        v_count := v_count + 1;
      end if;
    end loop;
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'invalid_match_results_rejected');
    v_pass := array_append(v_pass, v_count = 7 and v_tokens = 1000);
    v_detail := array_append(
      v_detail, format('invalid_stats=%s of 7, tokens=%s (expected 1000)', v_count, v_tokens)
    );

    -- B3/B6: a won match pays 60; the best is strikes landed; no Badge yet.
    v_result := public.record_round('beystadium', 7, v_won);
    select b.best_score into v_best
    from public.minigame_bests b where b.player_id = fixture and b.minigame_id = 'beystadium';
    v_names := array_append(v_names, 'won_match_pays_60_best_is_strikes');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 60, 'balance', 1060, 'newBest', true, 'badgeEarned', false,
        'badgesEarned', v_none
      ) and v_best = 7
    );
    v_detail := array_append(v_detail, format('result=%s best=%s', v_result, v_best));

    -- B4: the 10 s rule.
    v_err := null;
    begin
      perform public.record_round('beystadium', 3, v_lost);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'second_round_inside_10s_too_soon');
    v_pass := array_append(v_pass, v_err is not distinct from 'round_too_soon');
    v_detail := array_append(v_detail, format('error=%s (expected round_too_soon)', v_err));

    -- B4: half the 45 s window after the previous round, a win pays 30.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = now() - make_interval(secs => 22.5)
    where player_id = fixture and minigame_id = 'beystadium';
    perform set_config('role', 'authenticated', true);
    v_second := public.record_round('beystadium', 7, v_won);
    v_names := array_append(v_names, 'half_window_clamps_win_to_30');
    v_pass := array_append(
      v_pass,
      (v_second ->> 'tokensAwarded')::int = 30 and v_second -> 'badgesEarned' = v_none
    );
    v_detail := array_append(v_detail, format('result=%s (2 wins so far)', v_second));

    -- B3/B7: a loss pays 15 and never counts toward Let It Rip.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '1 hour'
    where player_id = fixture and minigame_id = 'beystadium';
    perform set_config('role', 'authenticated', true);
    v_loss := public.record_round('beystadium', 3, v_lost);
    v_names := array_append(v_names, 'lost_match_pays_15_no_badge');
    v_pass := array_append(
      v_pass,
      (v_loss ->> 'tokensAwarded')::int = 15
        and (v_loss ->> 'badgeEarned')::boolean = false
        and v_loss -> 'badgesEarned' = v_none
    );
    v_detail := array_append(v_detail, format('result=%s', v_loss));

    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '1 hour'
    where player_id = fixture and minigame_id = 'beystadium';

    -- B7: the award goes through public.award_badge. With the Badge switched
    -- off, the third win fails with award_badge's own badge_unavailable (no
    -- other code raises it) and writes nothing; the block's rollback undoes
    -- the switch too.
    v_err := null;
    begin
      update public.badges set available = false where id = 'let-it-rip';
      perform set_config('role', 'authenticated', true);
      perform public.record_round('beystadium', 7, v_won);
      raise exception 'proof_80_no_error';
    exception when others then
      v_err := sqlerrm;
    end;
    perform set_config('role', 'postgres', true);
    select count(*) into v_count
    from public.minigame_rounds r where r.player_id = fixture and r.minigame_id = 'beystadium';
    select b.available into v_available from public.badges b where b.id = 'let-it-rip';
    v_names := array_append(v_names, 'third_win_awards_through_award_badge');
    v_pass := array_append(
      v_pass, v_err is not distinct from 'badge_unavailable' and v_count = 3 and v_available
    );
    v_detail := array_append(
      v_detail,
      format('error=%s (expected badge_unavailable) rounds=%s available after=%s',
        v_err, v_count, v_available)
    );

    -- B7/B8: the third win earns Let It Rip (+50 once), reported in
    -- badgesEarned; the fourth earns nothing more.
    perform set_config('role', 'authenticated', true);
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_third := public.record_round('beystadium', 7, v_won);
    v_names := array_append(v_names, 'third_win_earns_let_it_rip_plus_50');
    v_pass := array_append(
      v_pass,
      (v_third ->> 'badgeEarned')::boolean = true
        and v_third -> 'badgesEarned' = '["let-it-rip"]'::jsonb
        and (v_third ->> 'tokensAwarded')::int = 60
        and (v_third ->> 'balance')::int = v_tokens + 60 + 50
    );
    v_detail := array_append(v_detail, format('before=%s result=%s', v_tokens, v_third));

    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '1 hour'
    where player_id = fixture and minigame_id = 'beystadium';
    perform set_config('role', 'authenticated', true);
    v_fourth := public.record_round('beystadium', 7, v_won);
    select count(*) into v_count
    from public.player_badges b where b.player_id = fixture and b.badge_id = 'let-it-rip';
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'fourth_win_no_second_badge_or_bonus');
    v_pass := array_append(
      v_pass,
      (v_fourth ->> 'badgeEarned')::boolean = false
        and v_fourth -> 'badgesEarned' = v_none
        and (v_fourth ->> 'balance')::int = (v_third ->> 'balance')::int + 60
        and v_count = 1
    );
    v_detail := array_append(v_detail, format('result=%s badge rows=%s', v_fourth, v_count));

    -- Over the whole run: 1000 + 60 + 30 + 15 + (60 + 50) + 60, i.e. the
    -- +50 was paid exactly once.
    v_names := array_append(v_names, 'bonus_paid_once_over_the_run');
    v_pass := array_append(v_pass, v_tokens = 1275);
    v_detail := array_append(v_detail, format('tokens=%s (expected 1275)', v_tokens));

    -- B9: quest_progress() counts the four wins, not the loss.
    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'quest_progress_reports_match_wins');
    v_pass := array_append(
      v_pass, v_progress -> 'matchWins' = jsonb_build_object('beystadium', 4)
    );
    v_detail := array_append(v_detail, format('matchWins=%s', v_progress -> 'matchWins'));

    -- B9: the leaderboard knows 'beystadium'.
    v_err := null;
    begin
      select count(*) into v_count from public.leaderboard('beystadium');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'leaderboard_accepts_beystadium');
    v_pass := array_append(v_pass, v_err is null);
    v_detail := array_append(v_detail, format('error=%s rows=%s', v_err, v_count));

    -- B10: the Player can't award a Badge directly.
    v_state := null;
    begin
      perform public.award_badge(fixture, 'let-it-rip');
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'authenticated_denied_award_badge');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    -----------------------------------------------------------------------
    -- As anon (no sub claim): every touched function is denied.
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_state := null;
    begin
      perform public.record_round('beystadium', 7, v_won);
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_record_round');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.quest_progress();
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_quest_progress');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform count(*) from public.leaderboard('beystadium');
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_leaderboard');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.award_badge(fixture, 'let-it-rip');
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_award_badge');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    -----------------------------------------------------------------------
    -- Function definitions and grants, as postgres.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    v_names := array_append(v_names, 'one_overload_each_security_definer_search_path_locked');
    v_pass := array_append(
      v_pass,
      (select count(*) = 3
         and bool_and(p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('record_round', 'leaderboard', 'quest_progress'))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for all three');

    v_names := array_append(v_names, 'execute_granted_to_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.record_round(text, int, jsonb)', 'execute')
        and has_function_privilege('authenticated', 'public.leaderboard(text, int)', 'execute')
        and has_function_privilege('authenticated', 'public.quest_progress()', 'execute')
        and not has_function_privilege('anon', 'public.record_round(text, int, jsonb)', 'execute')
        and not has_function_privilege('anon', 'public.leaderboard(text, int)', 'execute')
        and not has_function_privilege('anon', 'public.quest_progress()', 'execute')
        and not has_function_privilege('authenticated', 'public.award_badge(uuid, text)', 'execute')
        and not has_function_privilege('anon', 'public.award_badge(uuid, text)', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_80_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_80_rollback' then
        raise;
      end if;
  end;

  v_total := coalesce(array_length(v_names, 1), 0);
  v_all := v_total > 0;
  for i in 1..v_total loop
    if not coalesce(v_pass[i], false) then
      v_all := false;
    end if;
  end loop;

  v_names := array_append(v_names, 'ALL');
  v_pass := array_append(v_pass, v_all);
  v_detail := array_append(v_detail, format('%s checks, all pass = %s', v_total, v_all));

  for i in 1..array_length(v_names, 1) loop
    check_name := v_names[i];
    pass := v_pass[i];
    detail := v_detail[i];
    return next;
  end loop;
  return;
end;
$$;

select * from pg_temp.proof_80('00000000-0000-0000-0000-00000000f1f0'::uuid);
