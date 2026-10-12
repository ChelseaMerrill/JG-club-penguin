-- Door network guard posts proof, in 51_stair_climb_proof.sql's style.
-- Covers 20261012000000_door_network_guard_posts.sql's decisions DN1-DN10.
--
-- What this proves: public.phishing_guard_posts holds exactly DN5's 16 posts,
-- compared row by row by position, with positions contiguous from 0 (DN5);
-- no two neighbouring windows share a Room or guard the two sides of one
-- doorway, including the wrap (DN5); the guarded Rooms are the five of
-- GUARD_ROOM_IDS; the check constraint phishing_guard_posts_room_id_check
-- exists by that name (DN2, DN7) and, by behaviour, accepts each of the five
-- Room ids and rejects 'igloo' with 23514 (DN7); RLS is on with no policies,
-- and select as authenticated or anon raises 42501 (#146 P2, unchanged);
-- phishing_guard_at maps sample windows to row floor(epoch / 600) mod 16, and
-- the operator's paste window (slot mod 16 = 5) to the-melt / ROOF DECK, the
-- post #146's 8-row seed also gives it (DN3, H2).
--
-- No replacement is needed before pasting into the Supabase SQL editor: this
-- proof reads no Player data.
--
-- This changes nothing: every check runs inside pg_temp.proof_170(), which
-- ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the Room-list probe rows). Each probe insert also
-- runs in its own savepoint. It prints only booleans, counts, Room ids and
-- door labels.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_170()
returns table (check_name text, pass boolean, detail text)
language plpgsql
as $$
declare
  v_names text[] := array[]::text[];
  v_pass boolean[] := array[]::boolean[];
  v_detail text[] := array[]::text[];
  -- DN5, by position (0-based: element i + 1 is position i).
  v_rooms constant text[] := array[
    'office-hallway', 'town-center', 'office-hallway', 'dev-pit',
    'office-hallway', 'the-melt', 'office-hallway', 'town-center',
    'office-hallway', 'dev-pit', 'office-hallway', 'the-melt',
    'office-hallway', 'town-center', 'roof-deck', 'town-center'];
  v_doors constant text[] := array[
    'TEAM ROOM 1', 'KITCHEN', 'TEAM ROOM 2', 'THE ICEBOX',
    'DEV PIT', 'ROOF DECK', 'TEAM ROOM 3', 'THE HALLWAY',
    'BATHROOM', 'THE HALLWAY', 'TEAM ROOM 4', 'TOWN CENTER',
    'TOWN CENTER', 'STAIRWELL', 'KITCHEN', 'ELEVATOR · ROOF DECK'];
  -- The two sides of each doorway between two guard Rooms (DN5).
  v_pair_a constant text[] := array[
    'town-center / THE HALLWAY', 'town-center / KITCHEN',
    'the-melt / ROOF DECK', 'dev-pit / THE HALLWAY'];
  v_pair_b constant text[] := array[
    'office-hallway / TOWN CENTER', 'the-melt / TOWN CENTER',
    'roof-deck / KITCHEN', 'office-hallway / DEV PIT'];
  v_five constant text[] := array[
    'town-center', 'dev-pit', 'the-melt', 'roof-deck', 'office-hallway'];
  v_post text[];
  v_count int;
  v_min int;
  v_max int;
  v_ok boolean;
  v_bad text;
  v_list text;
  v_state text;
  v_a jsonb;
  v_slot bigint;
  v_at timestamptz;
  v_all boolean;
  v_total int;
  i int;
  j int;
