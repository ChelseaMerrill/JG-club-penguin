-- Igloo placement proof for #135, against the #9 H1 fixture Player, in
-- 46_quests_proof.sql's style.
--
-- What this proves, as the fixture signed in (role authenticated): an item
-- hangs in a slot of its own placement (a wall item in 7-10, the Disco Ball
-- in 11) and moves between wall slots; the placement guard rejects every
-- mismatch with wrong_placement (23514): a floor item on a wall, a wall item
-- or an award on the floor, the Disco Ball on a wall; an unknown item id
-- still fails the ownership foreign key (23503, not_owned); an out-of-range
-- slot still fails igloo_slots_slot_check (23514, not wrong_placement);
-- another Player's slots stay invisible. As postgres: the catalog holds the
-- 14 Igloo Gear items with their placements, igloo_slot_placement matches
-- the client's IGLOO_SLOT_PLACEMENT for 1-11, no row is misplaced, the
-- guard trigger is present and enabled, and its function is security
-- definer with search_path = '' and not executable by clients.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside pg_temp.proof_135(), which
-- ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the fixture's Furniture and slots and the
-- throwaway Player B). It prints only booleans, counts and names of
-- checks -- no Player's name, id or email.
--
-- Expected result: every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_135(fixture uuid)
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
  v_text text;
  v_ok boolean;
  v_all boolean;
  v_total int;
  i int;
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: the fixture owns one floor item, three
    -- wall items (one an award) and the Disco Ball, with an empty Igloo. A
    -- throwaway Player B has one placed item, for the own-rows check.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.igloo_slots where player_id = fixture;
    delete from public.player_items where player_id = fixture;
    insert into public.player_items (player_id, item_id) values
      (fixture, 'beanbag'),
      (fixture, 'jg-pennant'),
      (fixture, 'rgb-light-strip'),
      (fixture, 'award-inc5000'),
      (fixture, 'disco-ball');

    begin
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'igloo-proof-b@example.invalid')
      returning id into v_b_id;
    exception when others then
      raise exception
        'precondition failed: could not create throwaway Player B in auth.users (sqlstate=%, sqlerrm=%)',
        sqlstate, sqlerrm;
    end;
    insert into public.players (id) values (v_b_id) on conflict do nothing;
    insert into public.player_items (player_id, item_id) values (v_b_id, 'jg-pennant');
    insert into public.igloo_slots (player_id, slot, item_id) values (v_b_id, 7, 'jg-pennant');

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
      insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 7, 'jg-pennant');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'wall_item_hangs_in_wall_slot');
    v_pass := array_append(v_pass, v_err is null);
    v_detail := array_append(v_detail, format('error=%s (expected none)', v_err));

    v_err := null;
    begin
      update public.igloo_slots set slot = 9 where player_id = fixture and slot = 7;
    exception when others then
      v_err := sqlerrm;
    end;
    select count(*) into v_count
    from public.igloo_slots where player_id = fixture and slot = 9 and item_id = 'jg-pennant';
    v_names := array_append(v_names, 'wall_item_moves_between_wall_slots');
    v_pass := array_append(v_pass, v_err is null and v_count = 1);
    v_detail := array_append(v_detail, format('error=%s in_slot_9=%s', v_err, v_count));

    v_err := null;
    begin
      insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 11, 'disco-ball');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'disco_ball_hangs_in_ceiling_slot');
    v_pass := array_append(v_pass, v_err is null);
    v_detail := array_append(v_detail, format('error=%s (expected none)', v_err));

    v_err := null;
    begin
      insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 8, 'award-inc5000');
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'award_hangs_in_wall_slot');
    v_pass := array_append(v_pass, v_err is null);
    v_detail := array_append(v_detail, format('error=%s (expected none)', v_err));

    -- Every mismatch is rejected by the guard: wrong_placement, 23514.
    v_state := null; v_err := null;
    begin
      insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 10, 'beanbag');
    exception when others then
      v_state := sqlstate; v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'floor_item_rejected_on_wall');
    v_pass := array_append(v_pass, v_state = '23514' and v_err = 'wrong_placement');
    v_detail := array_append(v_detail, format('sqlstate=%s error=%s', v_state, v_err));

    v_state := null; v_err := null;
    begin
      insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 11, 'beanbag');
    exception when others then
      v_state := sqlstate; v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'floor_item_rejected_on_ceiling');
    v_pass := array_append(v_pass, v_state = '23514' and v_err = 'wrong_placement');
    v_detail := array_append(v_detail, format('sqlstate=%s error=%s', v_state, v_err));

    v_state := null; v_err := null;
    begin
      insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 2, 'rgb-light-strip');
    exception when others then
      v_state := sqlstate; v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'rgb_light_strip_rejected_on_floor');
    v_pass := array_append(v_pass, v_state = '23514' and v_err = 'wrong_placement');
    v_detail := array_append(v_detail, format('sqlstate=%s error=%s', v_state, v_err));

    v_state := null; v_err := null;
    begin
      update public.igloo_slots set slot = 3 where player_id = fixture and slot = 8;
    exception when others then
      v_state := sqlstate; v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'award_rejected_on_floor');
    v_pass := array_append(v_pass, v_state = '23514' and v_err = 'wrong_placement');
    v_detail := array_append(v_detail, format('sqlstate=%s error=%s', v_state, v_err));

    v_state := null; v_err := null;
    begin
      update public.igloo_slots set slot = 10 where player_id = fixture and slot = 11;
    exception when others then
      v_state := sqlstate; v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'disco_ball_rejected_on_wall');
    v_pass := array_append(v_pass, v_state = '23514' and v_err = 'wrong_placement');
    v_detail := array_append(v_detail, format('sqlstate=%s error=%s', v_state, v_err));

    -- An unknown item still fails ownership, not the guard.
    v_state := null; v_err := null;
    begin
      insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 7, 'no-such-item');
    exception when others then
      v_state := sqlstate; v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'unknown_item_gives_23503');
    v_pass := array_append(v_pass, v_state = '23503');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 23503)', v_state));

    -- An out-of-range slot still fails the slot check, not the guard.
    v_state := null; v_err := null;
    begin
      insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 12, 'beanbag');
    exception when others then
      v_state := sqlstate; v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'slot_12_fails_slot_check');
    v_pass := array_append(v_pass, v_state = '23514' and v_err <> 'wrong_placement');
    v_detail := array_append(v_detail, format('sqlstate=%s error=%s', v_state, v_err));

    select count(*) into v_count from public.igloo_slots where player_id <> fixture;
    v_names := array_append(v_names, 'rls_hides_other_players_slots');
    v_pass := array_append(v_pass, v_count = 0);
    v_detail := array_append(v_detail, format('other Players'' slots visible=%s (expected 0)', v_count));

    select count(*) into v_count from public.igloo_slots where player_id = fixture;
    v_names := array_append(v_names, 'fixture_holds_three_placed_items');
    v_pass := array_append(v_pass, v_count = 3);
    v_detail := array_append(v_detail, format('placed=%s (expected 3: pennant 9, award 8, disco 11)', v_count));

    -----------------------------------------------------------------------
    -- As postgres: catalog, slot map, data state and security shape.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) filter (where placement = 'floor') = 5
       and count(*) filter (where placement = 'wall') = 8
       and count(*) filter (where placement = 'ceiling') = 1
       and count(*) = 14
      into v_ok
    from public.shop_items where stall = 'igloo';
    v_names := array_append(v_names, 'catalog_has_14_items_5_floor_8_wall_1_ceiling');
    v_pass := array_append(v_pass, coalesce(v_ok, false));
    v_detail := array_append(v_detail, 'Igloo Gear placements counted');

    select count(*) into v_count
    from public.shop_items
    where id in ('award-bptw', 'award-inc5000', 'award-top-workplaces')
      and placement = 'wall' and price = 60 and stall = 'igloo';
    v_names := array_append(v_names, 'awards_are_60_token_wall_items');
    v_pass := array_append(v_pass, v_count = 3);
    v_detail := array_append(v_detail, format('matching award rows=%s (expected 3)', v_count));

    select string_agg(public.igloo_slot_placement(n::smallint), ',' order by n) into v_text
    from generate_series(1, 11) as n;
    v_names := array_append(v_names, 'slot_placement_map_matches_client');
    v_pass := array_append(
      v_pass,
      v_text = 'floor,floor,floor,floor,floor,floor,wall,wall,wall,wall,ceiling'
        and public.igloo_slot_placement(0::smallint) is null
        and public.igloo_slot_placement(12::smallint) is null
    );
    v_detail := array_append(v_detail, format('1-11=%s', v_text));

    select count(*) into v_count
    from public.igloo_slots s
    join public.shop_items i on i.id = s.item_id
    where i.placement <> public.igloo_slot_placement(s.slot);
    v_names := array_append(v_names, 'no_misplaced_rows');
    v_pass := array_append(v_pass, v_count = 0);
    v_detail := array_append(v_detail, format('misplaced rows=%s (expected 0)', v_count));

    select count(*) into v_count
    from pg_trigger
    where tgrelid = 'public.igloo_slots'::regclass
      and tgname = 'igloo_slots_placement_guard'
      and tgenabled = 'O';
    v_names := array_append(v_names, 'placement_guard_present_and_enabled');
    v_pass := array_append(v_pass, v_count = 1);
    v_detail := array_append(v_detail, format('enabled guard triggers=%s (expected 1)', v_count));

    select p.prosecdef and p.proconfig @> array['search_path=""']
      into v_ok
    from pg_proc p
    where p.oid = 'public.igloo_slots_enforce_placement()'::regprocedure;
    v_names := array_append(v_names, 'guard_function_security_definer_empty_search_path');
    v_pass := array_append(v_pass, coalesce(v_ok, false));
    v_detail := array_append(v_detail, 'prosecdef and proconfig checked');

    v_names := array_append(v_names, 'guard_function_not_executable_by_clients');
    v_pass := array_append(
      v_pass,
      not has_function_privilege('authenticated', 'public.igloo_slots_enforce_placement()', 'execute')
        and not has_function_privilege('anon', 'public.igloo_slots_enforce_placement()', 'execute')
    );
    v_detail := array_append(v_detail, 'EXECUTE revoked from authenticated and anon');

    v_names := array_append(v_names, 'slot_placement_executable_by_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.igloo_slot_placement(smallint)', 'execute')
        and not has_function_privilege('anon', 'public.igloo_slot_placement(smallint)', 'execute')
    );
    v_detail := array_append(v_detail, 'EXECUTE granted to authenticated, not anon');

    raise exception 'proof_135_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_135_rollback' then
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

select * from pg_temp.proof_135('00000000-0000-0000-0000-00000000f1f0'::uuid);
