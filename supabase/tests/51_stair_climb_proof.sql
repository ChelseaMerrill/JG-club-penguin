-- Stairs Challenge proof, against the #9 H1 fixture Player, in
-- 146_phishing_proof.sql's style. Covers 20260929000000_stair_climb.sql's
-- decisions SC1-SC17.
--
-- What this proves: Stair Master is on in #138's catalog (SC14); the new
-- table has RLS on, no policy and no client privilege (SC4); the Eastern day
-- falls where it should at fixed instants either side of midnight, in
-- daylight saving and standard time and on the day it ends (SC10); as the
-- fixture signed in, a fresh Player reads the defaults (SC13), a flight
-- before any start is not_started, floor 0 starts a climb and pays nothing
-- (SC8), a flight within 2 s of the last is too_soon, a repeat is
-- already_logged and a skipped floor out_of_order, none of which writes
-- anything (SC9); each valid flight pays 10, a tally of 95 pays 5, a full
-- tally still logs the flight and pays 0, and a stale day resets the tally
-- (SC10); the first full climb returns badgesEarned {stair-master} and pays
-- the +50 through award_badge outside the tally, once, and a second full
-- climb returns {} and pays its flights only (SC11); every result carries
-- exactly its documented keys and the balance (SC12); invalid floors are
-- invalid_floor (SC6); the table and the internal functions (stair_day,
-- award_badge, award_badge_if_available) are closed to the fixture, and as
-- anon every function and the table are denied (SC4, SC15); each function
-- is security definer with search_path = '' and one overload, with EXECUTE
-- granted to authenticated for the two RPCs only (SC5, SC15).
--
-- Between flights, the proof moves the climb's updated_at back 3 seconds as
-- postgres, because now() doesn't move inside one transaction (RT2-10). The
-- precondition negatives (SC2) and a deleted Badge row are destructive, so
-- they run only in PGlite (src/persistence/sql-stair-climb.test.ts, RT2-11):
-- this file can rerun on real Supabase after the fixture holds Stair Master.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside pg_temp.proof_51(), which
-- ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the fixture's climb, Badge and Tokens). It prints
-- only booleans, counts, dates and Token amounts -- no Player's name, id or
-- email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_51(fixture uuid)
returns table (check_name text, pass boolean, detail text)
language plpgsql
as $$
declare
  v_names text[] := array[]::text[];
  v_pass boolean[] := array[]::boolean[];
  v_detail text[] := array[]::text[];
  v_count int;
  v_state text;
  v_ok boolean;
  v_r jsonb;
  v_p jsonb;
  v_step text;
  v_before int;
  v_after int;
  v_available boolean;
  v_all boolean;
  v_total int;
  v_floor int;
  i int;
  v_result_keys constant text[] :=
    array['badgesEarned', 'balance', 'flightTokensToday', 'flightsLogged', 'logged', 'reason',
          'tokensAwarded'];
  v_progress_keys constant text[] := array['completed', 'flightTokensToday', 'flightsLogged'];
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: the fixture has 1000 Tokens, no climb and
    -- no Stair Master, so every run starts the same.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.player_stair_climbs where player_id = fixture;
    delete from public.player_badges where player_id = fixture and badge_id = 'stair-master';
    update public.players set tokens = 1000 where id = fixture;

    -- SC14: Stair Master is on in #138's catalog.
    select b.available into v_available from public.badges b where b.id = 'stair-master';
    v_names := array_append(v_names, 'stair_master_available_in_catalog');
    v_pass := array_append(v_pass, v_available is true);
    v_detail := array_append(v_detail, format('available=%s (expected true)', v_available));

    -----------------------------------------------------------------------
    -- SC4: RLS on, no policy, no client privilege on the new table.
    -----------------------------------------------------------------------
    v_names := array_append(v_names, 'rls_on_no_policy_no_client_privilege');
    v_pass := array_append(
      v_pass,
      (select c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'player_stair_climbs')
        and not exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = 'player_stair_climbs'
        )
        and not has_table_privilege('anon', 'public.player_stair_climbs', 'select, insert, update, delete')
        and not has_table_privilege('authenticated', 'public.player_stair_climbs', 'select, insert, update, delete')
    );
    v_detail := array_append(v_detail, 'relrowsecurity, pg_policies and has_table_privilege checked');

    -----------------------------------------------------------------------
    -- SC10: the Eastern day at fixed instants (stair_day, as postgres).
    -----------------------------------------------------------------------
    v_names := array_append(v_names, 'eastern_day_at_fixed_instants');
    v_pass := array_append(
      v_pass,
      public.stair_day('2026-09-28T03:59:59Z') = date '2026-09-27'
        and public.stair_day('2026-09-28T04:00:00Z') = date '2026-09-28'
        and public.stair_day('2026-01-15T04:59:59Z') = date '2026-01-14'
        and public.stair_day('2026-01-15T05:00:00Z') = date '2026-01-15'
        and public.stair_day('2026-11-01T04:00:00Z') = date '2026-11-01'
    );
    v_detail := array_append(
      v_detail,
      format(
        '%s %s %s %s %s',
        public.stair_day('2026-09-28T03:59:59Z'),
        public.stair_day('2026-09-28T04:00:00Z'),
        public.stair_day('2026-01-15T04:59:59Z'),
        public.stair_day('2026-01-15T05:00:00Z'),
        public.stair_day('2026-11-01T04:00:00Z')
      )
    );

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

    -- SC13: a Player with no climb reads the defaults.
    v_p := public.stair_climb_progress();
    v_names := array_append(v_names, 'fresh_progress_is_defaults');
    v_pass := array_append(
      v_pass,
      array(select jsonb_object_keys(v_p) order by 1) = v_progress_keys
        and v_p = '{"flightsLogged":0,"completed":false,"flightTokensToday":0}'::jsonb
    );
    v_detail := array_append(v_detail, v_p::text);

    -- SC9: no row yet is not_started, and pays nothing.
    v_r := public.log_stair_flight(1);
    v_names := array_append(v_names, 'flight_before_a_start_is_not_started');
    v_pass := array_append(
      v_pass,
      array(select jsonb_object_keys(v_r) order by 1) = v_result_keys
        and not (v_r ->> 'logged')::boolean
        and v_r ->> 'reason' = 'not_started'
        and (v_r ->> 'tokensAwarded')::int = 0
        and (v_r ->> 'balance')::int = 1000
        and v_r -> 'badgesEarned' = '[]'::jsonb
    );
    v_detail := array_append(v_detail, v_r::text);

    -- SC8: floor 0 starts a climb and pays nothing.
    v_r := public.log_stair_flight(0);
    v_names := array_append(v_names, 'floor_0_starts_a_climb');
    v_pass := array_append(
      v_pass,
      (v_r ->> 'logged')::boolean
        and v_r -> 'reason' = 'null'::jsonb
        and (v_r ->> 'flightsLogged')::int = 0
        and (v_r ->> 'tokensAwarded')::int = 0
        and (v_r ->> 'balance')::int = 1000
    );
    v_detail := array_append(v_detail, v_r::text);

    -- SC9: straight away (now() hasn't moved) is too_soon.
    v_r := public.log_stair_flight(1);
    v_names := array_append(v_names, 'flight_within_2s_is_too_soon');
    v_pass := array_append(
      v_pass,
      not (v_r ->> 'logged')::boolean
        and v_r ->> 'reason' = 'too_soon'
        and (v_r ->> 'flightsLogged')::int = 0
        and (v_r ->> 'balance')::int = 1000
    );
    v_detail := array_append(v_detail, v_r::text);

    -- SC10: a valid flight pays 10.
    perform set_config('role', 'postgres', true);
    update public.player_stair_climbs set updated_at = now() - interval '3 seconds' where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_r := public.log_stair_flight(1);
    v_names := array_append(v_names, 'first_flight_pays_10');
    v_pass := array_append(
      v_pass,
      (v_r ->> 'logged')::boolean
        and (v_r ->> 'flightsLogged')::int = 1
        and (v_r ->> 'tokensAwarded')::int = 10
        and (v_r ->> 'flightTokensToday')::int = 10
        and (v_r ->> 'balance')::int = 1010
        and v_r -> 'badgesEarned' = '[]'::jsonb
    );
    v_detail := array_append(v_detail, v_r::text);

    -- SC9: a repeat is already_logged and a skipped floor out_of_order.
    perform set_config('role', 'postgres', true);
    update public.player_stair_climbs set updated_at = now() - interval '3 seconds' where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_r := public.log_stair_flight(1);
    v_p := public.log_stair_flight(3);
    v_names := array_append(v_names, 'repeat_is_already_logged_and_skip_is_out_of_order');
    v_pass := array_append(
      v_pass,
      v_r ->> 'reason' = 'already_logged'
        and v_p ->> 'reason' = 'out_of_order'
        and not (v_r ->> 'logged')::boolean
        and not (v_p ->> 'logged')::boolean
        and (v_p ->> 'flightsLogged')::int = 1
        and (v_p ->> 'balance')::int = 1010
    );
    v_detail := array_append(v_detail, format('%s / %s', v_r ->> 'reason', v_p ->> 'reason'));

    -- SC10: flight 2 pays 10; with a tally of 95, flight 3 pays 5.
    perform set_config('role', 'postgres', true);
    update public.player_stair_climbs set updated_at = now() - interval '3 seconds' where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_r := public.log_stair_flight(2);
    perform set_config('role', 'postgres', true);
    update public.player_stair_climbs
    set updated_at = now() - interval '3 seconds', tokens_today = 95
    where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_p := public.log_stair_flight(3);
    v_names := array_append(v_names, 'tally_of_95_pays_5');
    v_pass := array_append(
      v_pass,
      (v_r ->> 'tokensAwarded')::int = 10
        and (v_r ->> 'balance')::int = 1020
        and (v_p ->> 'logged')::boolean
        and (v_p ->> 'tokensAwarded')::int = 5
        and (v_p ->> 'flightTokensToday')::int = 100
        and (v_p ->> 'balance')::int = 1025
    );
    v_detail := array_append(v_detail, format('flight 2 +%s, flight 3 +%s', v_r ->> 'tokensAwarded', v_p ->> 'tokensAwarded'));

    -- SC10: at the cap, flight 4 is still logged and pays 0.
    perform set_config('role', 'postgres', true);
    update public.player_stair_climbs set updated_at = now() - interval '3 seconds' where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_r := public.log_stair_flight(4);
    v_names := array_append(v_names, 'capped_flight_is_logged_and_pays_0');
    v_pass := array_append(
      v_pass,
      (v_r ->> 'logged')::boolean
        and (v_r ->> 'flightsLogged')::int = 4
        and (v_r ->> 'tokensAwarded')::int = 0
        and (v_r ->> 'flightTokensToday')::int = 100
        and (v_r ->> 'balance')::int = 1025
    );
    v_detail := array_append(v_detail, v_r::text);

    -- SC11: the first full climb earns Stair Master and its +50, outside the
    -- (full) tally.
    perform set_config('role', 'postgres', true);
    update public.player_stair_climbs set updated_at = now() - interval '3 seconds' where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_r := public.log_stair_flight(5);
    v_names := array_append(v_names, 'first_full_climb_earns_stair_master_and_50');
    v_pass := array_append(
      v_pass,
      (v_r ->> 'logged')::boolean
        and (v_r ->> 'flightsLogged')::int = 5
        and (v_r ->> 'tokensAwarded')::int = 0
        and (v_r ->> 'flightTokensToday')::int = 100
        and v_r -> 'badgesEarned' = '["stair-master"]'::jsonb
        and (v_r ->> 'balance')::int = 1075
    );
    v_detail := array_append(v_detail, v_r::text);

    v_p := public.stair_climb_progress();
    v_names := array_append(v_names, 'progress_reads_the_completed_climb');
    v_pass := array_append(
      v_pass,
      v_p = '{"flightsLogged":5,"completed":true,"flightTokensToday":100}'::jsonb
    );
    v_detail := array_append(v_detail, v_p::text);

    -- SC10: a stale tally (an earlier Eastern day) resets on the next flight.
    perform set_config('role', 'postgres', true);
    update public.player_stair_climbs
    set tokens_day = date '2000-01-01', tokens_today = 100
    where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_p := public.stair_climb_progress();
    v_r := public.log_stair_flight(0);
    perform set_config('role', 'postgres', true);
    update public.player_stair_climbs set updated_at = now() - interval '3 seconds' where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_r := public.log_stair_flight(1);
    v_names := array_append(v_names, 'stale_day_resets_the_tally');
    v_pass := array_append(
      v_pass,
      (v_p ->> 'flightTokensToday')::int = 0
        and (v_r ->> 'logged')::boolean
        and (v_r ->> 'tokensAwarded')::int = 10
        and (v_r ->> 'flightTokensToday')::int = 10
        and (v_r ->> 'balance')::int = 1085
    );
    v_detail := array_append(v_detail, format('stale reads %s; then %s', v_p ->> 'flightTokensToday', v_r));

    -- SC11: a second full climb pays its flights only, with no second Badge.
    v_before := (v_r ->> 'balance')::int;
    v_ok := true;
    for v_floor in 2..5 loop
      perform set_config('role', 'postgres', true);
      update public.player_stair_climbs set updated_at = now() - interval '3 seconds' where player_id = fixture;
      perform set_config('role', 'authenticated', true);
      v_r := public.log_stair_flight(v_floor);
      if not (v_r ->> 'logged')::boolean
        or (v_r ->> 'tokensAwarded')::int <> 10
        or v_r -> 'badgesEarned' <> '[]'::jsonb then
        v_ok := false;
      end if;
    end loop;
    v_after := (v_r ->> 'balance')::int;
    perform set_config('role', 'postgres', true);
    select count(*) into v_count
    from public.player_badges
    where player_id = fixture and badge_id = 'stair-master';
    perform set_config('role', 'authenticated', true);
    v_names := array_append(v_names, 'second_full_climb_pays_flights_only');
    v_pass := array_append(v_pass, v_ok and v_after - v_before = 40 and v_count = 1);
    v_detail := array_append(
      v_detail,
      format('+%s over flights 2-5, %s Stair Master row(s) (expected 40, 1)', v_after - v_before, v_count)
    );

    -- SC6: invalid floors.
    v_count := 0;
    foreach v_step in array array[
      'select public.log_stair_flight(6)',
      'select public.log_stair_flight(-1)',
      'select public.log_stair_flight(null)'
    ] loop
      v_state := null;
      begin
        execute v_step;
      exception when others then
        v_state := sqlerrm;
      end;
      if v_state is not distinct from 'invalid_floor' then
        v_count := v_count + 1;
      end if;
    end loop;
    v_names := array_append(v_names, 'invalid_floor_rejected');
    v_pass := array_append(v_pass, v_count = 3);
    v_detail := array_append(v_detail, format('%s of 3 rejected with invalid_floor', v_count));

    -- SC4/SC15: the table and the internal functions are closed to the fixture.
    v_count := 0;
    foreach v_step in array array[
      'select * from public.player_stair_climbs',
      'insert into public.player_stair_climbs (player_id, floor) values (auth.uid(), 5)',
      'update public.player_stair_climbs set floor = 5',
      'select public.stair_day(now())',
      'select public.award_badge(auth.uid(), ''stair-master'')',
      'select public.award_badge_if_available(auth.uid(), ''stair-master'')'
    ] loop
      v_state := null;
      begin
        execute v_step;
      exception when others then
        v_state := sqlstate;
      end;
      if v_state is not distinct from '42501' then
        v_count := v_count + 1;
      end if;
    end loop;
    v_names := array_append(v_names, 'table_and_internal_functions_closed_to_player');
    v_pass := array_append(v_pass, v_count = 6);
    v_detail := array_append(v_detail, format('%s of 6 denied (42501)', v_count));

    -----------------------------------------------------------------------
    -- As anon: every function and the table are denied.
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);
    v_count := 0;
    foreach v_step in array array[
      'select public.log_stair_flight(1)',
      'select public.stair_climb_progress()',
      'select * from public.player_stair_climbs',
      'select public.stair_day(now())',
      'select public.award_badge(gen_random_uuid(), ''stair-master'')',
      'select public.award_badge_if_available(gen_random_uuid(), ''stair-master'')'
    ] loop
      v_state := null;
      begin
        execute v_step;
      exception when others then
        v_state := sqlstate;
      end;
      if v_state is not distinct from '42501' then
        v_count := v_count + 1;
      end if;
    end loop;
    v_names := array_append(v_names, 'anon_denied_everything');
    v_pass := array_append(v_pass, v_count = 6);
    v_detail := array_append(v_detail, format('%s of 6 denied (42501)', v_count));

    -----------------------------------------------------------------------
    -- SC5/SC15: definer, locked search_path, one overload, grants.
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
         and p.proname in ('stair_day', 'log_stair_flight', 'stair_climb_progress'))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for all three');

    v_names := array_append(v_names, 'execute_granted_to_authenticated_for_the_two_rpcs_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.log_stair_flight(int)', 'execute')
        and has_function_privilege('authenticated', 'public.stair_climb_progress()', 'execute')
        and not has_function_privilege('anon', 'public.log_stair_flight(int)', 'execute')
        and not has_function_privilege('anon', 'public.stair_climb_progress()', 'execute')
        and not has_function_privilege('authenticated', 'public.stair_day(timestamptz)', 'execute')
        and not has_function_privilege('anon', 'public.stair_day(timestamptz)', 'execute')
        and not has_function_privilege('authenticated', 'public.award_badge(uuid, text)', 'execute')
        and not has_function_privilege('anon', 'public.award_badge(uuid, text)', 'execute')
        and not has_function_privilege('authenticated', 'public.award_badge_if_available(uuid, text)', 'execute')
        and not has_function_privilege('anon', 'public.award_badge_if_available(uuid, text)', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_51_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_51_rollback' then
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

select * from pg_temp.proof_51('00000000-0000-0000-0000-00000000f1f0'::uuid);
