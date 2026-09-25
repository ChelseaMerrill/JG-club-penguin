-- Beystadium proof, against the #9 H1 fixture Player, in #46's
-- 46_quests_proof.sql style. Covers 20260925010000_beystadium.sql's
-- decisions B2-B9.
--
-- What this proves, as the fixture signed in (role authenticated):
-- record_round('beystadium', ...) pays 60 for a won match and 15 for a lost
-- one (B2), with the best set to strikes landed (B5); a second round inside
-- 10 s is round_too_soon and a round half the 45 s window after the
-- previous one is clamped to 30 (B3); an impossible match result is
-- invalid_stats and pays nothing (B4); Let It Rip is earned on exactly the
-- third match win, a loss in between never counts, the +50 bonus is paid
-- once, and a fourth win earns nothing more (B6); quest_progress() reports
-- matchWins (B7); leaderboard('beystadium') is accepted (B8); as anon every
-- touched function is denied (42501). Also: each of the three functions is
-- security definer with search_path = '' and exactly one overload, with
-- EXECUTE granted to authenticated only (B9).
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
  v_loss jsonb;
  v_third jsonb;
  v_fourth jsonb;
  v_progress jsonb;
  v_tokens int;
  v_best int;
  v_all boolean;
  v_total int;
  i int;
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

    -- B4: impossible match results pay nothing and write nothing.
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

    -- B2/B5: a won match pays 60; the best is strikes landed.
    v_result := public.record_round('beystadium', 7, v_won);
    select b.best_score into v_best
    from public.minigame_bests b where b.player_id = fixture and b.minigame_id = 'beystadium';
    v_names := array_append(v_names, 'won_match_pays_60_best_is_strikes');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 60, 'balance', 1060, 'newBest', true, 'badgeEarned', false
      ) and v_best = 7
    );
    v_detail := array_append(v_detail, format('result=%s best=%s', v_result, v_best));

    -- B3: the 10 s rule.
    v_err := null;
    begin
      perform public.record_round('beystadium', 3, v_lost);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'second_round_inside_10s_too_soon');
    v_pass := array_append(v_pass, v_err is not distinct from 'round_too_soon');
    v_detail := array_append(v_detail, format('error=%s (expected round_too_soon)', v_err));

    -- B3: half the 45 s window after the previous round, a win pays 30.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = now() - make_interval(secs => 22.5)
    where player_id = fixture and minigame_id = 'beystadium';
    perform set_config('role', 'authenticated', true);
    v_result := public.record_round('beystadium', 7, v_won);
    v_names := array_append(v_names, 'half_window_clamps_win_to_30');
    v_pass := array_append(v_pass, (v_result ->> 'tokensAwarded')::int = 30);
    v_detail := array_append(v_detail, format('result=%s (2 wins so far)', v_result));

    -- B2/B6: a loss pays 15 and never counts toward Let It Rip.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '1 hour'
    where player_id = fixture and minigame_id = 'beystadium';
    perform set_config('role', 'authenticated', true);
    v_loss := public.record_round('beystadium', 3, v_lost);
    v_names := array_append(v_names, 'lost_match_pays_15_no_badge');
    v_pass := array_append(
      v_pass,
      (v_loss ->> 'tokensAwarded')::int = 15 and (v_loss ->> 'badgeEarned')::boolean = false
    );
    v_detail := array_append(v_detail, format('result=%s', v_loss));

    -- B6: the third win earns Let It Rip (+50 once); the fourth earns nothing more.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '1 hour'
    where player_id = fixture and minigame_id = 'beystadium';
    perform set_config('role', 'authenticated', true);
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_third := public.record_round('beystadium', 7, v_won);
    v_names := array_append(v_names, 'third_win_earns_let_it_rip_plus_50');
    v_pass := array_append(
      v_pass,
      (v_third ->> 'badgeEarned')::boolean = true
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
    v_names := array_append(v_names, 'fourth_win_no_second_badge_or_bonus');
    v_pass := array_append(
      v_pass,
      (v_fourth ->> 'badgeEarned')::boolean = false
        and (v_fourth ->> 'balance')::int = (v_third ->> 'balance')::int + 60
        and v_count = 1
    );
    v_detail := array_append(v_detail, format('result=%s badge rows=%s', v_fourth, v_count));

    -- B7: quest_progress() counts the four wins, not the loss.
    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'quest_progress_reports_match_wins');
    v_pass := array_append(
      v_pass, v_progress -> 'matchWins' = jsonb_build_object('beystadium', 4)
    );
    v_detail := array_append(v_detail, format('matchWins=%s', v_progress -> 'matchWins'));

    -- B8: the leaderboard knows 'beystadium'.
    v_err := null;
    begin
      select count(*) into v_count from public.leaderboard('beystadium');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'leaderboard_accepts_beystadium');
    v_pass := array_append(v_pass, v_err is null);
    v_detail := array_append(v_detail, format('error=%s rows=%s', v_err, v_count));

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