begin
  begin
    perform set_config('role', 'postgres', true);

    -----------------------------------------------------------------------
    -- DN5: the seed, compared row by row by position.
    -----------------------------------------------------------------------
    select count(*), min(g.position), max(g.position)
      into v_count, v_min, v_max
    from public.phishing_guard_posts g;
    v_names := array_append(v_names, 'sixteen_posts_contiguous_from_0');
    v_pass := array_append(v_pass, v_count = 16 and v_min = 0 and v_max = 15);
    v_detail := array_append(
      v_detail, format('%s posts, positions %s-%s (expected 16, 0-15)', v_count, v_min, v_max));

    v_ok := true;
    v_bad := null;
    for i in 0..15 loop
      select count(*) into v_count
      from public.phishing_guard_posts g
      where g.position = i
        and g.room_id = v_rooms[i + 1]
        and g.door_label = v_doors[i + 1];
      if v_count <> 1 then
        v_ok := false;
        v_bad := coalesce(v_bad || ', ', '') || i::text;
      end if;
    end loop;
    v_names := array_append(v_names, 'seed_matches_dn5_by_position');
    v_pass := array_append(v_pass, v_ok);
    v_detail := array_append(
      v_detail, coalesce('mismatched positions: ' || v_bad, 'all 16 positions match DN5'));

    -- Every post as '<room> / <door>', in position order.
    select array_agg(g.room_id || ' / ' || g.door_label order by g.position)
      into v_post
    from public.phishing_guard_posts g;
    v_count := coalesce(array_length(v_post, 1), 0);

    v_ok := v_count > 1;
    for i in 1..v_count loop
      j := i % v_count + 1;
      if split_part(v_post[i], ' / ', 1) = split_part(v_post[j], ' / ', 1) then
        v_ok := false;
      end if;
    end loop;
    v_names := array_append(v_names, 'no_neighbouring_windows_share_a_room');
    v_pass := array_append(v_pass, v_ok);
    v_detail := array_append(v_detail, format('%s windows checked, including the wrap', v_count));

    v_ok := v_count > 1;
    for i in 1..v_count loop
      j := i % v_count + 1;
      for k in 1..array_length(v_pair_a, 1) loop
        if (v_post[i] = v_pair_a[k] and v_post[j] = v_pair_b[k])
          or (v_post[i] = v_pair_b[k] and v_post[j] = v_pair_a[k]) then
          v_ok := false;
        end if;
      end loop;
    end loop;
    v_names := array_append(v_names, 'no_neighbouring_windows_guard_one_doorway');
    v_pass := array_append(v_pass, v_ok);
    v_detail := array_append(
      v_detail, format('%s doorway pairs checked, including the wrap', array_length(v_pair_a, 1)));

    select string_agg(d.room_id, ',' order by d.room_id collate "C")
      into v_list
    from (select distinct g.room_id from public.phishing_guard_posts g) d;
    v_names := array_append(v_names, 'guarded_rooms_are_the_five');
    v_pass := array_append(
      v_pass, v_list = 'dev-pit,office-hallway,roof-deck,the-melt,town-center');
    v_detail := array_append(v_detail, coalesce(v_list, '(none)'));

    -----------------------------------------------------------------------
    -- DN2/DN7: the constraint by name, and the Room list by behaviour.
    -----------------------------------------------------------------------
    v_names := array_append(v_names, 'room_check_constraint_named');
    v_pass := array_append(
      v_pass,
      exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.phishing_guard_posts'::regclass
          and c.contype = 'c'
          and c.conname = 'phishing_guard_posts_room_id_check'
      )
    );
    v_detail := array_append(v_detail, 'pg_constraint phishing_guard_posts_room_id_check');

    v_ok := true;
    v_bad := null;
    for i in 1..array_length(v_five, 1) loop
      begin
        insert into public.phishing_guard_posts (position, room_id, door_label)
        values (1000 + i, v_five[i], 'PROOF 170 PROBE ' || i);
        raise exception 'proof_170_undo';
      exception
        when others then
          if sqlerrm <> 'proof_170_undo' then
            v_ok := false;
            v_bad := coalesce(v_bad || ', ', '') || v_five[i] || ' ' || sqlstate;
          end if;
      end;
    end loop;
    v_names := array_append(v_names, 'room_check_accepts_the_five_rooms');
    v_pass := array_append(v_pass, v_ok);
    v_detail := array_append(v_detail, coalesce('rejected: ' || v_bad, 'all five inserted (each rolled back)'));

    v_state := null;
    begin
      insert into public.phishing_guard_posts (position, room_id, door_label)
      values (1000, 'igloo', 'PROOF 170 PROBE');
      raise exception 'proof_170_undo';
    exception
      when others then
        v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'room_check_rejects_igloo_23514');
    v_pass := array_append(v_pass, v_state = '23514');
    v_detail := array_append(v_detail, format('sqlstate %s (expected 23514)', v_state));

    -----------------------------------------------------------------------
    -- #146 P2, unchanged: RLS on, no policies, no client select.
    -----------------------------------------------------------------------
    v_names := array_append(v_names, 'rls_on_and_no_policies');
    v_pass := array_append(
      v_pass,
      (select c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'phishing_guard_posts')
        and not exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = 'phishing_guard_posts')
    );
    v_detail := array_append(v_detail, 'pg_class.relrowsecurity and pg_policies checked');

    v_ok := true;
    v_bad := null;
    foreach v_list in array array['authenticated', 'anon'] loop
      v_state := null;
      begin
        perform set_config('role', v_list, true);
        perform 1 from public.phishing_guard_posts limit 1;
      exception
        when others then
          v_state := sqlstate;
      end;
      perform set_config('role', 'postgres', true);
      if v_state is distinct from '42501' then
        v_ok := false;
        v_bad := coalesce(v_bad || ', ', '') || v_list || ' ' || coalesce(v_state, 'allowed');
      end if;
    end loop;
    v_names := array_append(v_names, 'select_denied_to_authenticated_and_anon_42501');
    v_pass := array_append(v_pass, v_ok);
    v_detail := array_append(v_detail, coalesce('not denied: ' || v_bad, 'both raised 42501'));

    -----------------------------------------------------------------------
    -- #146 P3/P4 with 16 posts: row floor(epoch / 600) mod 16.
    -----------------------------------------------------------------------
    v_ok := true;
    v_bad := null;
    foreach v_at in array array[
      to_timestamp(600 * (16 * 100000 + 7) + 30),
      '2026-10-12 14:05:00+00'::timestamptz
    ] loop
      v_slot := floor(extract(epoch from v_at) / 600)::bigint;
      v_a := public.phishing_guard_at(v_at);
      if v_a ->> 'roomId' is distinct from v_rooms[(v_slot % 16)::int + 1]
        or v_a ->> 'doorLabel' is distinct from v_doors[(v_slot % 16)::int + 1] then
        v_ok := false;
        v_bad := coalesce(v_bad || ', ', '') || (v_slot % 16)::text;
      end if;
    end loop;
    v_names := array_append(v_names, 'post_index_is_epoch_window_mod_16');
    v_pass := array_append(v_pass, v_ok);
    v_detail := array_append(v_detail, coalesce('wrong at index ' || v_bad, 'two sample windows checked'));

    v_a := public.phishing_guard_at(to_timestamp(600 * (16 * 100000 + 5)));
    v_names := array_append(v_names, 'paste_window_slot_5_is_the_melt_roof_deck');
    v_pass := array_append(
      v_pass, v_a ->> 'roomId' = 'the-melt' and v_a ->> 'doorLabel' = 'ROOF DECK');
    v_detail := array_append(v_detail, format('%s / %s', v_a ->> 'roomId', v_a ->> 'doorLabel'));

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_170_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_170_rollback' then
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

select * from pg_temp.proof_170();
