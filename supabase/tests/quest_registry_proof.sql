-- Quest registry proof (shared foundation for #140, #141 and #143), against
-- the #9 H1 fixture Player, in 46_quests_proof.sql's style. Covers
-- 20261006000000_quest_registry.sql's decisions R1-R8.
--
-- What this proves. As postgres: public.quests holds ('main', 150); every
-- public.quests row has its public.quest_steps__<id>(uuid) function; no
-- quest_steps__* function, nor quest_steps_for, is executable by anon or
-- authenticated; public.quests is closed to both. As the fixture signed in
-- (role authenticated): a quest_steps__ function and public.quests are
-- denied (42501); complete_quest refuses a null, malformed or unlisted id
-- with unknown_quest and the main Quest with quest_incomplete while a step is
-- unmet; quest_progress() reports questSteps.main with exactly the saved
-- state; once all five steps are met complete_quest('main') still pays 150
-- once plus Ship It's +50, and a second call pays nothing. Then a test-only
-- Quest ('proof-extra', 40 Tokens) is added as a row plus a
-- quest_steps__proof_extra function, with no change to complete_quest: it is
-- refused while one of its steps is false, paid its own 40 (and no Ship It)
-- once both are true, reported in questSteps and completedQuests, and paid
-- only once. A Quest with an empty steps object, or with no steps function,
-- is refused with quest_incomplete and doesn't break quest_progress. As
-- anon: complete_quest, quest_progress and quest_steps__main are denied
-- (42501). Also: the four functions are security definer with
-- search_path = '' and one overload each, and complete_quest's body is
-- unchanged by adding a Quest.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside pg_temp.proof_quest_registry(),
-- which ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the fixture's rounds, purchase, Tokens, Badge,
-- Quest rows, and the test-only Quests and their functions). It prints only
-- booleans, counts and Token amounts -- no Player's name, id or email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_quest_registry(fixture uuid)
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
  v_progress jsonb;
  v_tokens int;
  v_before int;
  v_src_before text;
  -- Every registered Quest id, read as postgres (the table is closed to clients).
  v_quest_ids text[];
  v_bad text[];
  v_all boolean;
  v_total int;
  i int;
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions and registry shape, as postgres. The fixture has a
    -- finished Penguin (main step 1), 1000 Tokens, and no Quest rows,
    -- rounds, Furniture or Ship It, so main steps 2-5 start unmet.
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
    delete from public.player_badges where player_id = fixture and badge_id = 'ship-it';
    update public.players
    set penguin_name = 'PROOF FIXTURE', profile_created_at = now(), tokens = 1000
    where id = fixture;

    v_names := array_append(v_names, 'registry_seeds_main_150');
    v_pass := array_append(
      v_pass,
      (select q.reward_tokens = 150 from public.quests q where q.id = 'main')
    );
    v_detail := array_append(v_detail, 'public.quests main reward_tokens = 150');

    -- R2: every registered Quest (including any later one) has its function.
    select array_agg(q.id order by q.id) into v_bad
    from public.quests q
    where to_regprocedure(
      format('public.%I(uuid)', 'quest_steps__' || replace(q.id, '-', '_'))
    ) is null;
    v_names := array_append(v_names, 'every_quest_has_a_steps_function');
    v_pass := array_append(v_pass, v_bad is null);
    v_detail := array_append(v_detail, format('quests without a steps function=%s', v_bad));

    -- R2/R4: no steps function (including any later one) is client-callable.
    select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) into v_bad
    from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'quest\_steps\_\_%' or p.proname = 'quest_steps_for')
      and (has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('anon', p.oid, 'execute'));
    v_names := array_append(v_names, 'steps_functions_not_executable_by_clients');
    v_pass := array_append(
      v_pass,
      v_bad is null
        and to_regprocedure('public.quest_steps__main(uuid)') is not null
        and to_regprocedure('public.quest_steps_for(uuid,text)') is not null
    );
    v_detail := array_append(v_detail, format('client-executable steps functions=%s', v_bad));

    v_names := array_append(v_names, 'quests_table_closed_to_clients');
    v_pass := array_append(
      v_pass,
      not has_table_privilege('authenticated', 'public.quests', 'select')
        and not has_table_privilege('authenticated', 'public.quests', 'insert')
        and not has_table_privilege('authenticated', 'public.quests', 'update')
        and not has_table_privilege('anon', 'public.quests', 'select')
        and (select c.relrowsecurity from pg_class c where c.oid = 'public.quests'::regclass)
    );
    v_detail := array_append(v_detail, 'has_table_privilege and relrowsecurity checked');

    select p.prosrc into v_src_before
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'complete_quest';

    select array_agg(q.id order by q.id) into v_quest_ids from public.quests q;

    -----------------------------------------------------------------------
    -- As the fixture (signed in): the main Quest.
    -----------------------------------------------------------------------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );

    v_state := null;
    begin
      perform public.quest_steps__main(fixture);
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'authenticated_denied_quest_steps__main');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.quest_steps_for(fixture, 'main');
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'authenticated_denied_quest_steps_for');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      select count(*) into v_count from public.quests;
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'authenticated_denied_quests_table');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    -- unknown_quest: unlisted, malformed (uppercase, punctuation) and null.
    v_bad := array[]::text[];
    declare
      v_id text;
    begin
      foreach v_id in array array['hexle', 'Main', 'main;', 'quest_steps__main', ''] loop
        v_err := null;
        begin
          perform public.complete_quest(v_id);
        exception when others then
          v_err := sqlerrm;
        end;
        if v_err is distinct from 'unknown_quest' then
          v_bad := array_append(v_bad, format('%s->%s', v_id, v_err));
        end if;
      end loop;
    end;
    v_err := null;
    begin
      perform public.complete_quest(null);
    exception when others then
      v_err := sqlerrm;
    end;
    if v_err is distinct from 'unknown_quest' then
      v_bad := array_append(v_bad, format('null->%s', v_err));
    end if;
    v_names := array_append(v_names, 'refuses_unknown_and_malformed_quest_ids');
    v_pass := array_append(v_pass, cardinality(v_bad) = 0);
    v_detail := array_append(v_detail, format('unexpected=%s', v_bad));

    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'quest_progress_reports_main_steps_before');
    v_pass := array_append(
      v_pass,
      v_progress -> 'questSteps' -> 'main' = jsonb_build_object(
        'create-penguin', true,
        'visit-dev-pit', false,
        'finish-bug-squash', false,
        'finish-pancake-flip', false,
        'buy-igloo-gear', false
      )
    );
    v_detail := array_append(v_detail, format('questSteps=%s', v_progress -> 'questSteps'));

    v_err := null;
    begin
      perform public.complete_quest('main');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'main_refuses_while_steps_unmet');
    v_pass := array_append(v_pass, v_err is not distinct from 'quest_incomplete');
    v_detail := array_append(v_detail, format('error=%s (expected quest_incomplete)', v_err));

    perform public.record_round('pancake-flip', 0, '{}'::jsonb);
    perform public.mark_dev_pit_visited();
    perform public.record_round('bug-squash', 0, '{}'::jsonb);
    perform public.purchase_item('beanbag');

    v_result := public.complete_quest('main');
    v_names := array_append(v_names, 'main_pays_150_plus_ship_it');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 150, 'balance', 1150, 'alreadyCompleted', false,
        'badgesEarned', jsonb_build_array('ship-it')
      )
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    v_second := public.complete_quest('main');
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'main_second_call_pays_nothing');
    v_pass := array_append(
      v_pass,
      v_second = jsonb_build_object(
        'tokensAwarded', 0, 'balance', 1150, 'alreadyCompleted', true,
        'badgesEarned', '[]'::jsonb
      )
        and v_tokens = 1150
    );
    v_detail := array_append(v_detail, format('result=%s tokens=%s', v_second, v_tokens));

    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'quest_progress_keeps_every_key_and_adds_quest_steps');
    v_pass := array_append(
      v_pass,
      v_progress - 'questSteps' = jsonb_build_object(
        'devPitVisited', true,
        'roundsFinished', jsonb_build_array('bug-squash', 'pancake-flip'),
        'completedQuests', jsonb_build_array('main'),
        'matchWins', '{}'::jsonb
      )
        and v_progress -> 'questSteps' -> 'main' = jsonb_build_object(
          'create-penguin', true,
          'visit-dev-pit', true,
          'finish-bug-squash', true,
          'finish-pancake-flip', true,
          'buy-igloo-gear', true
        )
        -- One questSteps entry per registered Quest, so a later Quest's own
        -- migration (#140, #141, #143) keeps this check passing.
        and (select array_agg(k order by k) from jsonb_object_keys(v_progress -> 'questSteps') k)
          = v_quest_ids
    );
    v_detail := array_append(v_detail, format('quest_progress=%s', v_progress));

    -----------------------------------------------------------------------
    -- A test-only Quest, added as postgres the way a later migration adds
    -- one (a row plus its steps function), without touching complete_quest.
    -- Its step-b reads a setting this proof flips, so it starts false.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);
    perform set_config('proof.extra_met', 'off', true);

    insert into public.quests (id, reward_tokens) values ('proof-extra', 40);
    create function public.quest_steps__proof_extra(p_player uuid)
    returns jsonb
    language sql
    stable
    security definer
    set search_path = ''
    as $f$
      select jsonb_build_object(
        'step-a', true,
        'step-b', coalesce(current_setting('proof.extra_met', true), '') = 'on'
      )
    $f$;
    revoke all on function public.quest_steps__proof_extra(uuid) from public, anon, authenticated;

    -- A Quest whose steps object is empty, and one with no function at all.
    insert into public.quests (id, reward_tokens) values ('proof-empty', 10), ('proof-missing', 10);
    create function public.quest_steps__proof_empty(p_player uuid)
    returns jsonb
    language sql
    stable
    security definer
    set search_path = ''
    as $f$ select '{}'::jsonb $f$;
    revoke all on function public.quest_steps__proof_empty(uuid) from public, anon, authenticated;

    v_names := array_append(v_names, 'complete_quest_unchanged_by_adding_quests');
    v_pass := array_append(
      v_pass,
      (select p.prosrc = v_src_before
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'complete_quest')
    );
    v_detail := array_append(v_detail, 'pg_proc.prosrc compared before and after');

    perform set_config('role', 'authenticated', true);

    select p.tokens into v_before from public.players p where p.id = fixture;
    v_err := null;
    begin
      perform public.complete_quest('proof-extra');
    exception when others then
      v_err := sqlerrm;
    end;
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'extra_quest_refused_while_a_step_is_false');
    v_pass := array_append(
      v_pass,
      v_err is not distinct from 'quest_incomplete' and v_tokens = v_before
    );
    v_detail := array_append(
      v_detail,
      format('error=%s tokens delta=%s (expected quest_incomplete, 0)', v_err, v_tokens - v_before)
    );

    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'quest_progress_reports_every_registered_quest');
    v_pass := array_append(
      v_pass,
      v_progress -> 'questSteps' -> 'proof-extra'
          = jsonb_build_object('step-a', true, 'step-b', false)
        and v_progress -> 'questSteps' -> 'proof-empty' = '{}'::jsonb
        and v_progress -> 'questSteps' -> 'proof-missing' = '{}'::jsonb
        and (v_progress -> 'questSteps' -> 'main' ->> 'buy-igloo-gear')::boolean
    );
    v_detail := array_append(v_detail, format('questSteps=%s', v_progress -> 'questSteps'));

    v_bad := array[]::text[];
    declare
      v_id text;
    begin
      foreach v_id in array array['proof-empty', 'proof-missing'] loop
        v_err := null;
        begin
          perform public.complete_quest(v_id);
        exception when others then
          v_err := sqlerrm;
        end;
        if v_err is distinct from 'quest_incomplete' then
          v_bad := array_append(v_bad, format('%s->%s', v_id, v_err));
        end if;
      end loop;
    end;
    v_names := array_append(v_names, 'quest_with_no_steps_refused');
    v_pass := array_append(v_pass, cardinality(v_bad) = 0);
    v_detail := array_append(v_detail, format('unexpected=%s', v_bad));

    perform set_config('proof.extra_met', 'on', true);
    select p.tokens into v_before from public.players p where p.id = fixture;
    v_result := public.complete_quest('proof-extra');
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'extra_quest_paid_its_own_reward_without_ship_it');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 40, 'balance', v_before + 40, 'alreadyCompleted', false,
        'badgesEarned', '[]'::jsonb
      )
        and v_tokens = v_before + 40
    );
    v_detail := array_append(
      v_detail,
      format('result=%s delta=%s (expected 40)', v_result, v_tokens - v_before)
    );

    v_second := public.complete_quest('proof-extra');
    v_names := array_append(v_names, 'extra_quest_second_call_pays_nothing');
    v_pass := array_append(
      v_pass,
      v_second = jsonb_build_object(
        'tokensAwarded', 0, 'balance', v_tokens, 'alreadyCompleted', true,
        'badgesEarned', '[]'::jsonb
      )
    );
    v_detail := array_append(v_detail, format('result=%s', v_second));

    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'extra_quest_reported_done');
    v_pass := array_append(
      v_pass,
      v_progress -> 'completedQuests' = jsonb_build_array('main', 'proof-extra')
        and v_progress -> 'questSteps' -> 'proof-extra'
          = jsonb_build_object('step-a', true, 'step-b', true)
        and (select count(*) = 2 from public.player_quest_completions c
             where c.player_id = fixture)
    );
    v_detail := array_append(v_detail, format('quest_progress=%s', v_progress));

    -----------------------------------------------------------------------
    -- As anon (no sub claim): every client-facing and internal function is
    -- denied.
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_bad := array[]::text[];
    v_state := null;
    begin
      perform public.complete_quest('main');
    exception when others then
      v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then
      v_bad := array_append(v_bad, format('complete_quest->%s', v_state));
    end if;
    v_state := null;
    begin
      perform public.quest_progress();
    exception when others then
      v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then
      v_bad := array_append(v_bad, format('quest_progress->%s', v_state));
    end if;
    v_state := null;
    begin
      perform public.quest_steps__main(fixture);
    exception when others then
      v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then
      v_bad := array_append(v_bad, format('quest_steps__main->%s', v_state));
    end if;
    v_names := array_append(v_names, 'anon_denied_every_function');
    v_pass := array_append(v_pass, cardinality(v_bad) = 0);
    v_detail := array_append(v_detail, format('unexpected=%s', v_bad));

    -----------------------------------------------------------------------
    -- Function definitions and grants, as postgres.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    v_names := array_append(v_names, 'one_overload_each_security_definer_search_path_locked');
    v_pass := array_append(
      v_pass,
      (select count(*) = 4
         and bool_and(p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('complete_quest', 'quest_progress', 'quest_steps__main', 'quest_steps_for'))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for all four');

    v_names := array_append(v_names, 'execute_granted_to_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.complete_quest(text)', 'execute')
        and has_function_privilege('authenticated', 'public.quest_progress()', 'execute')
        and not has_function_privilege('anon', 'public.complete_quest(text)', 'execute')
        and not has_function_privilege('anon', 'public.quest_progress()', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_quest_registry_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_quest_registry_rollback' then
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

select * from pg_temp.proof_quest_registry('00000000-0000-0000-0000-00000000f1f0'::uuid);
