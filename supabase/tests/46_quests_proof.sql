-- Quests proof for #46, against the #9 H1 fixture Player, in #70's
-- 70_leaderboard_proof.sql style.
--
-- What this proves, as the fixture signed in (role authenticated):
-- complete_quest('main') refuses with quest_incomplete while any step is
-- unmet (paying nothing), refuses an unknown Quest id with unknown_quest,
-- pays exactly 150 Tokens once all five steps are met in a non-listed
-- order, and a second call returns alreadyCompleted with nothing paid;
-- mark_dev_pit_visited() sets the flag and keeps the first visit's time;
-- quest_progress() reports the flag, finished rounds (a 0-score round,
-- which sets no best, still counts) and paid Quests; the two new tables
-- are SELECT-only and own-rows-only for authenticated; and as anon every
-- function is denied (42501). Also: every function is security definer
-- with search_path = '' and exactly one overload, and EXECUTE is granted
-- to authenticated only.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside pg_temp.proof_46(), which
-- ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the fixture's rounds, purchase, Tokens, Quest
-- rows and the throwaway Player B). It prints only booleans, counts and
-- Token amounts -- no Player's name, id or email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_46(fixture uuid)
returns table (check_name text, pass boolean, detail text)
language plpgsql
as $$
declare
  v_names text[] := array[]::text[];
  v_pass boolean[] := array[]::boolean[];
  v_detail text[] := array[]::text[];
  v_b_id uuid;
  v_count int;
  v_err text;
  v_state text;
  v_result jsonb;
  v_second jsonb;
  v_progress jsonb;
  v_tokens int;
  v_first_visit timestamptz;
  v_all boolean;
  v_total int;
  i int;
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: the fixture has a finished Penguin
    -- (step 1), 1000 Tokens, and no Quest rows, rounds or Furniture, so
    -- steps 2-5 start unmet on every run. A throwaway Player B has its own
    -- Dev Pit visit, for the own-rows check.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.player_quest_completions where player_id = fixture;
    delete from public.player_quest_state where player_id = fixture;
    delete from public.minigame_rounds where player_id = fixture;
    delete from public.igloo_slots where player_id = fixture;
    delete from public.player_items where player_id = fixture;
    update public.players
    set penguin_name = 'PROOF FIXTURE', profile_created_at = now(), tokens = 1000
    where id = fixture;

    begin
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'quests-proof-b@example.invalid')
      returning id into v_b_id;
    exception when others then
      raise exception
        'precondition failed: could not create throwaway Player B in auth.users (sqlstate=%, sqlerrm=%)',
        sqlstate, sqlerrm;
    end;
    insert into public.players (id) values (v_b_id) on conflict do nothing;
    insert into public.player_quest_state (player_id, dev_pit_visited_at) values (v_b_id, now());

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

    -- Only step 1 is met.
    v_err := null;
    begin
      perform public.complete_quest('main');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'refuses_with_only_step_1');
    v_pass := array_append(v_pass, v_err is not distinct from 'quest_incomplete');
    v_detail := array_append(v_detail, format('error=%s (expected quest_incomplete)', v_err));

    v_err := null;
    begin
      perform public.complete_quest('hexle');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'refuses_unknown_quest');
    v_pass := array_append(v_pass, v_err is not distinct from 'unknown_quest');
    v_detail := array_append(v_detail, format('error=%s (expected unknown_quest)', v_err));

    -- Steps out of order: Pancake Flip (a 0-score round: no best), the
    -- Dev Pit visit (twice), Bug Squash -- still no Furniture.
    perform public.record_round('pancake-flip', 0, '{}'::jsonb);
    perform public.mark_dev_pit_visited();
    select s.dev_pit_visited_at into v_first_visit
    from public.player_quest_state s where s.player_id = fixture;
    perform pg_sleep(0.01);
    perform public.mark_dev_pit_visited();
    perform public.record_round('bug-squash', 0, '{}'::jsonb);

    v_names := array_append(v_names, 'dev_pit_visit_keeps_first_time');
    v_pass := array_append(
      v_pass,
      (select s.dev_pit_visited_at = v_first_visit
       from public.player_quest_state s where s.player_id = fixture)
    );
    v_detail := array_append(v_detail, 'second mark_dev_pit_visited left the time unchanged');

    v_err := null;
    begin
      perform public.complete_quest('main');
    exception when others then
      v_err := sqlerrm;
    end;
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'refuses_without_furniture_and_pays_nothing');
    v_pass := array_append(v_pass, v_err is not distinct from 'quest_incomplete' and v_tokens = 1000);
    v_detail := array_append(v_detail, format('error=%s tokens=%s (expected 1000)', v_err, v_tokens));

    perform public.purchase_item('beanbag');

    v_result := public.complete_quest('main');
    v_names := array_append(v_names, 'pays_150_once_all_steps_met');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object('tokensAwarded', 150, 'balance', 1100, 'alreadyCompleted', false)
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    v_second := public.complete_quest('main');
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'second_call_already_completed_pays_nothing');
    v_pass := array_append(
      v_pass,
      v_second = jsonb_build_object('tokensAwarded', 0, 'balance', 1100, 'alreadyCompleted', true)
        and v_tokens = 1100
    );
    v_detail := array_append(v_detail, format('result=%s tokens=%s', v_second, v_tokens));

    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'quest_progress_reports_saved_state');
    v_pass := array_append(
      v_pass,
      v_progress = jsonb_build_object(
        'devPitVisited', true,
        'roundsFinished', jsonb_build_array('bug-squash', 'pancake-flip'),
        'completedQuests', jsonb_build_array('main')
      )
    );
    v_detail := array_append(v_detail, format('quest_progress=%s', v_progress));

    -- Own rows only: B's visit row is invisible to the fixture.
    select count(*) into v_count from public.player_quest_state where player_id <> fixture;
    v_names := array_append(v_names, 'rls_hides_other_players_rows');
    v_pass := array_append(v_pass, v_count = 0);
    v_detail := array_append(v_detail, format('other Players'' rows visible=%s (expected 0)', v_count));

    -- No direct writes: the functions do every write.
    v_state := null;
    begin
      insert into public.player_quest_completions (player_id, quest_id, tokens_awarded)
      values (fixture, 'main', 999);
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'no_direct_insert_into_completions');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      update public.player_quest_state set dev_pit_visited_at = null where player_id = fixture;
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'no_direct_update_of_quest_state');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    -----------------------------------------------------------------------
    -- As anon (no sub claim): every function is denied.
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_state := null;
    begin
      perform public.complete_quest('main');
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_complete_quest');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.mark_dev_pit_visited();
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_mark_dev_pit_visited');
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
         and p.proname in ('complete_quest', 'mark_dev_pit_visited', 'quest_progress'))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for all three');

    v_names := array_append(v_names, 'execute_granted_to_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.complete_quest(text)', 'execute')
        and has_function_privilege('authenticated', 'public.mark_dev_pit_visited()', 'execute')
        and has_function_privilege('authenticated', 'public.quest_progress()', 'execute')
        and not has_function_privilege('anon', 'public.complete_quest(text)', 'execute')
        and not has_function_privilege('anon', 'public.mark_dev_pit_visited()', 'execute')
        and not has_function_privilege('anon', 'public.quest_progress()', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_46_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_46_rollback' then
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

select * from pg_temp.proof_46('00000000-0000-0000-0000-00000000f1f0'::uuid);
