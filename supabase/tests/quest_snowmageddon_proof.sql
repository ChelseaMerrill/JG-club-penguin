-- "Snowmageddon: hit 5 penguins today" Quest proof (#154), against the #9 H1
-- fixture Player, in 46_quests_proof.sql / quest_registry_proof.sql's style.
-- Covers 20261012000000_quest_snowmageddon.sql.
--
-- What this proves. As postgres: public.quests holds ('snowmageddon', 75)
-- with its quest_steps__snowmageddon(uuid) function registered, and the
-- 'snowmageddon' Badge is available. As the fixture signed in (role
-- authenticated): record_snowball_hit adds nothing for a self-hit, an
-- unknown target id, a target with no named Penguin, a repeat target already
-- counted today or a reused throw id; a valid hit on a real, named target
-- counts once and quest_steps__snowmageddon's hit-N steps rise with the
-- day's distinct-target count; complete_quest('snowmageddon') refuses with
-- quest_incomplete under 5 today; backdating every recorded hit to
-- "yesterday" (as postgres, the same way the pitch/coffee/stair proofs
-- control time) resets today's count to 0, and one more hit today -- on top
-- of four backdated ones -- still leaves the Quest incomplete; five distinct
-- targets in one Eastern day then completes it, paying 75 Tokens plus the
-- Badge's +50 (through the player_quest_completions trigger, not
-- complete_quest's own badgesEarned, which stays [] per the registry's R5) --
-- each exactly once, a second complete_quest call returns alreadyCompleted,
-- and quest_steps__snowmageddon then reads every step true forever,
-- regardless of the day. A second Player (D) hitting the fixture never
-- changes the fixture's own thrown-hit count. As anon: record_snowball_hit
-- and quest_steps__snowmageddon are denied (42501); quest_steps__snowmageddon
-- is denied to the fixture too (internal only, like every other steps
-- function). Also: every function here is security definer with
-- search_path = '' and one overload each, and record_snowball_hit is
-- executable by authenticated only (never anon), while snowball_day,
-- quest_steps__snowmageddon and the Badge trigger function are executable by
-- neither.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside
-- pg_temp.proof_quest_snowmageddon(), which ends by raising and catching a
-- sentinel exception, rolling back every write the function made (the
-- fixture's own snowball_hits/Tokens/Badge, every throwaway target Player and
-- Player D, and the 'snowmageddon' completion row). It prints only booleans,
-- counts and Token amounts -- no Player's name, id or email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result: every
-- row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_quest_snowmageddon(fixture uuid)
returns table (check_name text, pass boolean, detail text)
language plpgsql
as $$
declare
  v_names text[] := array[]::text[];
  v_pass boolean[] := array[]::boolean[];
  v_detail text[] := array[]::text[];
  v_targets uuid[] := array[]::uuid[];
  v_unnamed uuid;
  v_d_id uuid;
  v_new uuid;
  v_count int;
  v_result jsonb;
  v_second jsonb;
  v_progress jsonb;
  v_steps jsonb;
  v_before int;
  v_after int;
  v_err text;
  v_state text;
  v_all boolean;
  v_total int;
  i int;
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: clean fixture state, seven named
    -- throwaway target Players, one unnamed one, and a second thrower (D).
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.snowball_hits where thrower_id = fixture;
    delete from public.player_quest_completions
      where player_id = fixture and quest_id = 'snowmageddon';
    delete from public.player_badges where player_id = fixture and badge_id = 'snowmageddon';
    update public.players set tokens = 1000 where id = fixture;

    for i in 1..7 loop
      insert into auth.users (id, email)
      values (gen_random_uuid(), format('snowmageddon-proof-target-%s@example.invalid', i))
      returning id into v_new;
      insert into public.players (id, tokens, profile_created_at, penguin_name)
      values (v_new, 1000, now(), format('Target %s', i))
      on conflict do nothing;
      v_targets := array_append(v_targets, v_new);
    end loop;

    insert into auth.users (id, email)
    values (gen_random_uuid(), 'snowmageddon-proof-unnamed@example.invalid')
    returning id into v_unnamed;
    insert into public.players (id, tokens) values (v_unnamed, 1000) on conflict do nothing;

    begin
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'snowmageddon-proof-d@example.invalid')
      returning id into v_d_id;
    exception when others then
      raise exception
        'precondition failed: could not create throwaway Player D in auth.users (sqlstate=%, sqlerrm=%)',
        sqlstate, sqlerrm;
    end;
    insert into public.players (id, tokens, profile_created_at, penguin_name)
    values (v_d_id, 1000, now(), 'Player D')
    on conflict do nothing;

    v_names := array_append(v_names, 'registry_seeds_snowmageddon_75_with_steps_function');
    v_pass := array_append(
      v_pass,
      (select q.reward_tokens = 75 from public.quests q where q.id = 'snowmageddon')
        and to_regprocedure('public.quest_steps__snowmageddon(uuid)') is not null
    );
    v_detail := array_append(
      v_detail,
      'public.quests snowmageddon reward_tokens = 75, steps function present'
    );

    v_names := array_append(v_names, 'snowmageddon_badge_available');
    v_pass := array_append(
      v_pass,
      (select b.available from public.badges b where b.id = 'snowmageddon') is true
    );
    v_detail := array_append(v_detail, 'public.badges snowmageddon.available = true');

    -----------------------------------------------------------------------
    -- As the fixture (signed in).
    -----------------------------------------------------------------------
    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );

    -- Self-hit: nothing recorded.
    v_result := public.record_snowball_hit(fixture, 'self-throw');
    v_names := array_append(v_names, 'self_hit_adds_nothing');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object('counted', false, 'today', 0)
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -- Unknown target id: nothing recorded.
    v_result := public.record_snowball_hit(gen_random_uuid(), 'unknown-target-throw');
    v_names := array_append(v_names, 'unknown_target_adds_nothing');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object('counted', false, 'today', 0)
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -- A real Player with no named Penguin: nothing recorded.
    v_result := public.record_snowball_hit(v_unnamed, 'unnamed-throw');
    v_names := array_append(v_names, 'unnamed_penguin_target_adds_nothing');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object('counted', false, 'today', 0)
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -- A valid first hit counts once.
    v_result := public.record_snowball_hit(v_targets[1], 'th-1');
    v_names := array_append(v_names, 'first_valid_hit_counts');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object('counted', true, 'today', 1)
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -- quest_steps__snowmageddon is internal only (R2): read through the
    -- public quest_progress() RPC, as #140's own proof does.
    v_progress := public.quest_progress();
    v_steps := v_progress -> 'questSteps' -> 'snowmageddon';
    v_names := array_append(v_names, 'steps_report_one_of_five_after_first_hit');
    v_pass := array_append(
      v_pass,
      v_steps = jsonb_build_object(
        'hit-1', true, 'hit-2', false, 'hit-3', false, 'hit-4', false, 'hit-5', false
      )
    );
    v_detail := array_append(v_detail, format('questSteps=%s', v_steps));

    -- A repeat hit on the same target (fresh throw id) adds nothing.
    v_result := public.record_snowball_hit(v_targets[1], 'th-1-repeat');
    v_names := array_append(v_names, 'repeat_target_adds_nothing');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object('counted', false, 'today', 1)
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -- A reused throw id against a different target adds nothing.
    v_result := public.record_snowball_hit(v_targets[2], 'th-1');
    v_names := array_append(v_names, 'reused_throw_id_adds_nothing');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object('counted', false, 'today', 1)
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -- Three more distinct, valid hits: today reaches 4.
    perform public.record_snowball_hit(v_targets[2], 'th-2');
    perform public.record_snowball_hit(v_targets[3], 'th-3');
    v_result := public.record_snowball_hit(v_targets[4], 'th-4');
    v_names := array_append(v_names, 'fourth_distinct_hit_reaches_four_today');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object('counted', true, 'today', 4)
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -- quest_steps__snowmageddon is internal only (R2): read through the
    -- public quest_progress() RPC, as #140's own proof does.
    v_progress := public.quest_progress();
    v_steps := v_progress -> 'questSteps' -> 'snowmageddon';
    v_names := array_append(v_names, 'steps_report_four_of_five');
    v_pass := array_append(
      v_pass,
      v_steps = jsonb_build_object(
        'hit-1', true, 'hit-2', true, 'hit-3', true, 'hit-4', true, 'hit-5', false
      )
    );
    v_detail := array_append(v_detail, format('questSteps=%s', v_steps));

    v_err := null;
    begin
      perform public.complete_quest('snowmageddon');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'complete_quest_refuses_under_five_today');
    v_pass := array_append(v_pass, v_err is not distinct from 'quest_incomplete');
    v_detail := array_append(v_detail, format('error=%s (expected quest_incomplete)', v_err));

    -----------------------------------------------------------------------
    -- Cross-day isolation, as postgres: backdate every recorded hit to
    -- "yesterday" (Eastern), the same technique the pitch/coffee/stair
    -- proofs use to control time, relative to the server's own now().
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);
    update public.snowball_hits
    set day = public.snowball_day(now()) - 1
    where thrower_id = fixture;
    perform set_config('role', 'authenticated', true);

    -- quest_steps__snowmageddon is internal only (R2): read through the
    -- public quest_progress() RPC, as #140's own proof does.
    v_progress := public.quest_progress();
    v_steps := v_progress -> 'questSteps' -> 'snowmageddon';
    v_names := array_append(v_names, 'backdated_hits_no_longer_count_today');
    v_pass := array_append(
      v_pass,
      v_steps = jsonb_build_object(
        'hit-1', false, 'hit-2', false, 'hit-3', false, 'hit-4', false, 'hit-5', false
      )
    );
    v_detail := array_append(v_detail, format('questSteps=%s', v_steps));

    -- One hit today, on top of four backdated ones, still leaves the Quest
    -- incomplete (today's own distinct count is 1, not 5).
    v_result := public.record_snowball_hit(v_targets[5], 'th-5');
    v_names := array_append(
      v_names,
      'four_hits_yesterday_plus_one_today_does_not_complete'
    );
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object('counted', true, 'today', 1)
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    v_err := null;
    begin
      perform public.complete_quest('snowmageddon');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(
      v_names,
      'complete_quest_still_refuses_with_one_of_five_today'
    );
    v_pass := array_append(v_pass, v_err is not distinct from 'quest_incomplete');
    v_detail := array_append(v_detail, format('error=%s (expected quest_incomplete)', v_err));

    -----------------------------------------------------------------------
    -- Five distinct targets today completes the Quest.
    -----------------------------------------------------------------------
    perform public.record_snowball_hit(v_targets[2], 'th-2-today');
    perform public.record_snowball_hit(v_targets[3], 'th-3-today');
    perform public.record_snowball_hit(v_targets[4], 'th-4-today');
    v_result := public.record_snowball_hit(v_targets[6], 'th-6-today');
    v_names := array_append(v_names, 'fifth_distinct_target_today_reaches_five');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object('counted', true, 'today', 5)
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -- quest_steps__snowmageddon is internal only (R2): read through the
    -- public quest_progress() RPC, as #140's own proof does.
    v_progress := public.quest_progress();
    v_steps := v_progress -> 'questSteps' -> 'snowmageddon';
    v_names := array_append(v_names, 'steps_report_five_of_five');
    v_pass := array_append(
      v_pass,
      v_steps = jsonb_build_object(
        'hit-1', true, 'hit-2', true, 'hit-3', true, 'hit-4', true, 'hit-5', true
      )
    );
    v_detail := array_append(v_detail, format('questSteps=%s', v_steps));

    select p.tokens into v_before from public.players p where p.id = fixture;
    v_result := public.complete_quest('snowmageddon');
    select p.tokens into v_after from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'pays_75_tokens_no_badge_in_result');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 75, 'balance', v_before + 75, 'alreadyCompleted', false,
        'badgesEarned', '[]'::jsonb
      )
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    v_names := array_append(v_names, 'badge_trigger_pays_the_extra_50');
    v_pass := array_append(
      v_pass,
      v_after = v_before + 125
        and exists (
          select 1 from public.player_badges b
          where b.player_id = fixture and b.badge_id = 'snowmageddon'
        )
    );
    v_detail := array_append(
      v_detail,
      format('tokens before=%s after=%s (expected +125); player_badges holds snowmageddon', v_before, v_after)
    );

    v_second := public.complete_quest('snowmageddon');
    v_names := array_append(v_names, 'second_complete_quest_call_pays_nothing');
    v_pass := array_append(
      v_pass,
      v_second = jsonb_build_object(
        'tokensAwarded', 0, 'balance', v_after, 'alreadyCompleted', true,
        'badgesEarned', '[]'::jsonb
      )
    );
    v_detail := array_append(v_detail, format('result=%s', v_second));

    -----------------------------------------------------------------------
    -- Player D: hitting the fixture never changes the fixture's own
    -- thrown-hit count (scoping, #140's "marks are scoped to the caller"
    -- precedent, applied to the thrower side here).
    -----------------------------------------------------------------------
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_d_id, 'role', 'authenticated')::text,
      true
    );
    perform public.record_snowball_hit(fixture, 'th-d-hits-fixture');

    perform set_config('role', 'postgres', true);
    select count(distinct target_id) into v_count
    from public.snowball_hits
    where thrower_id = fixture;
    v_names := array_append(v_names, 'player_d_hitting_fixture_leaves_fixtures_own_count_alone');
    -- The fixture threw at 6 distinct targets in total across this proof
    -- (v_targets[1..4,5,6]); D throwing at the fixture is a row with D as
    -- thrower, never counted as one of the fixture's own thrown hits.
    v_pass := array_append(v_pass, v_count = 6);
    v_detail := array_append(v_detail, format('fixture''s own distinct thrown-at targets = %s (expected 6)', v_count));
    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );

    -- Hits aren't recorded once the Quest is complete.
    v_result := public.record_snowball_hit(v_targets[7], 'th-7-after-complete');
    v_names := array_append(v_names, 'no_hits_recorded_once_complete');
    v_pass := array_append(v_pass, (v_result ->> 'counted')::boolean is false);
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -- Steps read true forever, regardless of today's actual count: even with
    -- every recorded hit gone (a stronger proof than another backdate, which
    -- would collide one target's "yesterday" and "today" rows onto the same
    -- day), quest_steps__snowmageddon still reads every step true.
    perform set_config('role', 'postgres', true);
    delete from public.snowball_hits where thrower_id in (fixture, v_d_id);
    perform set_config('role', 'authenticated', true);
    -- quest_steps__snowmageddon is internal only (R2): read through the
    -- public quest_progress() RPC, as #140's own proof does.
    v_progress := public.quest_progress();
    v_steps := v_progress -> 'questSteps' -> 'snowmageddon';
    v_names := array_append(v_names, 'steps_stay_true_forever_once_completed');
    v_pass := array_append(
      v_pass,
      v_steps = jsonb_build_object(
        'hit-1', true, 'hit-2', true, 'hit-3', true, 'hit-4', true, 'hit-5', true
      )
    );
    v_detail := array_append(v_detail, format('questSteps=%s', v_steps));

    -----------------------------------------------------------------------
    -- As the fixture (signed in): quest_steps__snowmageddon stays internal,
    -- like every other steps function (R2).
    -----------------------------------------------------------------------
    v_state := null;
    begin
      perform public.quest_steps__snowmageddon(fixture);
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'keeps_quest_steps__snowmageddon_closed_to_a_signed_in_player');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    -----------------------------------------------------------------------
    -- As anon (no sub claim).
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_state := null;
    begin
      perform public.record_snowball_hit(fixture, 'anon-throw');
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_record_snowball_hit');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.quest_steps__snowmageddon(fixture);
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_quest_steps__snowmageddon');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    -----------------------------------------------------------------------
    -- Function definitions and grants, as postgres.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    v_names := array_append(v_names, 'functions_security_definer_search_path_locked');
    v_pass := array_append(
      v_pass,
      (select count(*) = 4
         and bool_and(p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in (
           'snowball_day', 'record_snowball_hit', 'quest_steps__snowmageddon',
           'award_snowmageddon_badge'
         ))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for all four');

    v_names := array_append(v_names, 'record_snowball_hit_executable_by_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.record_snowball_hit(uuid, text)', 'execute')
        and not has_function_privilege('anon', 'public.record_snowball_hit(uuid, text)', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for record_snowball_hit');

    v_names := array_append(v_names, 'internal_functions_executable_by_neither_role');
    v_pass := array_append(
      v_pass,
      not has_function_privilege('authenticated', 'public.snowball_day(timestamptz)', 'execute')
        and not has_function_privilege('anon', 'public.snowball_day(timestamptz)', 'execute')
        and not has_function_privilege(
          'authenticated', 'public.quest_steps__snowmageddon(uuid)', 'execute'
        )
        and not has_function_privilege('anon', 'public.quest_steps__snowmageddon(uuid)', 'execute')
        and not has_function_privilege('authenticated', 'public.award_snowmageddon_badge()', 'execute')
        and not has_function_privilege('anon', 'public.award_snowmageddon_badge()', 'execute')
    );
    v_detail := array_append(
      v_detail,
      'has_function_privilege checked for snowball_day, quest_steps__snowmageddon and the Badge trigger function'
    );

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_quest_snowmageddon_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_quest_snowmageddon_rollback' then
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

select * from pg_temp.proof_quest_snowmageddon('00000000-0000-0000-0000-00000000f1f0'::uuid);
