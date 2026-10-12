-- "Pitch your hack in under 60 seconds" proof (#142), against the #9 H1
-- fixture Player, in quest_registry_proof.sql's style. Covers
-- 20261009010000_quest_pitch_hack.sql's decisions P1-P8.
--
-- What this proves. As postgres: public.quests holds ('pitch-hack', 75);
-- public.player_pitch_runs has RLS on and is SELECT-only for authenticated
-- and closed to anon. As the fixture signed in (role authenticated): the two
-- internal functions are denied (42501); a fresh run reports nothing;
-- start_pitch and submit_pitch are refused before talking to Linda
-- (pitch_not_started); submit_pitch is refused before start_pitch
-- (pitch_not_started); an out-of-range or null choice is refused (invalid_pitch)
-- without touching started_at; the Quest is refused (quest_incomplete)
-- until a pitch lands. Time is controlled the one way a client never can: as
-- postgres, the stored start time is set into the past relative to the
-- database's own now() (the fixture itself is shown to be denied that
-- write). So: a submission 66 s after start_pitch is refused with
-- pitch_timeout, writes nothing, and started_at is left untouched (so the
-- Player could still -- within the same window as any other check -- see
-- the same refusal again, not a fresh clock); a fresh start_pitch resets the
-- clock; a submission 64 s after a fresh start (inside the 5 s grace) is
-- accepted and reports its seconds; a submission under 20 s away also
-- completes the Quest, pays 75 once, and a replay (another start_pitch then
-- submit_pitch) never pays again. As anon: every RPC is denied (42501).
-- Also: every function is security definer with search_path = '' and one
-- overload, every RPC takes only its stated arguments (no way to name
-- another Player), and the grants.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside
-- pg_temp.proof_quest_pitch_hack(), which ends by raising and catching a
-- sentinel exception, rolling back every write the function made. It prints
-- only booleans, counts, error codes and Token amounts -- no Player's name,
-- id or email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_quest_pitch_hack(fixture uuid)
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
    -- pitch run, no 'pitch-hack' completion and 1000 Tokens.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.player_quest_completions
    where player_id = fixture and quest_id = 'pitch-hack';
    delete from public.player_pitch_runs where player_id = fixture;
    update public.players set tokens = 1000 where id = fixture;

    v_names := array_append(v_names, 'registry_has_pitch_hack_75');
    v_pass := array_append(
      v_pass,
      (select q.reward_tokens = 75 from public.quests q where q.id = 'pitch-hack')
    );
    v_detail := array_append(v_detail, 'public.quests pitch-hack reward_tokens = 75');

    v_names := array_append(v_names, 'pitch_runs_select_only_for_owner');
    v_pass := array_append(
      v_pass,
      has_table_privilege('authenticated', 'public.player_pitch_runs', 'select')
        and not has_table_privilege('authenticated', 'public.player_pitch_runs', 'insert')
        and not has_table_privilege('authenticated', 'public.player_pitch_runs', 'update')
        and not has_table_privilege('authenticated', 'public.player_pitch_runs', 'delete')
        and not has_table_privilege('anon', 'public.player_pitch_runs', 'select')
        and (select c.relrowsecurity from pg_class c
             where c.oid = 'public.player_pitch_runs'::regclass)
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
    foreach v_fn in array array['pitch_run_state', 'quest_steps__pitch_hack'] loop
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

    v_result := public.pitch_run();
    v_steps := public.quest_progress() -> 'questSteps' -> 'pitch-hack';
    v_names := array_append(v_names, 'fresh_run_reports_nothing');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object('talkedToLinda', false, 'passed', false, 'bestSeconds', null)
        and v_steps = jsonb_build_object('talk-to-linda', false, 'pitch-under-60', false)
    );
    v_detail := array_append(v_detail, format('run=%s steps=%s', v_result, v_steps));

    v_err := null;
    begin
      perform public.start_pitch();
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'start_refused_before_talking_to_linda');
    v_pass := array_append(v_pass, v_err = 'pitch_not_started');
    v_detail := array_append(v_detail, format('error=%s', v_err));

    v_err := null;
    begin
      perform public.submit_pitch(0, 0, 0);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'submit_refused_before_talking_to_linda');
    v_pass := array_append(v_pass, v_err = 'pitch_not_started');
    v_detail := array_append(v_detail, format('error=%s', v_err));

    v_err := null;
    begin
      perform public.complete_quest('pitch-hack');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'quest_refused_before_start');
    v_pass := array_append(v_pass, v_err = 'quest_incomplete');
    v_detail := array_append(v_detail, format('error=%s', v_err));

    -- Step 1: talking to Linda.
    v_result := public.mark_linda_talked();
    v_names := array_append(v_names, 'talking_to_linda_marks_the_step');
    v_pass := array_append(
      v_pass,
      v_result ->> 'talkedToLinda' = 'true'
        and public.quest_progress() -> 'questSteps' -> 'pitch-hack' ->> 'talk-to-linda' = 'true'
    );
    v_detail := array_append(v_detail, format('run=%s', v_result));

    -- A second talk keeps the first one's time (talked_at is coalesced).
    perform set_config('role', 'postgres', true);
    update public.player_pitch_runs
    set talked_at = now() - interval '1 hour'
    where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    perform public.mark_linda_talked();
    v_names := array_append(v_names, 'talking_again_keeps_the_first_talk');
    v_pass := array_append(
      v_pass,
      (select r.talked_at = now() - interval '1 hour'
       from public.player_pitch_runs r where r.player_id = fixture)
    );
    v_detail := array_append(v_detail, 'talked_at unchanged by a second mark_linda_talked');

    v_err := null;
    begin
      perform public.submit_pitch(0, 0, 0);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'submit_refused_before_start_pitch');
    v_pass := array_append(v_pass, v_err = 'pitch_not_started');
    v_detail := array_append(v_detail, format('error=%s', v_err));

    -- An out-of-range choice is refused before started_at is ever touched.
    v_result := public.start_pitch();
    select r.started_at into v_at from public.player_pitch_runs r where r.player_id = fixture;
    v_bad := array[]::text[];
    foreach v_fn in array array[
      'select public.submit_pitch(3, 0, 0)',
      'select public.submit_pitch(0, -1, 0)',
      'select public.submit_pitch(0, 0, 9)',
      'select public.submit_pitch(null, 0, 0)',
      'select public.submit_pitch(0, 0, null)'
    ] loop
      v_err := null;
      begin
        execute v_fn;
      exception when others then
        v_err := sqlerrm;
      end;
      if v_err is distinct from 'invalid_pitch' then
        v_bad := array_append(v_bad, format('%s->%s', v_fn, v_err));
      end if;
    end loop;
    v_names := array_append(v_names, 'out_of_range_choice_refused_invalid_pitch');
    v_pass := array_append(
      v_pass,
      cardinality(v_bad) = 0
        and (select r.started_at = v_at and r.passed_at is null
             from public.player_pitch_runs r where r.player_id = fixture)
    );
    v_detail := array_append(v_detail, format('unexpected=%s', v_bad));

    -- The fixture can't move the start time itself (P2/P3).
    v_bad := array[]::text[];
    v_state := null;
    begin
      update public.player_pitch_runs set started_at = now() - interval '1 second'
      where player_id = fixture;
    exception when others then
      v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then
      v_bad := array_append(v_bad, format('update->%s', v_state));
    end if;
    v_state := null;
    begin
      delete from public.player_pitch_runs where player_id = fixture;
    exception when others then
      v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then
      v_bad := array_append(v_bad, format('delete->%s', v_state));
    end if;
    v_names := array_append(v_names, 'player_cannot_write_the_start_time');
    v_pass := array_append(v_pass, cardinality(v_bad) = 0);
    v_detail := array_append(v_detail, format('unexpected=%s', v_bad));

    -- 66 s after start_pitch: past 60 s plus the 5 s grace.
    perform set_config('role', 'postgres', true);
    update public.player_pitch_runs
    set started_at = now() - interval '66 seconds'
    where player_id = fixture;
    select tokens into v_before from public.players where id = fixture;
    perform set_config('role', 'authenticated', true);

    v_err := null;
    begin
      perform public.submit_pitch(0, 0, 0);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'submission_after_65_seconds_refused_pitch_timeout');
    v_pass := array_append(
      v_pass,
      v_err = 'pitch_timeout'
        and (select r.passed_at is null and r.started_at = now() - interval '66 seconds'
             from public.player_pitch_runs r where r.player_id = fixture)
    );
    v_detail := array_append(v_detail, format('error=%s', v_err));

    v_err := null;
    begin
      perform public.complete_quest('pitch-hack');
    exception when others then
      v_err := sqlerrm;
    end;
    select tokens into v_tokens from public.players where id = fixture;
    v_names := array_append(v_names, 'timeout_pays_nothing');
    v_pass := array_append(v_pass, v_err = 'quest_incomplete' and v_tokens = v_before);
    v_detail := array_append(
      v_detail,
      format('error=%s delta=%s (expected 0)', v_err, v_tokens - v_before)
    );

    -- A fresh start_pitch resets the clock.
    v_result := public.start_pitch();
    v_names := array_append(v_names, 'start_pitch_resets_the_clock');
    v_pass := array_append(
      v_pass,
      (select r.started_at > now() - interval '1 second'
       from public.player_pitch_runs r where r.player_id = fixture)
    );
    v_detail := array_append(v_detail, format('run=%s', v_result));

    -- 64 s after this fresh start: inside the grace, accepted. Rolled back to
    -- a savepoint so the run continues unscored.
    perform set_config('role', 'postgres', true);
    update public.player_pitch_runs
    set started_at = now() - interval '64 seconds'
    where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_result := null;
    begin
      v_result := public.submit_pitch(1, 1, 1);
      raise exception 'proof_grace_rollback';
    exception when others then
      if sqlerrm <> 'proof_grace_rollback' then
        v_result := jsonb_build_object('error', sqlerrm);
      end if;
    end;
    v_names := array_append(v_names, 'submission_inside_the_grace_accepted');
    v_pass := array_append(v_pass, (v_result ->> 'seconds')::int = 64);
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -- 12 s after a fresh start: under 20 s, completes the Quest.
    perform set_config('role', 'postgres', true);
    update public.player_pitch_runs
    set started_at = now() - interval '12 seconds'
    where player_id = fixture;
    select tokens into v_before from public.players where id = fixture;
    perform set_config('role', 'authenticated', true);

    v_result := public.submit_pitch(2, 1, 0);
    v_steps := public.quest_progress() -> 'questSteps' -> 'pitch-hack';
    v_names := array_append(v_names, 'fast_pitch_reports_its_seconds_and_completes_both_steps');
    v_pass := array_append(
      v_pass,
      (v_result ->> 'seconds')::int = 12
        and v_steps = jsonb_build_object('talk-to-linda', true, 'pitch-under-60', true)
        and (select r.started_at is null and r.best_seconds = 12
             from public.player_pitch_runs r where r.player_id = fixture)
    );
    v_detail := array_append(v_detail, format('result=%s steps=%s', v_result, v_steps));

    v_result := public.complete_quest('pitch-hack');
    select tokens into v_tokens from public.players where id = fixture;
    v_names := array_append(v_names, 'pays_75_once');
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

    v_second := public.complete_quest('pitch-hack');
    select tokens into v_tokens from public.players where id = fixture;
    v_names := array_append(v_names, 'second_claim_pays_nothing');
    v_pass := array_append(
      v_pass,
      v_second = jsonb_build_object(
        'tokensAwarded', 0, 'balance', v_before + 75, 'alreadyCompleted', true,
        'badgesEarned', '[]'::jsonb
      )
        and v_tokens = v_before + 75
        and public.quest_progress() -> 'completedQuests' ? 'pitch-hack'
    );
    v_detail := array_append(v_detail, format('result=%s', v_second));

    -- Replay: another start_pitch then a faster submit_pitch improves
    -- best_seconds and never pays again.
    perform public.start_pitch();
    perform set_config('role', 'postgres', true);
    update public.player_pitch_runs
    set started_at = now() - interval '5 seconds'
    where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    select tokens into v_before from public.players where id = fixture;
    v_result := public.submit_pitch(0, 0, 0);
    v_second := public.complete_quest('pitch-hack');
    select tokens into v_tokens from public.players where id = fixture;
    v_names := array_append(v_names, 'replay_improves_best_seconds_but_never_pays_again');
    v_pass := array_append(
      v_pass,
      (v_result ->> 'seconds')::int = 5
        and v_second ->> 'alreadyCompleted' = 'true'
        and v_tokens = v_before
        and (select r.best_seconds = 5 from public.player_pitch_runs r where r.player_id = fixture)
    );
    v_detail := array_append(v_detail, format('result=%s second=%s', v_result, v_second));

    -----------------------------------------------------------------------
    -- As anon (no sub claim): every RPC is denied.
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_bad := array[]::text[];
    foreach v_fn in array array[
      'select public.mark_linda_talked()',
      'select public.start_pitch()',
      'select public.submit_pitch(0, 0, 0)',
      'select public.pitch_run()'
    ] loop
      v_state := null;
      begin
        execute v_fn;
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
      (select count(*) = 6
         and bool_and(p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in (
           'pitch_run_state', 'quest_steps__pitch_hack', 'mark_linda_talked', 'start_pitch',
           'submit_pitch', 'pitch_run'
         ))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for all six');

    v_names := array_append(v_names, 'rpcs_take_only_their_stated_arguments');
    v_pass := array_append(
      v_pass,
      (select bool_and(p.pronargs = 0)
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('mark_linda_talked', 'start_pitch', 'pitch_run'))
        and (select p.pronargs = 3
             from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'submit_pitch')
    );
    v_detail := array_append(
      v_detail,
      'pronargs = 0 for mark_linda_talked/start_pitch/pitch_run, 3 for submit_pitch'
    );

    v_names := array_append(v_names, 'execute_granted_to_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.mark_linda_talked()', 'execute')
        and has_function_privilege('authenticated', 'public.start_pitch()', 'execute')
        and has_function_privilege('authenticated', 'public.submit_pitch(int,int,int)', 'execute')
        and has_function_privilege('authenticated', 'public.pitch_run()', 'execute')
        and not has_function_privilege('anon', 'public.start_pitch()', 'execute')
        and not has_function_privilege('authenticated', 'public.pitch_run_state(uuid)', 'execute')
        and not has_function_privilege(
          'authenticated', 'public.quest_steps__pitch_hack(uuid)', 'execute'
        )
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_quest_pitch_hack_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_quest_pitch_hack_rollback' then
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

select * from pg_temp.proof_quest_pitch_hack('00000000-0000-0000-0000-00000000f1f0'::uuid);
