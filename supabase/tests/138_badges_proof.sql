-- Badges proof for #138, against the #9 H1 fixture Player, in
-- 46_quests_proof.sql's style.
--
-- What this proves, as the fixture signed in (role authenticated): the 15-
-- Badge catalog is readable but not writable; a Player can't insert a Badge,
-- change their Tokens, or call any of the five internal award functions
-- (42501); check_session_badges() awards nothing before the Penguin is named,
-- then First Waddle and its +50 exactly once; record_round still returns its
-- #27 shape and pays a Minigame Badge's +50 once; placing the sixth
-- Furniture item through a direct igloo_slots write (the client's own path)
-- awards Interior Penguin and +50 once, and re-placing pays nothing again;
-- complete_quest('main') returns badgesEarned = ["ship-it"] with a balance
-- that includes the +50 and equals the stored balance, and a repeat returns
-- badgesEarned = []. As anon: the catalog, check_session_badges() and every
-- internal function are denied (42501). Also: every new function is security
-- definer with search_path = '' and one overload, EXECUTE is granted to
-- authenticated on check_session_badges only, the Interior Penguin trigger
-- exists, and player_badges has the foreign key instead of #27's check.
--
-- Night Owl is pre-held by the fixture before any check_session_badges()
-- call (D16), so no row depends on whether it is currently 02:00-05:00 ET.
-- Night Owl's own window is proved with fixed times in sql-badges.test.ts.
--
-- Slots follow the item's placement: the five floor-only items go in slots
-- 1-5, and the RGB Light Strip goes in slot 6 before #135 (no placement
-- column) or slot 7 once #135 makes it a wall item.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside pg_temp.proof_138(), which
-- ends by raising and catching a sentinel exception, rolling back every write
-- the function made. It prints only booleans, counts and Token amounts -- no
-- Player's name, id or email. It never asserts global counts, so live data
-- doesn't affect it.
--
-- Expected result: every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_138(fixture uuid)
returns table (check_name text, pass boolean, detail text)
language plpgsql
as $$
declare
  v_names text[] := array[]::text[];
  v_pass boolean[] := array[]::boolean[];
  v_detail text[] := array[]::text[];
  v_count int;
  v_state text;
  v_result jsonb;
  v_second jsonb;
  v_before int;
  v_tokens int;
  v_rgb_slot int;
  v_held boolean;
  v_fn text;
  v_all boolean;
  v_total int;
  i int;
  v_internal text[] := array[
    'public.award_badge(uuid,text)',
    'public.award_badge_if_available(uuid,text)',
    'public.evaluate_session_badges(uuid,timestamptz)',
    'public.is_night_owl_time(timestamptz)',
    'public.igloo_slots_award_interior_penguin()'
  ];
  v_internal_calls text[] := array[
    format('select public.award_badge(%L::uuid, %L)', fixture, 'ship-it'),
    format('select public.award_badge_if_available(%L::uuid, %L)', fixture, 'ship-it'),
    format('select public.evaluate_session_badges(%L::uuid, now())', fixture),
    'select public.is_night_owl_time(now())',
    'select public.igloo_slots_award_interior_penguin()'
  ];
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: the fixture starts with an unnamed
    -- Penguin, 1000 Tokens, only Night Owl held (D16), and no rounds,
    -- bests, Furniture, slots or Quest rows.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.player_badges where player_id = fixture;
    delete from public.player_quest_completions where player_id = fixture;
    delete from public.player_quest_state where player_id = fixture;
    delete from public.minigame_rounds where player_id = fixture;
    delete from public.minigame_bests where player_id = fixture;
    delete from public.igloo_slots where player_id = fixture;
    delete from public.player_items where player_id = fixture;
    update public.players
    set penguin_name = '', profile_created_at = null, tokens = 1000
    where id = fixture;
    perform public.award_badge(fixture, 'night-owl');
    update public.players set tokens = 1000 where id = fixture;

    -- RGB Light Strip's slot follows its placement (#135 makes it a wall item).
    select case when (to_jsonb(s) ->> 'placement') = 'wall' then 7 else 6 end
    into v_rgb_slot
    from public.shop_items s
    where s.id = 'rgb-light-strip';

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

    select count(*) into v_count from public.badges;
    v_names := array_append(v_names, 'catalog_readable_by_signed_in_player');
    v_pass := array_append(v_pass, v_count >= 15);
    v_detail := array_append(v_detail, format('badges rows visible=%s (expected >= 15)', v_count));

    v_state := null;
    begin
      insert into public.badges (id, name, how_to_earn, sort_order, available)
      values ('proof-badge', 'Proof', 'PROOF', 99, true);
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'no_insert_into_badges');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      update public.badges set available = true where id = 'hexle-parent';
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'no_update_of_badges_available');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      insert into public.player_badges (player_id, badge_id) values (fixture, 'ship-it');
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'no_direct_insert_into_player_badges');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      update public.players set tokens = 999999 where id = fixture;
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'no_direct_tokens_update');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    for i in 1..array_length(v_internal, 1) loop
      v_state := null;
      begin
        execute v_internal_calls[i];
      exception when others then
        v_state := sqlstate;
      end;
      v_names := array_append(v_names, format('authenticated_denied %s', v_internal[i]));
      v_pass := array_append(v_pass, v_state = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));
    end loop;

    -- Before the Penguin is named: no First Waddle, nothing paid.
    v_result := public.check_session_badges();
    v_names := array_append(v_names, 'session_check_awards_nothing_before_named');
    v_pass := array_append(
      v_pass,
      not (v_result -> 'badges') ? 'first-waddle' and (v_result ->> 'balance')::int = 1000
    );
    v_detail := array_append(v_detail, format('balance=%s first_waddle=%s',
      v_result ->> 'balance', (v_result -> 'badges') ? 'first-waddle'));

    perform set_config('role', 'postgres', true);
    update public.players set penguin_name = 'PROOF FIXTURE', profile_created_at = now()
    where id = fixture;
    perform set_config('role', 'authenticated', true);

    v_result := public.check_session_badges();
    v_second := public.check_session_badges();
    v_names := array_append(v_names, 'first_waddle_once_plus_50_once');
    v_pass := array_append(
      v_pass,
      (v_result -> 'badges') ? 'first-waddle'
        and (v_result ->> 'balance')::int = 1050
        and (v_second ->> 'balance')::int = 1050
    );
    v_detail := array_append(v_detail, format('first=%s second=%s (expected 1050 both)',
      v_result ->> 'balance', v_second ->> 'balance'));

    -- A Minigame Badge through record_round: same #27 shape, +50 once.
    v_result := public.record_round('bug-squash', 500, '{}'::jsonb);
    v_names := array_append(v_names, 'record_round_shape_and_badge_unchanged');
    v_pass := array_append(
      v_pass,
      v_result = jsonb_build_object(
        'tokensAwarded', 50, 'balance', 1150, 'newBest', true, 'badgeEarned', true
      )
    );
    v_detail := array_append(v_detail, format('result=%s', v_result));

    -- Interior Penguin through the client's own igloo_slots writes.
    perform public.purchase_item('beanbag');
    perform public.purchase_item('desk');
    perform public.purchase_item('speakers');
    perform public.purchase_item('dual-monitors');
    perform public.purchase_item('arcade-cabinet');
    perform public.purchase_item('rgb-light-strip');
    select p.tokens into v_before from public.players p where p.id = fixture;

    insert into public.igloo_slots (player_id, slot, item_id) values
      (fixture, 1, 'beanbag'), (fixture, 2, 'desk'), (fixture, 3, 'speakers'),
      (fixture, 4, 'dual-monitors'), (fixture, 5, 'arcade-cabinet');
    select exists (select 1 from public.player_badges b
                   where b.player_id = fixture and b.badge_id = 'interior-penguin')
    into v_held;
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'interior_penguin_not_at_five');
    v_pass := array_append(v_pass, not v_held and v_tokens = v_before);
    v_detail := array_append(v_detail, format('held=%s delta=%s', v_held, v_tokens - v_before));

    insert into public.igloo_slots (player_id, slot, item_id)
    values (fixture, v_rgb_slot, 'rgb-light-strip');
    select exists (select 1 from public.player_badges b
                   where b.player_id = fixture and b.badge_id = 'interior-penguin')
    into v_held;
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'interior_penguin_at_six_plus_50');
    v_pass := array_append(v_pass, v_held and v_tokens = v_before + 50);
    v_detail := array_append(v_detail, format('held=%s delta=%s (expected 50)', v_held, v_tokens - v_before));

    delete from public.igloo_slots where player_id = fixture and slot = 1;
    insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 1, 'beanbag');
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'interior_penguin_replace_pays_nothing');
    v_pass := array_append(v_pass, v_tokens = v_before + 50);
    v_detail := array_append(v_detail, format('delta=%s (expected 50)', v_tokens - v_before));

    -- Ship It through complete_quest('main').
    perform public.record_round('pancake-flip', 0, '{}'::jsonb);
    perform public.mark_dev_pit_visited();
    select p.tokens into v_before from public.players p where p.id = fixture;
    v_result := public.complete_quest('main');
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    v_names := array_append(v_names, 'ship_it_awarded_by_complete_quest');
    v_pass := array_append(
      v_pass,
      (v_result ->> 'tokensAwarded')::int = 150
        and (v_result ->> 'alreadyCompleted')::boolean = false
        and v_result -> 'badgesEarned' = jsonb_build_array('ship-it')
        and (v_result ->> 'balance')::int = v_before + 200
        and (v_result ->> 'balance')::int = v_tokens
    );
    v_detail := array_append(v_detail, format('result=%s delta=%s (expected 200)', v_result, v_tokens - v_before));

    v_second := public.complete_quest('main');
    v_names := array_append(v_names, 'repeat_complete_quest_badges_earned_empty');
    v_pass := array_append(
      v_pass,
      (v_second ->> 'alreadyCompleted')::boolean
        and v_second -> 'badgesEarned' = '[]'::jsonb
        and (v_second ->> 'balance')::int = v_tokens
    );
    v_detail := array_append(v_detail, format('result=%s', v_second));

    -----------------------------------------------------------------------
    -- As anon (no sub claim): the catalog and every function are denied.
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    v_state := null;
    begin
      select count(*) into v_count from public.badges;
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_badges_select');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform public.check_session_badges();
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_check_session_badges');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    for i in 1..array_length(v_internal, 1) loop
      v_state := null;
      begin
        execute v_internal_calls[i];
      exception when others then
        v_state := sqlstate;
      end;
      v_names := array_append(v_names, format('anon_denied %s', v_internal[i]));
      v_pass := array_append(v_pass, v_state = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));
    end loop;

    -----------------------------------------------------------------------
    -- Definitions and grants, as postgres.
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
         and p.proname in ('award_badge', 'award_badge_if_available', 'is_night_owl_time',
                           'evaluate_session_badges', 'check_session_badges',
                           'igloo_slots_award_interior_penguin'))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for all six');

    foreach v_fn in array v_internal loop
      v_names := array_append(v_names, format('no_client_execute %s', v_fn));
      v_pass := array_append(
        v_pass,
        not has_function_privilege('anon', v_fn, 'execute')
          and not has_function_privilege('authenticated', v_fn, 'execute')
      );
      v_detail := array_append(v_detail, 'has_function_privilege false for anon and authenticated');
    end loop;

    v_names := array_append(v_names, 'check_session_badges_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.check_session_badges()', 'execute')
        and not has_function_privilege('anon', 'public.check_session_badges()', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles');

    v_names := array_append(v_names, 'interior_penguin_trigger_present');
    v_pass := array_append(
      v_pass,
      exists (
        select 1 from pg_trigger t
        where t.tgrelid = 'public.igloo_slots'::regclass
          and t.tgname = 'igloo_slots_interior_penguin'
          and not t.tgisinternal
      )
    );
    v_detail := array_append(v_detail, 'pg_trigger checked on public.igloo_slots');

    v_names := array_append(v_names, 'player_badges_foreign_key_replaces_check');
    v_pass := array_append(
      v_pass,
      exists (select 1 from pg_constraint c
              where c.conname = 'player_badges_badge_id_fkey' and c.contype = 'f')
        and not exists (select 1 from pg_constraint c
                        where c.conname = 'player_badges_badge_id_check')
    );
    v_detail := array_append(v_detail, 'pg_constraint checked');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_138_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_138_rollback' then
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

select * from pg_temp.proof_138('00000000-0000-0000-0000-00000000f1f0'::uuid);
