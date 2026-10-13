-- Carnaval Parade proof, against the #9 H1 fixture Player, in #46's
-- 46_quests_proof.sql style. Covers 20261012020000_carnaval_parade.sql's
-- decisions C1-C8.
--
-- What this proves, as the fixture signed in (role authenticated): an
-- impossible stats/score combo (barriersHit over 3, or a score over what
-- feathers/stars could score at the max x4 multiplier) is invalid_stats and
-- pays nothing (C3/C6); with the Badge switched off, a 400+ round fails
-- outright with award_badge's own badge_unavailable and writes nothing
-- (C4); an honest round pays floor(score/10) with the best set to that same
-- score (C3/C4); a second round inside 10 s is round_too_soon and a round
-- half the 45 s window after the previous one is clamped to half the cap
-- (C5) -- and, since the 120 cap and the 400-point Badge threshold overlap
-- (any round that busts the cap necessarily also clears 400), that same
-- clamped round earns Passista (+50) through public.award_badge in the same
-- call, reported in badgesEarned; a later over-cap round pays exactly 120
-- and a later ordinary 400+ round earns nothing more (the Badge and its
-- bonus are a one-time thing, not tied to score size), and the +50 is paid
-- exactly once over the whole run (C4); public.badges has Passista
-- available (C2); leaderboard('carnaval-parade') is accepted (C7); as anon
-- every touched function is denied (42501). Also: both functions are
-- security definer with search_path = '' and exactly one overload, with
-- EXECUTE granted to authenticated only (C8).
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside pg_temp.proof_219(), which
-- ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the fixture's rounds, best, Badge and Tokens). It
-- prints only booleans, counts and Token amounts -- no Player's name, id or
-- email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_219(fixture uuid)
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
  -- bound = (10 * 40 + 25 * 0) * 4 = 1600.
  v_stats_40f constant jsonb := '{"feathers":40,"stars":0,"barriersHit":0,"bestStreak":8}';
  -- bound = (10 * 200 + 25 * 0) * 4 = 8000, far above the 2000 scored below.
  v_stats_200f constant jsonb := '{"feathers":200,"stars":0,"barriersHit":1,"bestStreak":20}';
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: the fixture has 1000 Tokens and no
    -- Carnaval Parade rounds, best or Passista Badge, so every run starts
    -- from the same place.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.minigame_rounds where player_id = fixture and minigame_id = 'carnaval-parade';
    delete from public.minigame_bests where player_id = fixture and minigame_id = 'carnaval-parade';
    delete from public.player_badges where player_id = fixture and badge_id = 'passista';
    update public.players set tokens = 1000 where id = fixture;

    -- C2: this migration seeded Passista fresh, already available.
    select b.available into v_available from public.badges b where b.id = 'passista';
    v_names := array_append(v_names, 'passista_available_in_catalog');
    v_pass := array_append(v_pass, v_available is true);
    v_detail := array_append(v_detail, format('available=%s (expected true)', v_available));

    -- C1: no Badge check constraint is re-added; #138's foreign key stays.
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

    -- C3/C6: a score over the stats bound, or more than 3 barriers hit, is
    -- rejected and writes nothing.
    v_count := 0;
    foreach v_result in array array[
      jsonb_build_object('score', 1601, 'stats', v_stats_40f),
      jsonb_build_object('score', 0, 'stats', '{"feathers":0,"stars":0,"barriersHit":4,"bestStreak":0}'::jsonb)
    ]::jsonb[] loop
      v_err := null;
      begin
        perform public.record_round(
          'carnaval-parade',
          (v_result ->> 'score')::int,
          v_result -> 'stats'
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
    v_pass := array_append(v_pass, v_count = 2 and v_tokens = 1000);
    v_detail := array_append(
      v_detail, format('invalid_stats=%s of 2, tokens=%s (expected 1000)', v_count, v_tokens)
    );

    -- C4: the award goes through public.award_badge. Run before any round has
    -- ever scored 400+ (and before any round exists at all), so there's no
    -- earlier round for round_too_soon to trip over. With the Badge switched
    -- off (as postgres: writing public.badges needs that role), a 400+ round
    -- fails with award_badge's own badge_unavailable (no other code raises
    -- it) and writes nothing; the block's rollback undoes the switch too.
    v_err := null;
    begin
      perform set_config('role', 'postgres', true);
      update public.badges set available = false where id = 'passista';
      perform set_config('role', 'authenticated', true);
      perform public.record_round(
        'carnaval-parade', 400, '{"feathers":40,"stars":0,"barriersHit":0,"bestStreak":15}'::jsonb
      );
      raise exception 'proof_219_no_error';
    exception when others then
      v_err := sqlerrm;
    end;
    perform set_config('role', 'postgres', true);
    select count(*) into v_count
    from public.minigame_rounds r
    where r.player_id = fixture and r.minigame_id = 'carnaval-parade';
    select b.available into v_available from public.badges b where b.id = 'passista';
    v_names := array_append(v_names, 'threshold_award_goes_through_award_badge');
    v_pass := array_append(
      v_pass, v_err is not distinct from 'badge_unavailable' and v_count = 0 and v_available
    );
    v_detail := array_append(
      v_detail,
      format('error=%s (expected badge_unavailable) rounds=%s available after=%s',
        v_err, v_count, v_available)
    );

    -- C3/C4: an honest 100-point round pays 10 (floor(100/10)); the best is
    -- the score itself.
    perform set_config('role', 'authenticated', true);
    v_result := public.record_round('carnaval-parade', 100, v_stats_40f);
    select b.best_score into v_best
    from public.minigame_bests b where b.player_id = fixture and b.minigame_id = 'carnaval-parade';
    v_names := array_append(v_names, 'honest_round_pays_floor_score_div_10_best_is_score');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 10, 'balance', 1010, 'newBest', true, 'badgeEarned', false,
        'badgesEarned', v_none
      ) and v_best = 100
    );
    v_detail := array_append(v_detail, format('result=%s best=%s', v_result, v_best));

    -- C5: the 10 s rule.
    v_err := null;
    begin
      perform public.record_round('carnaval-parade', 100, v_stats_40f);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'second_round_inside_10s_too_soon');
    v_pass := array_append(v_pass, v_err is not distinct from 'round_too_soon');
    v_detail := array_append(v_detail, format('error=%s (expected round_too_soon)', v_err));

    -- C3/C4: half the 45 s window after the honest round above, a 2000-point
    -- round (bound 8000, so valid; also >= 400) pays half the 120 cap (60,
    -- not floor(2000/10) = 200) *and* earns Passista (+50) in the same call,
    -- reported in badgesEarned -- a cap-busting score and a Badge-earning one
    -- are the same round here, since 1200 (floor(score/10) > 120) is already
    -- well past the 400 threshold.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = now() - make_interval(secs => 22.5)
    where player_id = fixture and minigame_id = 'carnaval-parade';
    perform set_config('role', 'authenticated', true);
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_second := public.record_round('carnaval-parade', 2000, v_stats_200f);
    v_names := array_append(v_names, 'half_window_clamps_payout_and_earns_passista_plus_50');
    v_pass := array_append(
      v_pass,
      (v_second ->> 'tokensAwarded')::int = 60
        and (v_second ->> 'badgeEarned')::boolean = true
        and v_second -> 'badgesEarned' = '["passista"]'::jsonb
        and (v_second ->> 'balance')::int = v_tokens + 60 + 50
    );
    v_detail := array_append(v_detail, format('before=%s result=%s', v_tokens, v_second));

    -- C3: a full 45 s later, the same 2000-point round pays exactly the
    -- 120 cap, not floor(2000/10) = 200; Passista is already owned, so this
    -- round earns nothing more.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '1 hour'
    where player_id = fixture and minigame_id = 'carnaval-parade';
    perform set_config('role', 'authenticated', true);
    v_third := public.record_round('carnaval-parade', 2000, v_stats_200f);
    v_names := array_append(v_names, 'over_cap_round_pays_exactly_120_no_second_badge');
    v_pass := array_append(
      v_pass,
      (v_third ->> 'tokensAwarded')::int = 120
        and (v_third ->> 'badgeEarned')::boolean = false
        and v_third -> 'badgesEarned' = v_none
    );
    v_detail := array_append(v_detail, format('result=%s', v_third));

    -- C4: a later ordinary round, still at or above 400, confirms the Badge
    -- (and its bonus) stay a one-time thing, not tied to score size.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '1 hour'
    where player_id = fixture and minigame_id = 'carnaval-parade';
    perform set_config('role', 'authenticated', true);
    v_fourth := public.record_round(
      'carnaval-parade', 440, '{"feathers":44,"stars":0,"barriersHit":0,"bestStreak":16}'::jsonb
    );
    select count(*) into v_count
    from public.player_badges b where b.player_id = fixture and b.badge_id = 'passista';
    v_names := array_append(v_names, 'later_round_at_threshold_no_second_badge_or_bonus');
    v_pass := array_append(
      v_pass,
      (v_fourth ->> 'badgeEarned')::boolean = false
        and v_fourth -> 'badgesEarned' = v_none
        and (v_fourth ->> 'tokensAwarded')::int = 44
        and v_count = 1
    );
    v_detail := array_append(v_detail, format('result=%s badge rows=%s', v_fourth, v_count));

    -- Over the whole run: 1000 + 10 (honest) + (60 + 50) (half-window,
    -- Passista) + 120 (full cap) + 44 (later round) = 1284, i.e. the +50 was
    -- paid exactly once.
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'bonus_paid_once_over_the_run');
    v_pass := array_append(v_pass, v_tokens = 1284);
    v_detail := array_append(v_detail, format('tokens=%s (expected 1284)', v_tokens));

    -- C7: the leaderboard knows 'carnaval-parade'.
    v_err := null;
    begin
      select count(*) into v_count from public.leaderboard('carnaval-parade');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'leaderboard_accepts_carnaval_parade');
    v_pass := array_append(v_pass, v_err is null);
    v_detail := array_append(v_detail, format('error=%s rows=%s', v_err, v_count));

    -----------------------------------------------------------------------
    -- As anon (no sub claim): every touched function is denied.
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_state := null;
    begin
      perform public.record_round('carnaval-parade', 400, v_stats_40f);
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_record_round');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform count(*) from public.leaderboard('carnaval-parade');
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
    raise exception 'proof_219_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_219_rollback' then
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

select * from pg_temp.proof_219('00000000-0000-0000-0000-00000000f1f0'::uuid);
