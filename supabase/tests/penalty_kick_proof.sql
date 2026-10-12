-- Penalty Kick proof (#220), against the #9 H1 fixture Player, in
-- 80_beystadium_proof.sql's style. Covers 20261012010000_penalty_kick.sql's
-- decisions P1-P8.
--
-- What this proves, as the fixture signed in (role authenticated):
-- record_round('penalty-kick', ...) rejects an impossible round
-- (goals + golazos > 5, P5) and writes nothing; a 3-goal round pays 90 and
-- sets the best to 3, with no Badge yet; a second round inside 10 s is
-- round_too_soon, and one half the 30 s window after the previous round is
-- clamped to half its raw payout (P4); a 4-goal round earns Goleador through
-- public.award_badge (with the Badge switched off, that same round fails
-- with award_badge's own badge_unavailable and writes nothing), paying
-- +50 once, reported in badgesEarned on that call only, and a later 5-golazo
-- round earns no second Badge or bonus but still pays its own 250 (P3, P6);
-- public.badges has Goleador available, already seeded by this migration
-- (P2); leaderboard('penalty-kick') is NOT yet a known id -- this migration
-- deliberately leaves leaderboard() untouched (P1) -- so it still raises
-- unknown_minigame, proving that documented gap rather than hiding it; as
-- anon, record_round is denied (42501). Also: record_round is security
-- definer with search_path = '' and exactly one overload, with EXECUTE
-- granted to authenticated only, and award_badge stays internal (P7).
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside
-- pg_temp.proof_penalty_kick(), which ends by raising and catching a
-- sentinel exception, rolling back every write the function made (the
-- fixture's rounds, best, Badge and Tokens). It prints only booleans, counts
-- and Token amounts -- no Player's name, id or email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_penalty_kick(fixture uuid)
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
  v_third jsonb;
  v_fourth jsonb;
  v_tokens int;
  v_best int;
  v_available boolean;
  v_all boolean;
  v_total int;
  i int;
  v_none constant jsonb := '[]';
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: the fixture has 1000 Tokens and no
    -- Penalty Kick rounds, best or Goleador Badge, so every run starts from
    -- the same place.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.minigame_rounds where player_id = fixture and minigame_id = 'penalty-kick';
    delete from public.minigame_bests where player_id = fixture and minigame_id = 'penalty-kick';
    delete from public.player_badges where player_id = fixture and badge_id = 'goleador';
    update public.players set tokens = 1000 where id = fixture;

    -- P2: this migration seeds Goleador fresh, already available.
    select b.available into v_available from public.badges b where b.id = 'goleador';
    v_names := array_append(v_names, 'goleador_available_in_catalog');
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

    -- P5: an impossible round (more scores than shots) is rejected outright.
    v_count := 0;
    foreach v_result in array array[
      '{"goals":4,"golazos":2,"saved":0,"wide":0,"over":0}',
      '{"goals":3,"golazos":3,"saved":0,"wide":0,"over":0}',
      '{"goals":6,"golazos":0,"saved":0,"wide":0,"over":0}'
    ]::jsonb[] loop
      v_err := null;
      begin
        perform public.record_round('penalty-kick', 0, v_result);
      exception when others then
        v_err := sqlerrm;
      end;
      if v_err is not distinct from 'invalid_stats' then
        v_count := v_count + 1;
      end if;
    end loop;
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'impossible_stats_rejected');
    v_pass := array_append(v_pass, v_count = 3 and v_tokens = 1000);
    v_detail := array_append(
      v_detail, format('invalid_stats=%s of 3, tokens=%s (expected 1000)', v_count, v_tokens)
    );

    -- P3/P6: a 3-goal round pays 90 (30 * 3); the best is goals + golazos; no Badge yet.
    v_result := public.record_round(
      'penalty-kick', 3, '{"goals":3,"golazos":0,"saved":1,"wide":1,"over":0}'
    );
    select b.best_score into v_best
    from public.minigame_bests b where b.player_id = fixture and b.minigame_id = 'penalty-kick';
    v_names := array_append(v_names, 'three_goals_pays_90_best_is_3');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 90, 'balance', 1090, 'newBest', true, 'badgeEarned', false,
        'badgesEarned', v_none
      ) and v_best = 3
    );
    v_detail := array_append(v_detail, format('result=%s best=%s', v_result, v_best));

    -- P4: the 10 s rule.
    v_err := null;
    begin
      perform public.record_round(
        'penalty-kick', 1, '{"goals":1,"golazos":0,"saved":4,"wide":0,"over":0}'
      );
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'second_round_inside_10s_too_soon');
    v_pass := array_append(v_pass, v_err is not distinct from 'round_too_soon');
    v_detail := array_append(v_detail, format('error=%s (expected round_too_soon)', v_err));

    -- P4: half the 30 s window after the previous round, a 3-golazo round
    -- (raw 150, still under the 4-scored Badge threshold) is clamped to
    -- floor(250 * 0.5) = 125.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = now() - make_interval(secs => 15)
    where player_id = fixture and minigame_id = 'penalty-kick';
    perform set_config('role', 'authenticated', true);
    v_second := public.record_round(
      'penalty-kick', 3, '{"goals":0,"golazos":3,"saved":2,"wide":0,"over":0}'
    );
    v_names := array_append(v_names, 'half_window_clamps_150_to_125');
    v_pass := array_append(
      v_pass,
      (v_second ->> 'tokensAwarded')::int = 125 and v_second -> 'badgesEarned' = v_none
    );
    v_detail := array_append(v_detail, format('result=%s', v_second));

    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '1 hour'
    where player_id = fixture and minigame_id = 'penalty-kick';

    -- P6: the award goes through public.award_badge. With the Badge
    -- switched off, a 4+-scored round fails with award_badge's own
    -- badge_unavailable (no other code raises it) and writes nothing; the
    -- block's rollback undoes the switch too.
    v_err := null;
    begin
      update public.badges set available = false where id = 'goleador';
      perform set_config('role', 'authenticated', true);
      perform public.record_round(
        'penalty-kick', 4, '{"goals":4,"golazos":0,"saved":1,"wide":0,"over":0}'
      );
      raise exception 'proof_penalty_kick_no_error';
    exception when others then
      v_err := sqlerrm;
    end;
    perform set_config('role', 'postgres', true);
    select count(*) into v_count
    from public.minigame_rounds r where r.player_id = fixture and r.minigame_id = 'penalty-kick';
    select b.available into v_available from public.badges b where b.id = 'goleador';
    v_names := array_append(v_names, 'badge_round_awards_through_award_badge');
    v_pass := array_append(
      v_pass, v_err is not distinct from 'badge_unavailable' and v_count = 2 and v_available
    );
    v_detail := array_append(
      v_detail,
      format('error=%s (expected badge_unavailable) rounds=%s available after=%s',
        v_err, v_count, v_available)
    );

    -- P6: a 4-goal round earns Goleador (+50 once), reported in
    -- badgesEarned.
    perform set_config('role', 'authenticated', true);
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_third := public.record_round(
      'penalty-kick', 4, '{"goals":4,"golazos":0,"saved":1,"wide":0,"over":0}'
    );
    v_names := array_append(v_names, 'four_goals_earns_goleador_plus_50');
    v_pass := array_append(
      v_pass,
      (v_third ->> 'badgeEarned')::boolean = true
        and v_third -> 'badgesEarned' = '["goleador"]'::jsonb
        and (v_third ->> 'tokensAwarded')::int = 120
        and (v_third ->> 'balance')::int = v_tokens + 120 + 50
    );
    v_detail := array_append(v_detail, format('before=%s result=%s', v_tokens, v_third));

    -- P6: a later 5-golazo round (full-marks, cap 250) earns no second
    -- Badge or bonus, but still pays its own 250.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '1 hour'
    where player_id = fixture and minigame_id = 'penalty-kick';
    perform set_config('role', 'authenticated', true);
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_fourth := public.record_round(
      'penalty-kick', 5, '{"goals":0,"golazos":5,"saved":0,"wide":0,"over":0}'
    );
    select count(*) into v_count
    from public.player_badges b where b.player_id = fixture and b.badge_id = 'goleador';
    select b.best_score into v_best
    from public.minigame_bests b where b.player_id = fixture and b.minigame_id = 'penalty-kick';
    v_names := array_append(v_names, 'full_marks_no_second_badge_still_pays_250');
    v_pass := array_append(
      v_pass,
      (v_fourth ->> 'badgeEarned')::boolean = false
        and v_fourth -> 'badgesEarned' = v_none
        and (v_fourth ->> 'tokensAwarded')::int = 250
        and v_count = 1
        and v_best = 5
    );
    v_detail := array_append(v_detail, format('result=%s badge rows=%s best=%s', v_fourth, v_count, v_best));

    -- Over the whole run: 1000 + 90 + 125 + (120 + 50) + 250, i.e. the +50
    -- was paid exactly once.
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'bonus_paid_once_over_the_run');
    v_pass := array_append(v_pass, v_tokens = 1635);
    v_detail := array_append(v_detail, format('tokens=%s (expected 1635)', v_tokens));

    -- P1: leaderboard() is deliberately NOT extended by this migration, so
    -- 'penalty-kick' stays an unknown id there -- proving the documented gap
    -- rather than silently assuming it works.
    v_err := null;
    begin
      perform count(*) from public.leaderboard('penalty-kick');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'leaderboard_does_not_yet_know_penalty_kick');
    v_pass := array_append(v_pass, v_err is not distinct from 'unknown_minigame');
    v_detail := array_append(v_detail, format('error=%s (expected unknown_minigame)', v_err));

    -- P7: the Player can't award a Badge directly.
    v_state := null;
    begin
      perform public.award_badge(fixture, 'goleador');
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'authenticated_denied_award_badge');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    -----------------------------------------------------------------------
    -- As anon (no sub claim): record_round is denied.
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_state := null;
    begin
      perform public.record_round(
        'penalty-kick', 4, '{"goals":4,"golazos":0,"saved":1,"wide":0,"over":0}'
      );
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_record_round');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.award_badge(fixture, 'goleador');
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_award_badge');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    -----------------------------------------------------------------------
    -- Function definition and grants, as postgres.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    v_names := array_append(v_names, 'record_round_security_definer_search_path_locked');
    v_pass := array_append(
      v_pass,
      (select count(*) = 1
         and bool_and(p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'record_round')
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked');

    v_names := array_append(v_names, 'execute_granted_to_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.record_round(text, int, jsonb)', 'execute')
        and not has_function_privilege('anon', 'public.record_round(text, int, jsonb)', 'execute')
        and not has_function_privilege('authenticated', 'public.award_badge(uuid, text)', 'execute')
        and not has_function_privilege('anon', 'public.award_badge(uuid, text)', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_penalty_kick_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_penalty_kick_rollback' then
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

select * from pg_temp.proof_penalty_kick('00000000-0000-0000-0000-00000000f1f0'::uuid);
