-- "Pair with a JGer and fix the flaky test" Quest proof (#140), against the
-- #9 H1 fixture Player, in 46_quests_proof.sql / quest_registry_proof.sql's
-- style. Covers 20261009000000_quest_pair_flaky_test.sql.
--
-- What this proves. As postgres: public.quests holds ('pair-flaky-test', 150)
-- with its quest_steps__pair_flaky_test(uuid) function registered. As the
-- fixture signed in (role authenticated): each of mark_paul_talked(),
-- mark_ci_board_checked() and mark_paired() sets its own column and keeps the
-- first time on a second call; a bug-squash round with flakyHits = 2 never
-- meets squash-flakes, one with flakyHits = 3 does; a round whose flakyHits
-- isn't a number is rejected outright by record_round's own stats validation
-- (#27, unchanged here), not by anything this migration adds; report_to_paul()
-- refuses with quest_steps_incomplete, writing nothing, until talk-to-paul,
-- check-ci-board, pair-with-jger and squash-flakes are all met, then sets
-- paul_reported_at and keeps the first time on a second call;
-- complete_quest('pair-flaky-test') then pays 150 Tokens exactly once, with
-- no Badge (only 'main' awards Ship It), and a second call pays nothing. A
-- second Player (B) proves the three mark_* functions are scoped to the
-- caller: B's own calls never change the fixture's already-set flags. As
-- anon: mark_paul_talked, mark_ci_board_checked, mark_paired, report_to_paul
-- and quest_steps__pair_flaky_test are all denied (42501). Also: every
-- function here is security definer with search_path = '' and one overload
-- each, and the four client RPCs are executable by authenticated only
-- (never anon); quest_steps__pair_flaky_test is executable by neither.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside
-- pg_temp.proof_quest_pair_flaky_test(), which ends by raising and catching a
-- sentinel exception, rolling back every write the function made (the
-- fixture's and Player B's quest state, minigame rounds, Tokens, every
-- 'pair-flaky-test' completion row, and Player B itself). It prints only
-- booleans, counts and Token amounts -- no Player's name, id or email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_quest_pair_flaky_test(fixture uuid)
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
  v_before int;
  v_first_talk timestamptz;
  v_first_ci timestamptz;
  v_first_paired timestamptz;
  v_first_reported timestamptz;
  v_all boolean;
  v_total int;
  i int;
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: clean fixture state, and a throwaway
    -- Player B.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.player_quest_completions
    where player_id = fixture and quest_id = 'pair-flaky-test';
    update public.player_quest_state set
      paul_talked_at = null,
      ci_board_checked_at = null,
      paired_at = null,
      paul_reported_at = null
    where player_id = fixture;
    delete from public.minigame_rounds where player_id = fixture and minigame_id = 'bug-squash';
    update public.players set tokens = 1000 where id = fixture;

    v_names := array_append(v_names, 'registry_seeds_pair_flaky_test_150_with_steps_function');
    v_pass := array_append(
      v_pass,
      (select q.reward_tokens = 150 from public.quests q where q.id = 'pair-flaky-test')
        and to_regprocedure('public.quest_steps__pair_flaky_test(uuid)') is not null
    );
    v_detail := array_append(
      v_detail,
      'public.quests pair-flaky-test reward_tokens = 150, steps function present'
    );

    begin
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'pair-flaky-test-proof-b@example.invalid')
      returning id into v_b_id;
    exception when others then
      raise exception
        'precondition failed: could not create throwaway Player B in auth.users (sqlstate=%, sqlerrm=%)',
        sqlstate, sqlerrm;
    end;
    insert into public.players (id, tokens) values (v_b_id, 1000) on conflict do nothing;

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

    v_err := null;
    begin
      perform public.report_to_paul();
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'report_refuses_before_any_step');
    v_pass := array_append(v_pass, v_err is not distinct from 'quest_steps_incomplete');
    v_detail := array_append(v_detail, format('error=%s (expected quest_steps_incomplete)', v_err));

    perform public.mark_paul_talked();
    select s.paul_talked_at into v_first_talk
    from public.player_quest_state s where s.player_id = fixture;
    perform pg_sleep(0.01);
    perform public.mark_paul_talked();
    v_names := array_append(v_names, 'talk_to_paul_keeps_first_time');
    v_pass := array_append(
      v_pass,
      (select s.paul_talked_at = v_first_talk
       from public.player_quest_state s where s.player_id = fixture)
    );
    v_detail := array_append(v_detail, 'second mark_paul_talked left the time unchanged');

    perform public.mark_ci_board_checked();
    select s.ci_board_checked_at into v_first_ci
    from public.player_quest_state s where s.player_id = fixture;
    perform pg_sleep(0.01);
    perform public.mark_ci_board_checked();
    v_names := array_append(v_names, 'check_ci_board_keeps_first_time');
    v_pass := array_append(
      v_pass,
      (select s.ci_board_checked_at = v_first_ci
       from public.player_quest_state s where s.player_id = fixture)
    );
    v_detail := array_append(v_detail, 'second mark_ci_board_checked left the time unchanged');

    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'reports_talk_and_ci_board_only_so_far');
    v_pass := array_append(
      v_pass,
      v_progress -> 'questSteps' -> 'pair-flaky-test' = jsonb_build_object(
        'talk-to-paul', true,
        'check-ci-board', true,
        'pair-with-jger', false,
        'squash-flakes', false,
        'report-to-paul', false
      )
    );
    v_detail := array_append(
      v_detail,
      format('questSteps=%s', v_progress -> 'questSteps' -> 'pair-flaky-test')
    );

    perform public.mark_paired();
    select s.paired_at into v_first_paired
    from public.player_quest_state s where s.player_id = fixture;
    perform pg_sleep(0.01);
    perform public.mark_paired();
    v_names := array_append(v_names, 'pair_with_jger_keeps_first_time');
    v_pass := array_append(
      v_pass,
      (select s.paired_at = v_first_paired
       from public.player_quest_state s where s.player_id = fixture)
    );
    v_detail := array_append(v_detail, 'second mark_paired left the time unchanged');

    -- A non-numeric flakyHits is rejected by record_round's own stats
    -- validation (#27), before this migration's own check ever runs.
    v_err := null;
    begin
      perform public.record_round('bug-squash', 100, '{"flakyHits": "three"}'::jsonb);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'non_numeric_flaky_hits_rejected_by_record_round');
    v_pass := array_append(v_pass, v_err is not distinct from 'invalid_stats');
    v_detail := array_append(v_detail, format('error=%s (expected invalid_stats)', v_err));

    perform public.record_round(
      'bug-squash', 100,
      jsonb_build_object('score', 100, 'squashed', 10, 'bestCombo', 1, 'escaped', 0, 'flakyHits', 2)
    );
    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'two_flaky_hits_does_not_meet_squash_flakes');
    v_pass := array_append(
      v_pass,
      ((v_progress -> 'questSteps' -> 'pair-flaky-test' ->> 'squash-flakes')::boolean) is false
    );
    v_detail := array_append(
      v_detail,
      format('questSteps=%s', v_progress -> 'questSteps' -> 'pair-flaky-test')
    );

    v_err := null;
    begin
      perform public.report_to_paul();
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'report_still_refuses_with_only_two_flaky_hits');
    v_pass := array_append(v_pass, v_err is not distinct from 'quest_steps_incomplete');
    v_detail := array_append(v_detail, format('error=%s (expected quest_steps_incomplete)', v_err));

    -- Space the next round out past record_round's own 10 s anti-farm rule.
    -- public.minigame_rounds is select-only for authenticated (#27); the
    -- backdate itself runs as postgres, same as the harness's own
    -- `advanceSeconds` (testing/pglite-progress-store.ts).
    perform pg_sleep(0.01);
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds set finished_at = now() - interval '11 seconds'
    where player_id = fixture and minigame_id = 'bug-squash';
    perform set_config('role', 'authenticated', true);

    perform public.record_round(
      'bug-squash', 150,
      jsonb_build_object('score', 150, 'squashed', 12, 'bestCombo', 2, 'escaped', 0, 'flakyHits', 3)
    );
    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'three_flaky_hits_meets_squash_flakes');
    v_pass := array_append(
      v_pass,
      v_progress -> 'questSteps' -> 'pair-flaky-test' = jsonb_build_object(
        'talk-to-paul', true,
        'check-ci-board', true,
        'pair-with-jger', true,
        'squash-flakes', true,
        'report-to-paul', false
      )
    );
    v_detail := array_append(
      v_detail,
      format('questSteps=%s', v_progress -> 'questSteps' -> 'pair-flaky-test')
    );

    perform public.report_to_paul();
    select s.paul_reported_at into v_first_reported
    from public.player_quest_state s where s.player_id = fixture;
    perform pg_sleep(0.01);
    perform public.report_to_paul();
    v_names := array_append(v_names, 'report_to_paul_keeps_first_time');
    v_pass := array_append(
      v_pass,
      (select s.paul_reported_at = v_first_reported
       from public.player_quest_state s where s.player_id = fixture)
    );
    v_detail := array_append(v_detail, 'second report_to_paul left the time unchanged');

    select p.tokens into v_before from public.players p where p.id = fixture;
    v_result := public.complete_quest('pair-flaky-test');
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'pays_150_once_no_badge');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 150, 'balance', v_before + 150, 'alreadyCompleted', false,
        'badgesEarned', '[]'::jsonb
      )
        and v_tokens = v_before + 150
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    v_second := public.complete_quest('pair-flaky-test');
    v_names := array_append(v_names, 'second_complete_quest_call_pays_nothing');
    v_pass := array_append(
      v_pass,
      v_second = jsonb_build_object(
        'tokensAwarded', 0, 'balance', v_tokens, 'alreadyCompleted', true,
        'badgesEarned', '[]'::jsonb
      )
    );
    v_detail := array_append(v_detail, format('result=%s', v_second));

    -----------------------------------------------------------------------
    -- Player B: the three mark_* functions are scoped to the caller.
    -----------------------------------------------------------------------
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_b_id, 'role', 'authenticated')::text,
      true
    );

    perform public.mark_paul_talked();
    perform public.mark_ci_board_checked();
    perform public.mark_paired();

    -- Read both rows as postgres (RLS would otherwise hide the fixture's own
    -- row from B's session).
    perform set_config('role', 'postgres', true);
    v_names := array_append(v_names, 'marks_are_scoped_to_the_caller');
    v_pass := array_append(
      v_pass,
      (select s.paul_talked_at is not null and s.ci_board_checked_at is not null
              and s.paired_at is not null
       from public.player_quest_state s where s.player_id = v_b_id)
        and (select s2.paul_talked_at from public.player_quest_state s2
             where s2.player_id = fixture) = v_first_talk
        and (select s3.ci_board_checked_at from public.player_quest_state s3
             where s3.player_id = fixture) = v_first_ci
        and (select s4.paired_at from public.player_quest_state s4
             where s4.player_id = fixture) = v_first_paired
    );
    v_detail := array_append(
      v_detail,
      'B''s own flags were set; the fixture''s own (earlier) flags are unchanged by B''s calls'
    );
    perform set_config('role', 'authenticated', true);

    -----------------------------------------------------------------------
    -- As anon (no sub claim).
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_state := null;
    begin
      perform public.mark_paul_talked();
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_mark_paul_talked');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.mark_ci_board_checked();
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_mark_ci_board_checked');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.mark_paired();
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_mark_paired');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.report_to_paul();
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_report_to_paul');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.quest_steps__pair_flaky_test(fixture);
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_quest_steps__pair_flaky_test');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    -----------------------------------------------------------------------
    -- Function definitions and grants, as postgres.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    v_names := array_append(v_names, 'functions_security_definer_search_path_locked');
    v_pass := array_append(
      v_pass,
      (select count(*) = 5
         and bool_and(p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in (
           'mark_paul_talked', 'mark_ci_board_checked', 'mark_paired', 'report_to_paul',
           'quest_steps__pair_flaky_test'
         ))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for all five');

    v_names := array_append(v_names, 'client_rpcs_executable_by_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.mark_paul_talked()', 'execute')
        and has_function_privilege('authenticated', 'public.mark_ci_board_checked()', 'execute')
        and has_function_privilege('authenticated', 'public.mark_paired()', 'execute')
        and has_function_privilege('authenticated', 'public.report_to_paul()', 'execute')
        and not has_function_privilege('anon', 'public.mark_paul_talked()', 'execute')
        and not has_function_privilege('anon', 'public.mark_ci_board_checked()', 'execute')
        and not has_function_privilege('anon', 'public.mark_paired()', 'execute')
        and not has_function_privilege('anon', 'public.report_to_paul()', 'execute')
        and not has_function_privilege(
          'authenticated', 'public.quest_steps__pair_flaky_test(uuid)', 'execute'
        )
        and not has_function_privilege(
          'anon', 'public.quest_steps__pair_flaky_test(uuid)', 'execute'
        )
    );
    v_detail := array_append(
      v_detail,
      'has_function_privilege checked for both roles, all five functions'
    );

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_quest_pair_flaky_test_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_quest_pair_flaky_test_rollback' then
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

select * from pg_temp.proof_quest_pair_flaky_test('00000000-0000-0000-0000-00000000f1f0'::uuid);
