-- Igloo Badge Quest proof (#143), against the #9 H1 fixture Player, in
-- 46_quests_proof.sql / quest_registry_proof.sql's style. Covers
-- 20261006010000_quest_igloo_badge.sql.
--
-- What this proves. As postgres: public.quests holds ('igloo-badge', 75)
-- with its quest_steps__igloo_badge(uuid) function registered. As the
-- fixture signed in (role authenticated): complete_quest('igloo-badge')
-- refuses with quest_incomplete until all three steps are met, and pays
-- nothing while refusing; mark_casey_talked() sets
-- player_quest_state.casey_talked_at and keeps the first time on a second
-- call; buying a non-award item (the Beanbag) never meets buy-jg-award,
-- buying one of the three JG awards does; placing an award in a floor slot
-- is rejected outright (wrong_placement, 23514 -- there is no way to "float"
-- it instead of hanging it), and placing it in a wall slot meets
-- hang-jg-award; complete_quest then pays 75 Tokens exactly once, with no
-- Badge (only 'main' awards Ship It), and a second call pays nothing. A
-- second Player (B) proves two more things: mark_casey_talked only ever
-- touches the caller's own row (B's own call never changes the fixture's
-- already-set flag), and a Player who already owned and had hung an award
-- before ever calling complete_quest is paid immediately -- the "earlier
-- play counts" rule (#46 Q1), since every step here is read from saved
-- data, not a session counter. As anon: mark_casey_talked and
-- quest_steps__igloo_badge are denied (42501). Also: both functions are
-- security definer with search_path = '' and one overload each, and
-- mark_casey_talked is executable by authenticated only (never anon).
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside
-- pg_temp.proof_quest_igloo_badge(), which ends by raising and catching a
-- sentinel exception, rolling back every write the function made (the
-- fixture's and Player B's items, slots, quest state and Tokens, every
-- 'igloo-badge' completion row, and Player B itself). It prints only
-- booleans, counts and Token amounts -- no Player's name, id or email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_quest_igloo_badge(fixture uuid)
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
  v_all boolean;
  v_total int;
  i int;
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: clean fixture state, 1000 Tokens, and a
    -- throwaway Player B.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.player_quest_completions
    where player_id = fixture and quest_id = 'igloo-badge';
    update public.player_quest_state set casey_talked_at = null where player_id = fixture;
    delete from public.igloo_slots where player_id = fixture;
    delete from public.player_items where player_id = fixture;
    update public.players set tokens = 1000 where id = fixture;

    v_names := array_append(v_names, 'registry_seeds_igloo_badge_75_with_steps_function');
    v_pass := array_append(
      v_pass,
      (select q.reward_tokens = 75 from public.quests q where q.id = 'igloo-badge')
        and to_regprocedure('public.quest_steps__igloo_badge(uuid)') is not null
    );
    v_detail := array_append(
      v_detail,
      'public.quests igloo-badge reward_tokens = 75, steps function present'
    );

    begin
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'igloo-badge-proof-b@example.invalid')
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
      perform public.complete_quest('igloo-badge');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'refuses_before_any_step');
    v_pass := array_append(v_pass, v_err is not distinct from 'quest_incomplete');
    v_detail := array_append(v_detail, format('error=%s (expected quest_incomplete)', v_err));

    perform public.mark_casey_talked();
    select s.casey_talked_at into v_first_talk
    from public.player_quest_state s where s.player_id = fixture;
    perform pg_sleep(0.01);
    perform public.mark_casey_talked();
    v_names := array_append(v_names, 'talk_keeps_first_time');
    v_pass := array_append(
      v_pass,
      (select s.casey_talked_at = v_first_talk
       from public.player_quest_state s where s.player_id = fixture)
    );
    v_detail := array_append(v_detail, 'second mark_casey_talked left the time unchanged');

    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'reports_talk_only_so_far');
    v_pass := array_append(
      v_pass,
      v_progress -> 'questSteps' -> 'igloo-badge' = jsonb_build_object(
        'talk-to-casey', true, 'buy-jg-award', false, 'hang-jg-award', false
      )
    );
    v_detail := array_append(
      v_detail,
      format('questSteps=%s', v_progress -> 'questSteps' -> 'igloo-badge')
    );

    perform public.purchase_item('beanbag');
    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'a_non_award_item_does_not_count');
    v_pass := array_append(
      v_pass,
      ((v_progress -> 'questSteps' -> 'igloo-badge' ->> 'buy-jg-award')::boolean) is false
    );
    v_detail := array_append(
      v_detail,
      format('questSteps=%s', v_progress -> 'questSteps' -> 'igloo-badge')
    );

    perform public.purchase_item('award-bptw');
    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'buying_a_jg_award_counts');
    v_pass := array_append(
      v_pass,
      ((v_progress -> 'questSteps' -> 'igloo-badge' ->> 'buy-jg-award')::boolean) is true
        and ((v_progress -> 'questSteps' -> 'igloo-badge' ->> 'hang-jg-award')::boolean) is false
    );
    v_detail := array_append(
      v_detail,
      format('questSteps=%s', v_progress -> 'questSteps' -> 'igloo-badge')
    );

    v_err := null;
    begin
      perform public.complete_quest('igloo-badge');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'refuses_while_not_yet_hung');
    v_pass := array_append(v_pass, v_err is not distinct from 'quest_incomplete');
    v_detail := array_append(v_detail, format('error=%s (expected quest_incomplete)', v_err));

    v_state := null;
    begin
      insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 1, 'award-bptw');
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'floor_slot_rejects_an_award_outright');
    v_pass := array_append(v_pass, v_state = '23514');
    v_detail := array_append(
      v_detail,
      format('sqlstate=%s (expected 23514 wrong_placement)', v_state)
    );

    insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 7, 'award-bptw');
    v_progress := public.quest_progress();
    v_names := array_append(v_names, 'hanging_on_a_wall_slot_counts');
    v_pass := array_append(
      v_pass,
      v_progress -> 'questSteps' -> 'igloo-badge' = jsonb_build_object(
        'talk-to-casey', true, 'buy-jg-award', true, 'hang-jg-award', true
      )
    );
    v_detail := array_append(
      v_detail,
      format('questSteps=%s', v_progress -> 'questSteps' -> 'igloo-badge')
    );

    select p.tokens into v_before from public.players p where p.id = fixture;
    v_result := public.complete_quest('igloo-badge');
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'pays_75_once_no_badge');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 75, 'balance', v_before + 75, 'alreadyCompleted', false,
        'badgesEarned', '[]'::jsonb
      )
        and v_tokens = v_before + 75
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    v_second := public.complete_quest('igloo-badge');
    v_names := array_append(v_names, 'second_call_pays_nothing');
    v_pass := array_append(
      v_pass,
      v_second = jsonb_build_object(
        'tokensAwarded', 0, 'balance', v_tokens, 'alreadyCompleted', true,
        'badgesEarned', '[]'::jsonb
      )
    );
    v_detail := array_append(v_detail, format('result=%s', v_second));

    -----------------------------------------------------------------------
    -- Player B: mark_casey_talked is scoped to the caller, then "earlier
    -- play counts" -- already owning and having hung an award before ever
    -- calling complete_quest.
    -----------------------------------------------------------------------
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_b_id, 'role', 'authenticated')::text,
      true
    );

    perform public.mark_casey_talked();

    -- Read both rows as postgres (RLS would otherwise hide the fixture's own
    -- row from B's session -- itself part of what this proves, but a plain
    -- `authenticated` read can't see both sides of the comparison at once).
    perform set_config('role', 'postgres', true);
    v_names := array_append(v_names, 'talk_is_scoped_to_the_caller');
    v_pass := array_append(
      v_pass,
      (select s.casey_talked_at is not null
       from public.player_quest_state s where s.player_id = v_b_id)
        and (select s2.casey_talked_at
             from public.player_quest_state s2 where s2.player_id = fixture) = v_first_talk
    );
    v_detail := array_append(
      v_detail,
      'B''s own flag was set; the fixture''s own (earlier) flag is unchanged by B''s call'
    );
    perform set_config('role', 'authenticated', true);

    perform set_config('role', 'postgres', true);
    insert into public.player_items (player_id, item_id) values (v_b_id, 'award-inc5000');
    insert into public.igloo_slots (player_id, slot, item_id) values (v_b_id, 8, 'award-inc5000');
    perform set_config('role', 'authenticated', true);

    v_result := public.complete_quest('igloo-badge');
    v_names := array_append(v_names, 'earlier_purchase_and_slot_are_credited_immediately');
    v_pass := array_append(
      v_pass,
      v_result ->> 'tokensAwarded' = '75' and v_result ->> 'alreadyCompleted' = 'false'
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -----------------------------------------------------------------------
    -- As anon (no sub claim).
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_state := null;
    begin
      perform public.mark_casey_talked();
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_mark_casey_talked');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.quest_steps__igloo_badge(fixture);
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_quest_steps__igloo_badge');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    -----------------------------------------------------------------------
    -- Function definitions and grants, as postgres.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    v_names := array_append(v_names, 'functions_security_definer_search_path_locked');
    v_pass := array_append(
      v_pass,
      (select count(*) = 2
         and bool_and(p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('mark_casey_talked', 'quest_steps__igloo_badge'))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for both');

    v_names := array_append(v_names, 'mark_casey_talked_executable_by_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.mark_casey_talked()', 'execute')
        and not has_function_privilege('anon', 'public.mark_casey_talked()', 'execute')
        and not has_function_privilege(
          'authenticated', 'public.quest_steps__igloo_badge(uuid)', 'execute'
        )
        and not has_function_privilege('anon', 'public.quest_steps__igloo_badge(uuid)', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles/both functions');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_quest_igloo_badge_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_quest_igloo_badge_rollback' then
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

select * from pg_temp.proof_quest_igloo_badge('00000000-0000-0000-0000-00000000f1f0'::uuid);
