-- "Bring Nicole a coffee before kickoff" proof (#141), against the #9 H1
-- fixture Player, in quest_registry_proof.sql's style. Covers
-- 20261006020000_quest_nicole_coffee.sql's decisions C1-C7.
--
-- What this proves. As postgres: public.quests holds ('nicole-coffee', 75);
-- public.player_coffee_runs has RLS on and is SELECT-only for authenticated
-- and closed to anon. As the fixture signed in (role authenticated): the two
-- internal functions are denied (42501); a fresh run reports nothing; the
-- Kitchen visit, asking Tom and delivering are refused before talking to
-- Nicole (coffee_not_started); delivering before Tom handed over a cup is
-- refused (coffee_not_carrying); the Quest is refused (quest_incomplete)
-- until delivery. Time is controlled the one way a client never can: as
-- postgres, the stored hand-over time is set into the past relative to the
-- database's own now() (the fixture itself is shown to be denied that
-- write). So: re-asking while a cup is hot keeps its timer; a delivery 66 s
-- after the hand-over is refused with coffee_cold, writes nothing, and steps
-- 3-5 read as reset; Tom then hands over a fresh cup; a delivery 64 s after
-- (inside the 5 s grace) is accepted; a delivery 20 s after completes all
-- five steps, and complete_quest('nicole-coffee') pays 75 once, without
-- Ship It. As anon: every RPC is denied (42501). Also: every function is
-- security definer with search_path = '' and one overload, the five RPCs
-- take no arguments (no way to name another Player), and the grants.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside
-- pg_temp.proof_quest_nicole_coffee(), which ends by raising and catching a
-- sentinel exception, rolling back every write the function made. It prints
-- only booleans, counts, error codes and Token amounts -- no Player's name,
-- id or email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_quest_nicole_coffee(fixture uuid)
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
  v_steps jsonb;
  v_tokens int;
  v_before int;
  v_at timestamptz;
  v_bad text[];
  v_fn text;
  v_all boolean;
  v_total int;
  i int;
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions and shape, as postgres. The fixture starts with no
    -- coffee run, no 'nicole-coffee' completion and 1000 Tokens.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.player_quest_completions
    where player_id = fixture and quest_id = 'nicole-coffee';
    delete from public.player_coffee_runs where player_id = fixture;
    update public.players set tokens = 1000 where id = fixture;

    v_names := array_append(v_names, 'registry_has_nicole_coffee_75');
    v_pass := array_append(
      v_pass,
      (select q.reward_tokens = 75 from public.quests q where q.id = 'nicole-coffee')
    );
    v_detail := array_append(v_detail, 'public.quests nicole-coffee reward_tokens = 75');

    v_names := array_append(v_names, 'coffee_runs_select_only_for_owner');
    v_pass := array_append(
      v_pass,
      has_table_privilege('authenticated', 'public.player_coffee_runs', 'select')
        and not has_table_privilege('authenticated', 'public.player_coffee_runs', 'insert')
        and not has_table_privilege('authenticated', 'public.player_coffee_runs', 'update')
        and not has_table_privilege('authenticated', 'public.player_coffee_runs', 'delete')
        and not has_table_privilege('anon', 'public.player_coffee_runs', 'select')
        and (select c.relrowsecurity from pg_class c
             where c.oid = 'public.player_coffee_runs'::regclass)
    );
    v_detail := array_append(v_detail, 'has_table_privilege and relrowsecurity checked');

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

    v_bad := array[]::text[];
    foreach v_fn in array array['coffee_run_state', 'quest_steps__nicole_coffee'] loop
      v_state := null;
      begin
        execute format('select public.%I($1)', v_fn) using fixture;
      exception when others then
        v_state := sqlstate;
      end;
      if v_state is distinct from '42501' then
        v_bad := array_append(v_bad, format('%s->%s', v_fn, v_state));
      end if;
    end loop;
    v_names := array_append(v_names, 'authenticated_denied_internal_functions');
    v_pass := array_append(v_pass, cardinality(v_bad) = 0);
    v_detail := array_append(v_detail, format('unexpected=%s', v_bad));

    v_result := public.coffee_run();
    v_steps := public.quest_progress() -> 'questSteps' -> 'nicole-coffee';
    v_names := array_append(v_names, 'fresh_run_reports_nothing');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'talkedToNicole', false, 'kitchenVisited', false, 'delivered', false,
        'handedOverAt', null, 'secondsLeft', null
      )
        and v_steps = jsonb_build_object(
          'talk-to-nicole', false, 'visit-kitchen', false, 'ask-tom', false,
          'carry-coffee', false, 'deliver-coffee', false
        )
    );
    v_detail := array_append(v_detail, format('run=%s steps=%s', v_result, v_steps));

    v_bad := array[]::text[];
    foreach v_fn in array array['mark_kitchen_visited', 'ask_tom_for_coffee', 'deliver_coffee'] loop
      v_err := null;
      begin
        execute format('select public.%I()', v_fn);
      exception when others then
        v_err := sqlerrm;
      end;
      if v_err is distinct from 'coffee_not_started' then
        v_bad := array_append(v_bad, format('%s->%s', v_fn, v_err));
      end if;
    end loop;
    v_names := array_append(v_names, 'refuses_every_step_before_talking_to_nicole');
    v_pass := array_append(v_pass, cardinality(v_bad) = 0);
    v_detail := array_append(v_detail, format('unexpected=%s', v_bad));

    v_err := null;
    begin
      perform public.complete_quest('nicole-coffee');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'quest_refused_before_start');
    v_pass := array_append(v_pass, v_err = 'quest_incomplete');
    v_detail := array_append(v_detail, format('error=%s', v_err));

    -- Step 1: talking to Nicole.
    v_result := public.start_coffee_run();
    v_names := array_append(v_names, 'talking_to_nicole_starts_the_run');
    v_pass := array_append(
      v_pass,
      v_result ->> 'talkedToNicole' = 'true'
        and v_result ->> 'kitchenVisited' = 'false'
        and v_result -> 'handedOverAt' = 'null'::jsonb
        and public.quest_progress() -> 'questSteps' -> 'nicole-coffee' ->> 'talk-to-nicole' = 'true'
    );
    v_detail := array_append(v_detail, format('run=%s', v_result));

    v_err := null;
    begin
      perform public.deliver_coffee();
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'deliver_refused_before_tom_hands_over');
    v_pass := array_append(v_pass, v_err = 'coffee_not_carrying');
    v_detail := array_append(v_detail, format('error=%s', v_err));

    -- A second talk keeps the first one's time.
    perform set_config('role', 'postgres', true);
    update public.player_coffee_runs
    set talked_at = now() - interval '1 hour'
    where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    perform public.start_coffee_run();
    v_names := array_append(v_names, 'talking_again_keeps_the_first_talk');
    v_pass := array_append(
      v_pass,
      (select r.talked_at = now() - interval '1 hour'
       from public.player_coffee_runs r where r.player_id = fixture)
    );
    v_detail := array_append(v_detail, 'talked_at unchanged by a second start_coffee_run');

    -- Step 2: the Kitchen.
    v_result := public.mark_kitchen_visited();
    v_names := array_append(v_names, 'kitchen_visit_reported');
    v_pass := array_append(
      v_pass,
      v_result ->> 'kitchenVisited' = 'true'
        and public.quest_progress() -> 'questSteps' -> 'nicole-coffee' ->> 'visit-kitchen' = 'true'
    );
    v_detail := array_append(v_detail, format('run=%s', v_result));

    -- Step 3: Tom hands over a cup at the server's now().
    v_result := public.ask_tom_for_coffee();
    v_steps := public.quest_progress() -> 'questSteps' -> 'nicole-coffee';
    v_names := array_append(v_names, 'tom_hands_over_a_cup_with_60_seconds');
    v_pass := array_append(
      v_pass,
      (v_result ->> 'secondsLeft')::numeric = 60
        and (v_result ->> 'handedOverAt')::timestamptz = now()
        and v_steps = jsonb_build_object(
          'talk-to-nicole', true, 'visit-kitchen', true, 'ask-tom', true,
          'carry-coffee', false, 'deliver-coffee', false
        )
    );
    v_detail := array_append(v_detail, format('run=%s steps=%s', v_result, v_steps));

    -- The fixture can't move the hand-over time itself (C2/C3).
    v_bad := array[]::text[];
    v_state := null;
    begin
      update public.player_coffee_runs set handed_over_at = now() where player_id = fixture;
    exception when others then
      v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then
      v_bad := array_append(v_bad, format('update->%s', v_state));
    end if;
    v_state := null;
    begin
      delete from public.player_coffee_runs where player_id = fixture;
    exception when others then
      v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then
      v_bad := array_append(v_bad, format('delete->%s', v_state));
    end if;
    v_names := array_append(v_names, 'player_cannot_write_the_hand_over_time');
    v_pass := array_append(v_pass, cardinality(v_bad) = 0);
    v_detail := array_append(v_detail, format('unexpected=%s', v_bad));

    -- Re-asking while the cup is hot keeps its timer.
    perform set_config('role', 'postgres', true);
    update public.player_coffee_runs
    set handed_over_at = now() - interval '30 seconds'
    where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_result := public.ask_tom_for_coffee();
    v_names := array_append(v_names, 'asking_again_while_hot_keeps_the_timer');
    v_pass := array_append(
      v_pass,
      (v_result ->> 'secondsLeft')::numeric = 30
        and (select r.handed_over_at = now() - interval '30 seconds'
             from public.player_coffee_runs r where r.player_id = fixture)
    );
    v_detail := array_append(v_detail, format('run=%s', v_result));

    -- 66 s after the hand-over: past 60 s plus the 5 s grace.
    perform set_config('role', 'postgres', true);
    update public.player_coffee_runs
    set handed_over_at = now() - interval '66 seconds'
    where player_id = fixture;
    select tokens into v_before from public.players where id = fixture;
    perform set_config('role', 'authenticated', true);

    v_result := public.coffee_run();
    v_steps := public.quest_progress() -> 'questSteps' -> 'nicole-coffee';
    v_names := array_append(v_names, 'cold_cup_resets_steps_3_to_5');
    v_pass := array_append(
      v_pass,
      v_result -> 'secondsLeft' = 'null'::jsonb
        and v_result -> 'handedOverAt' = 'null'::jsonb
        and v_steps = jsonb_build_object(
          'talk-to-nicole', true, 'visit-kitchen', true, 'ask-tom', false,
          'carry-coffee', false, 'deliver-coffee', false
        )
    );
    v_detail := array_append(v_detail, format('run=%s steps=%s', v_result, v_steps));

    v_err := null;
    begin
      perform public.deliver_coffee();
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'delivery_after_65_seconds_refused_coffee_cold');
    v_pass := array_append(
      v_pass,
      v_err = 'coffee_cold'
        and (select r.delivered_at is null
             from public.player_coffee_runs r where r.player_id = fixture)
    );
    v_detail := array_append(v_detail, format('error=%s', v_err));

    v_err := null;
    begin
      perform public.complete_quest('nicole-coffee');
    exception when others then
      v_err := sqlerrm;
    end;
    select tokens into v_tokens from public.players where id = fixture;
    v_names := array_append(v_names, 'cold_cup_pays_nothing');
    v_pass := array_append(v_pass, v_err = 'quest_incomplete' and v_tokens = v_before);
    v_detail := array_append(
      v_detail,
      format('error=%s delta=%s (expected 0)', v_err, v_tokens - v_before)
    );

    -- Asking Tom again after the cup went cold hands over a fresh one.
    v_result := public.ask_tom_for_coffee();
    v_names := array_append(v_names, 'tom_hands_over_a_fresh_cup_after_expiry');
    v_pass := array_append(
      v_pass,
      (v_result ->> 'secondsLeft')::numeric = 60
        and public.quest_progress() -> 'questSteps' -> 'nicole-coffee' ->> 'ask-tom' = 'true'
    );
    v_detail := array_append(v_detail, format('run=%s', v_result));

    -- 64 s after the hand-over: inside the grace, accepted. Rolled back to a
    -- savepoint so the run continues with an undelivered cup.
    perform set_config('role', 'postgres', true);
    update public.player_coffee_runs
    set handed_over_at = now() - interval '64 seconds'
    where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_result := null;
    begin
      v_result := public.deliver_coffee();
      raise exception 'proof_grace_rollback';
    exception when others then
      if sqlerrm <> 'proof_grace_rollback' then
        v_result := jsonb_build_object('error', sqlerrm);
      end if;
    end;
    v_names := array_append(v_names, 'delivery_inside_the_grace_accepted');
    v_pass := array_append(v_pass, v_result ->> 'delivered' = 'true');
    v_detail := array_append(v_detail, format('run=%s', v_result));

    -- 20 s after the hand-over: delivered.
    perform set_config('role', 'postgres', true);
    update public.player_coffee_runs
    set handed_over_at = now() - interval '20 seconds'
    where player_id = fixture;
    select tokens into v_before from public.players where id = fixture;
    perform set_config('role', 'authenticated', true);

    v_result := public.deliver_coffee();
    v_steps := public.quest_progress() -> 'questSteps' -> 'nicole-coffee';
    v_names := array_append(v_names, 'delivery_in_time_completes_every_step');
    v_pass := array_append(
      v_pass,
      v_result ->> 'delivered' = 'true'
        and v_result -> 'secondsLeft' = 'null'::jsonb
        and v_steps = jsonb_build_object(
          'talk-to-nicole', true, 'visit-kitchen', true, 'ask-tom', true,
          'carry-coffee', true, 'deliver-coffee', true
        )
    );
    v_detail := array_append(v_detail, format('run=%s steps=%s', v_result, v_steps));

    v_result := public.complete_quest('nicole-coffee');
    select tokens into v_tokens from public.players where id = fixture;
    v_names := array_append(v_names, 'pays_75_without_ship_it');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 75, 'balance', v_before + 75, 'alreadyCompleted', false,
        'badgesEarned', '[]'::jsonb
      )
        and v_tokens = v_before + 75
    );
    v_detail := array_append(
      v_detail,
      format('result=%s delta=%s (expected 75)', v_result, v_tokens - v_before)
    );

    v_second := public.complete_quest('nicole-coffee');
    select tokens into v_tokens from public.players where id = fixture;
    v_names := array_append(v_names, 'second_claim_pays_nothing');
    v_pass := array_append(
      v_pass,
      v_second = jsonb_build_object(
        'tokensAwarded', 0, 'balance', v_before + 75, 'alreadyCompleted', true,
        'badgesEarned', '[]'::jsonb
      )
        and v_tokens = v_before + 75
        and public.quest_progress() -> 'completedQuests' ? 'nicole-coffee'
    );
    v_detail := array_append(v_detail, format('result=%s', v_second));

    -- After delivery, asking and delivering again change nothing.
    select r.delivered_at into v_at from public.player_coffee_runs r where r.player_id = fixture;
    v_result := public.ask_tom_for_coffee();
    v_second := public.deliver_coffee();
    v_names := array_append(v_names, 'after_delivery_asking_and_delivering_change_nothing');
    v_pass := array_append(
      v_pass,
      v_result ->> 'delivered' = 'true'
        and v_result -> 'secondsLeft' = 'null'::jsonb
        and v_second ->> 'delivered' = 'true'
        and (select r.delivered_at = v_at and r.handed_over_at = now() - interval '20 seconds'
             from public.player_coffee_runs r where r.player_id = fixture)
    );
    v_detail := array_append(v_detail, format('ask=%s deliver=%s', v_result, v_second));

    -----------------------------------------------------------------------
    -- As anon (no sub claim): every RPC is denied.
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_bad := array[]::text[];
    foreach v_fn in array array[
      'coffee_run', 'start_coffee_run', 'mark_kitchen_visited', 'ask_tom_for_coffee',
      'deliver_coffee'
    ] loop
      v_state := null;
      begin
        execute format('select public.%I()', v_fn);
      exception when others then
        v_state := sqlstate;
      end;
      if v_state is distinct from '42501' then
        v_bad := array_append(v_bad, format('%s->%s', v_fn, v_state));
      end if;
    end loop;
    v_names := array_append(v_names, 'anon_denied_every_rpc');
    v_pass := array_append(v_pass, cardinality(v_bad) = 0);
    v_detail := array_append(v_detail, format('unexpected=%s', v_bad));

    -----------------------------------------------------------------------
    -- Function definitions and grants, as postgres.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    v_names := array_append(v_names, 'one_overload_each_security_definer_search_path_locked');
    v_pass := array_append(
      v_pass,
      (select count(*) = 7
         and bool_and(p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in (
           'coffee_run_state', 'quest_steps__nicole_coffee', 'coffee_run', 'start_coffee_run',
           'mark_kitchen_visited', 'ask_tom_for_coffee', 'deliver_coffee'
         ))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for all seven');

    v_names := array_append(v_names, 'rpcs_take_no_player_argument');
    v_pass := array_append(
      v_pass,
      (select count(*) = 5 and bool_and(p.pronargs = 0)
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in (
           'coffee_run', 'start_coffee_run', 'mark_kitchen_visited', 'ask_tom_for_coffee',
           'deliver_coffee'
         ))
    );
    v_detail := array_append(v_detail, 'pg_proc pronargs = 0 for all five RPCs');

    v_names := array_append(v_names, 'execute_granted_to_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.coffee_run()', 'execute')
        and has_function_privilege('authenticated', 'public.start_coffee_run()', 'execute')
        and has_function_privilege('authenticated', 'public.mark_kitchen_visited()', 'execute')
        and has_function_privilege('authenticated', 'public.ask_tom_for_coffee()', 'execute')
        and has_function_privilege('authenticated', 'public.deliver_coffee()', 'execute')
        and not has_function_privilege('anon', 'public.deliver_coffee()', 'execute')
        and not has_function_privilege('authenticated', 'public.coffee_run_state(uuid)', 'execute')
        and not has_function_privilege(
          'authenticated', 'public.quest_steps__nicole_coffee(uuid)', 'execute'
        )
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_quest_nicole_coffee_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_quest_nicole_coffee_rollback' then
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

select * from pg_temp.proof_quest_nicole_coffee('00000000-0000-0000-0000-00000000f1f0'::uuid);
