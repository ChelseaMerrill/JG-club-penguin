-- Pão de Queijo Memory proof, against the #9 H1 fixture Player, in #46's
-- 46_quests_proof.sql style. Covers 20261012030000_pao_de_queijo.sql's
-- decisions D1-D9.
--
-- What this proves, as the fixture signed in (role authenticated): an
-- impossible stats/score combo (roundsCleared over 3, matches over 24, a
-- streak over matches, or a score over the D6 bound) is invalid_stats and
-- pays nothing; with the Badge switched off, a full-clear round fails
-- outright with award_badge's own badge_unavailable and writes nothing
-- (D5); an honest full-clear round pays floor(score/10) with the best set
-- to that same score (not roundsCleared, D4) and earns Mestre do Pão de
-- Queijo (+50) through public.award_badge, reported in badgesEarned (D5); a
-- second round inside 10 s is round_too_soon and a round half the 165 s
-- window after the previous one is clamped to half the cap (D7); a later
-- over-cap round pays exactly the 300 cap (D3), and neither later round
-- earns the Badge again (D5, a one-time thing); a partial clear (fewer than
-- 3 rounds) never earns the Badge even at a high score, however it scores
-- (D5); the +50 is paid exactly once over the whole run; public.badges has
-- Mestre do Pão de Queijo available (D2); leaderboard('pao-de-queijo') is
-- accepted (D8); as anon every touched function is denied (42501). Also:
-- both functions are security definer with search_path = '' and exactly one
-- overload, with EXECUTE granted to authenticated only (D9).
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside pg_temp.proof_218(), which
-- ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the fixture's rounds, best, Badge and Tokens). It
-- prints only booleans, counts and Token amounts -- no Player's name, id or
-- email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_218(fixture uuid)
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
  v_too_soon_err text;
  v_half jsonb;
  v_over_cap jsonb;
  v_partial jsonb;
  v_tokens int;
  v_best int;
  v_available boolean;
  v_all boolean;
  v_total int;
  i int;
  v_none constant jsonb := '[]';
  -- bound = 24 * 300 + 3 * 180 = 7740.
  v_full_clear constant jsonb := '{"roundsCleared":3,"matches":24,"bestStreak":24}';
  -- bound = 1 * 300 + 1 * 180 = 480, a partial clear that can never earn the Badge.
  v_partial_clear constant jsonb := '{"roundsCleared":1,"matches":6,"bestStreak":6}';
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: the fixture has 1000 Tokens and no
    -- Pão de Queijo Memory rounds, best or Badge, so every run starts from
    -- the same place.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.minigame_rounds where player_id = fixture and minigame_id = 'pao-de-queijo';
    delete from public.minigame_bests where player_id = fixture and minigame_id = 'pao-de-queijo';
    delete from public.player_badges where player_id = fixture and badge_id = 'mestre-do-pao-de-queijo';
    update public.players set tokens = 1000 where id = fixture;

    -- D2: this migration seeded Mestre do Pão de Queijo fresh, already available.
    select b.available into v_available from public.badges b where b.id = 'mestre-do-pao-de-queijo';
    v_names := array_append(v_names, 'mestre_do_pao_de_queijo_available_in_catalog');
    v_pass := array_append(v_pass, v_available is true);
    v_detail := array_append(v_detail, format('available=%s (expected true)', v_available));

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

    -- D6: an impossible stats/score combo is rejected and writes nothing.
    v_count := 0;
    foreach v_result in array array[
      -- roundsCleared over 3.
      jsonb_build_object('score', 0, 'stats', '{"roundsCleared":4,"matches":24,"bestStreak":24}'::jsonb),
      -- matches over 24.
      jsonb_build_object('score', 0, 'stats', '{"roundsCleared":0,"matches":25,"bestStreak":0}'::jsonb),
      -- bestStreak over matches.
      jsonb_build_object('score', 0, 'stats', '{"roundsCleared":0,"matches":2,"bestStreak":3}'::jsonb),
      -- score over the bound (1 match, 0 rounds cleared: bound = 300).
      jsonb_build_object('score', 301, 'stats', '{"roundsCleared":0,"matches":1,"bestStreak":1}'::jsonb)
    ]::jsonb[] loop
      v_err := null;
      begin
        perform public.record_round(
          'pao-de-queijo', (v_result ->> 'score')::int, v_result -> 'stats'
        );
      exception when others then
        v_err := sqlerrm;
      end;
      if v_err is not distinct from 'invalid_stats' then
        v_count := v_count + 1;
      end if;
    end loop;
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'invalid_stats_rejected');
    v_pass := array_append(v_pass, v_count = 4 and v_tokens = 1000);
    v_detail := array_append(
      v_detail, format('invalid_stats=%s of 4, tokens=%s (expected 1000)', v_count, v_tokens)
    );

    -- D5: the award goes through public.award_badge. Run before any round has
    -- ever cleared all 3 (and before any round exists at all), so there's no
    -- earlier round for round_too_soon to trip over. With the Badge switched
    -- off (as postgres: writing public.badges needs that role, and catching
    -- the exception below rolls that update back too, along with everything
    -- else this block did), a full-clear round fails with award_badge's own
    -- badge_unavailable (no other code raises it) and writes nothing.
    v_err := null;
    begin
      perform set_config('role', 'postgres', true);
      update public.badges set available = false where id = 'mestre-do-pao-de-queijo';
      perform set_config('role', 'authenticated', true);
      perform public.record_round('pao-de-queijo', 1000, v_full_clear);
      raise exception 'proof_218_no_error';
    exception when others then
      v_err := sqlerrm;
    end;
    perform set_config('role', 'postgres', true);
    select count(*) into v_count
    from public.minigame_rounds r
    where r.player_id = fixture and r.minigame_id = 'pao-de-queijo';
    select b.available into v_available
    from public.badges b where b.id = 'mestre-do-pao-de-queijo';
    v_names := array_append(v_names, 'badge_switched_off_fails_badge_unavailable');
    v_pass := array_append(
      v_pass, v_err is not distinct from 'badge_unavailable' and v_count = 0 and v_available
    );
    v_detail := array_append(
      v_detail,
      format('error=%s (expected badge_unavailable) rounds=%s available after=%s',
        v_err, v_count, v_available)
    );

    -- D3/D4/D5: an honest full-clear round pays floor(1000/10) = 100; the
    -- best is the score itself (1000), not roundsCleared (3); the Badge is
    -- earned on this, its first qualifying round, with the +50 bonus.
    perform set_config('role', 'authenticated', true);
    v_result := public.record_round('pao-de-queijo', 1000, v_full_clear);
    select b.best_score into v_best
    from public.minigame_bests b where b.player_id = fixture and b.minigame_id = 'pao-de-queijo';
    v_names := array_append(
      v_names, 'full_clear_pays_floor_score_div_10_best_is_score_and_earns_badge_plus_50'
    );
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 100, 'balance', 1150, 'newBest', true, 'badgeEarned', true,
        'badgesEarned', '["mestre-do-pao-de-queijo"]'::jsonb
      ) and v_best = 1000
    );
    v_detail := array_append(v_detail, format('result=%s best=%s', v_result, v_best));

    -- D7: the 10 s rule.
    v_too_soon_err := null;
    begin
      perform public.record_round('pao-de-queijo', 500, v_full_clear);
    exception when others then
      v_too_soon_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'second_round_inside_10s_too_soon');
    v_pass := array_append(v_pass, v_too_soon_err is not distinct from 'round_too_soon');
    v_detail := array_append(v_detail, format('error=%s (expected round_too_soon)', v_too_soon_err));

    -- D5/D7: half the 165 s window after the round above, another full-clear
    -- round (score 2000, raw 200, under the 300 cap on its own) is clamped
    -- to half the cap (150, not 200) and earns nothing more -- the Badge is
    -- already held.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = now() - make_interval(secs => 82.5)
    where player_id = fixture and minigame_id = 'pao-de-queijo';
    perform set_config('role', 'authenticated', true);
    v_half := public.record_round('pao-de-queijo', 2000, v_full_clear);
    v_names := array_append(v_names, 'half_window_clamps_payout_no_second_badge');
    v_pass := array_append(
      v_pass,
      (v_half ->> 'tokensAwarded')::int = 150
        and (v_half ->> 'badgeEarned')::boolean = false
        and v_half -> 'badgesEarned' = v_none
    );
    v_detail := array_append(v_detail, format('result=%s', v_half));

    -- D3: a full window later, a 5000-point full-clear round pays exactly
    -- the 300 cap, not floor(5000/10) = 500; still no second Badge/bonus.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '1 hour'
    where player_id = fixture and minigame_id = 'pao-de-queijo';
    perform set_config('role', 'authenticated', true);
    v_over_cap := public.record_round('pao-de-queijo', 5000, v_full_clear);
    v_names := array_append(v_names, 'over_cap_round_pays_exactly_300_no_second_badge');
    v_pass := array_append(
      v_pass,
      (v_over_cap ->> 'tokensAwarded')::int = 300
        and (v_over_cap ->> 'badgeEarned')::boolean = false
        and v_over_cap -> 'badgesEarned' = v_none
    );
    v_detail := array_append(v_detail, format('result=%s', v_over_cap));

    -- D5: a partial clear (1 of 3 rounds) never earns the Badge, however
    -- high it scores (1980, right at its own 480-point bound's... no, this
    -- stats bound is 480; 1980 would be rejected -- use a score at its own
    -- bound instead, still comfortably "high" for one round).
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '1 hour'
    where player_id = fixture and minigame_id = 'pao-de-queijo';
    perform set_config('role', 'authenticated', true);
    v_partial := public.record_round('pao-de-queijo', 480, v_partial_clear);
    select count(*) into v_count
    from public.player_badges b
    where b.player_id = fixture and b.badge_id = 'mestre-do-pao-de-queijo';
    v_names := array_append(v_names, 'partial_clear_never_earns_badge_even_at_high_score');
    v_pass := array_append(
      v_pass,
      (v_partial ->> 'badgeEarned')::boolean = false
        and v_partial -> 'badgesEarned' = v_none
        and (v_partial ->> 'tokensAwarded')::int = 48
        and v_count = 1
    );
    v_detail := array_append(v_detail, format('result=%s badge rows=%s', v_partial, v_count));

    -- Over the whole run: 1000 + (100 + 50) (full clear, Badge) + 150
    -- (half window) + 300 (full window, cap) + 48 (partial clear) = 1648,
    -- i.e. the +50 was paid exactly once.
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'bonus_paid_once_over_the_run');
    v_pass := array_append(v_pass, v_tokens = 1648);
    v_detail := array_append(v_detail, format('tokens=%s (expected 1648)', v_tokens));

    -- D8: the leaderboard knows 'pao-de-queijo'.
    v_err := null;
    begin
      select count(*) into v_count from public.leaderboard('pao-de-queijo');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'leaderboard_accepts_pao_de_queijo');
    v_pass := array_append(v_pass, v_err is null);
    v_detail := array_append(v_detail, format('error=%s rows=%s', v_err, v_count));

    -----------------------------------------------------------------------
    -- As anon (no sub claim): every touched function is denied.
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_state := null;
    begin
      perform public.record_round('pao-de-queijo', 1000, v_full_clear);
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_record_round');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform count(*) from public.leaderboard('pao-de-queijo');
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
      (select count(*) = 2
         and bool_and(p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('record_round', 'leaderboard'))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for both');

    v_names := array_append(v_names, 'execute_granted_to_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.record_round(text, int, jsonb)', 'execute')
        and has_function_privilege('authenticated', 'public.leaderboard(text, int)', 'execute')
        and not has_function_privilege('anon', 'public.record_round(text, int, jsonb)', 'execute')
        and not has_function_privilege('anon', 'public.leaderboard(text, int)', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_218_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_218_rollback' then
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

select * from pg_temp.proof_218('00000000-0000-0000-0000-00000000f1f0'::uuid);
