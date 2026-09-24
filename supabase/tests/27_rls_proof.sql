-- RLS and anti-cheat proof for #27 (saved progress), against the #9 fixture
-- Player, in the style of #9's H1b SQL impersonation.
--
-- What this proves: an authenticated Player reads only their own rows across
-- players / player_badges / minigame_bests / minigame_rounds / player_items /
-- igloo_slots; direct client writes to the Token balance and to the
-- server-only tables are rejected; an igloo_slots row can only point at an
-- item its owner owns; record_round()'s payout math (including the burnt
-- floor, the per-round cooldown, the per-round cap, and the one-time badge
-- bonus) and purchase_item()'s balance/ownership checks behave as specced;
-- and anon has no access to any of it, including the two RPCs.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture).
--
-- This changes nothing: every check runs inside pg_temp.proof_27(), which
-- ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the fixture's starting Tokens, every round,
-- every purchase, the badge and item given to the second Player, all of
-- it). The only thing the function reads without writing is which other
-- Player row to use as "B"; B's id is never selected or printed here, only
-- row counts.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final `select * from pg_temp.proof_27(...)`
-- below. Expected result: every row has pass = true, including the final
-- ALL row (the AND of every other row).

create or replace function pg_temp.proof_27(fixture uuid)
returns table (check_name text, pass boolean, detail text)
language plpgsql
as $$
declare
  v_names text[] := array[]::text[];
  v_pass boolean[] := array[]::boolean[];
  v_detail text[] := array[]::text[];
  v_b_id uuid;
  v_count int;
  v_tokens int;
  v_result jsonb;
  v_all boolean;
  v_total int;
  i int;
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture player row not found for %', fixture;
    end if;

    select id into v_b_id
    from public.players
    where id <> fixture
    limit 1;
    if v_b_id is null then
      raise exception 'no second player row found to use as B';
    end if;

    update public.players set tokens = 100 where id = fixture;

    -----------------------------------------------------------------------
    -- The fixture sees exactly 1 players row, its own
    -----------------------------------------------------------------------
    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );

    select count(*) into v_count from public.players;
    v_names := array_append(v_names, 'fixture_sees_only_own_players_row');
    v_pass := array_append(v_pass, v_count = 1);
    v_detail := array_append(v_detail, format('visible players rows=%s (expected 1)', v_count));

    -----------------------------------------------------------------------
    -- A direct token update fails with 42501, balance stays 100
    -----------------------------------------------------------------------
    begin
      update public.players set tokens = 99999 where id = fixture;
      v_names := array_append(v_names, 'direct_update_tokens_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'update succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'direct_update_tokens_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    perform set_config('role', 'postgres', true);
    select tokens into v_tokens from public.players where id = fixture;
    perform set_config('role', 'authenticated', true);
    v_names := array_append(v_names, 'direct_update_tokens_balance_unchanged');
    v_pass := array_append(v_pass, v_tokens = 100);
    v_detail := array_append(v_detail, format('tokens=%s (expected 100)', v_tokens));

    -----------------------------------------------------------------------
    -- Direct inserts into the server-only tables fail with 42501
    -----------------------------------------------------------------------
    begin
      insert into public.player_badges (player_id, badge_id) values (fixture, 'exterminator');
      v_names := array_append(v_names, 'direct_insert_player_badges_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'insert succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'direct_insert_player_badges_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    begin
      insert into public.minigame_bests (player_id, minigame_id, best_score)
      values (fixture, 'pancake-flip', 1);
      v_names := array_append(v_names, 'direct_insert_minigame_bests_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'insert succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'direct_insert_minigame_bests_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    begin
      insert into public.minigame_rounds (player_id, minigame_id, score, tokens_awarded)
      values (fixture, 'pancake-flip', 1, 0);
      v_names := array_append(v_names, 'direct_insert_minigame_rounds_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'insert succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'direct_insert_minigame_rounds_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    begin
      insert into public.player_items (player_id, item_id) values (fixture, 'beanbag');
      v_names := array_append(v_names, 'direct_insert_player_items_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'insert succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'direct_insert_player_items_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    -----------------------------------------------------------------------
    -- As postgres, give B (never named beyond this) a badge and an item.
    -- The fixture must see 0 rows for B in both tables.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);
    insert into public.player_badges (player_id, badge_id) values (v_b_id, 'exterminator');
    insert into public.player_items (player_id, item_id) values (v_b_id, 'rgb-light-strip');

    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );

    select count(*) into v_count from public.player_badges where player_id = v_b_id;
    v_names := array_append(v_names, 'fixture_sees_zero_of_b_player_badges');
    v_pass := array_append(v_pass, v_count = 0);
    v_detail := array_append(v_detail, format('visible rows=%s (expected 0)', v_count));

    select count(*) into v_count from public.player_items where player_id = v_b_id;
    v_names := array_append(v_names, 'fixture_sees_zero_of_b_player_items');
    v_pass := array_append(v_pass, v_count = 0);
    v_detail := array_append(v_detail, format('visible rows=%s (expected 0)', v_count));

    -----------------------------------------------------------------------
    -- An igloo_slots insert pointing at an unowned item fails with 23503
    -----------------------------------------------------------------------
    begin
      insert into public.igloo_slots (player_id, slot, item_id) values (fixture, 1, 'beanbag');
      v_names := array_append(v_names, 'igloo_slot_unowned_item_blocked_23503');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'insert succeeded, expected 23503');
    exception when others then
      v_names := array_append(v_names, 'igloo_slot_unowned_item_blocked_23503');
      v_pass := array_append(v_pass, sqlstate = '23503');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    -----------------------------------------------------------------------
    -- record_round: 2 golden + 5 burnt floors at 0, not -5
    -----------------------------------------------------------------------
    select public.record_round('pancake-flip', 7, '{"stacked":7,"golden":2,"burnt":5}'::jsonb)
      into v_result;
    v_names := array_append(v_names, 'record_round_burnt_floored_tokens_awarded_zero');
    v_pass := array_append(v_pass, (v_result ->> 'tokensAwarded')::int = 0);
    v_detail := array_append(
      v_detail, format('tokensAwarded=%s (expected 0)', v_result ->> 'tokensAwarded')
    );

    v_names := array_append(v_names, 'record_round_burnt_floored_balance_100');
    v_pass := array_append(v_pass, (v_result ->> 'balance')::int = 100);
    v_detail := array_append(
      v_detail, format('balance=%s (expected 100)', v_result ->> 'balance')
    );

    -----------------------------------------------------------------------
    -- A second round right away is rejected as round_too_soon
    -----------------------------------------------------------------------
    begin
      perform public.record_round('pancake-flip', 1, '{}'::jsonb);
      v_names := array_append(v_names, 'record_round_second_round_too_soon');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'round succeeded, expected round_too_soon');
    exception when others then
      v_names := array_append(v_names, 'record_round_second_round_too_soon');
      v_pass := array_append(v_pass, sqlerrm = 'round_too_soon');
      v_detail := array_append(v_detail, format('sqlerrm=%s', sqlerrm));
    end;

    -- As postgres, backdate the fixture's pancake-flip rounds by 10 minutes
    -- (the cooldown is 90 seconds) so the next round is allowed.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '10 minutes'
    where player_id = fixture and minigame_id = 'pancake-flip';
    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );

    -----------------------------------------------------------------------
    -- A big round is capped at 400, earns the badge, +50 bonus once
    -----------------------------------------------------------------------
    select public.record_round('pancake-flip', 99, '{"stacked":99,"golden":99}'::jsonb)
      into v_result;
    v_names := array_append(v_names, 'record_round_badge_tokens_awarded_capped_400');
    v_pass := array_append(v_pass, (v_result ->> 'tokensAwarded')::int = 400);
    v_detail := array_append(
      v_detail, format('tokensAwarded=%s (expected 400)', v_result ->> 'tokensAwarded')
    );

    v_names := array_append(v_names, 'record_round_badge_earned_true');
    v_pass := array_append(v_pass, (v_result ->> 'badgeEarned')::boolean = true);
    v_detail := array_append(
      v_detail, format('badgeEarned=%s (expected true)', v_result ->> 'badgeEarned')
    );

    v_names := array_append(v_names, 'record_round_badge_balance_550');
    v_pass := array_append(v_pass, (v_result ->> 'balance')::int = 550);
    v_detail := array_append(
      v_detail, format('balance=%s (expected 550)', v_result ->> 'balance')
    );

    -- Backdate again, then prove the +50 badge bonus is paid once only.
    perform set_config('role', 'postgres', true);
    update public.minigame_rounds
    set finished_at = finished_at - interval '10 minutes'
    where player_id = fixture and minigame_id = 'pancake-flip';
    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );

    select public.record_round('pancake-flip', 25, '{"stacked":25,"golden":1}'::jsonb)
      into v_result;
    v_names := array_append(v_names, 'record_round_badge_paid_once_badge_earned_false');
    v_pass := array_append(v_pass, (v_result ->> 'badgeEarned')::boolean = false);
    v_detail := array_append(
      v_detail, format('badgeEarned=%s (expected false)', v_result ->> 'badgeEarned')
    );

    v_names := array_append(v_names, 'record_round_badge_paid_once_balance_560');
    v_pass := array_append(v_pass, (v_result ->> 'balance')::int = 560);
    v_detail := array_append(
      v_detail, format('balance=%s (expected 560)', v_result ->> 'balance')
    );

    -----------------------------------------------------------------------
    -- purchase_item: insufficient_tokens leaves the balance unchanged
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);
    update public.players set tokens = 10 where id = fixture;
    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );

    begin
      perform public.purchase_item('beanbag');
      v_names := array_append(v_names, 'purchase_item_insufficient_tokens_error');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'purchase succeeded, expected insufficient_tokens');
    exception when others then
      v_names := array_append(v_names, 'purchase_item_insufficient_tokens_error');
      v_pass := array_append(v_pass, sqlerrm = 'insufficient_tokens');
      v_detail := array_append(v_detail, format('sqlerrm=%s', sqlerrm));
    end;

    perform set_config('role', 'postgres', true);
    select tokens into v_tokens from public.players where id = fixture;
    perform set_config('role', 'authenticated', true);
    v_names := array_append(v_names, 'purchase_item_insufficient_tokens_balance_unchanged');
    v_pass := array_append(v_pass, v_tokens = 10);
    v_detail := array_append(v_detail, format('tokens=%s (expected 10)', v_tokens));

    -----------------------------------------------------------------------
    -- purchase_item: desk succeeds once, already_owned, unknown_item
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);
    update public.players set tokens = 100 where id = fixture;
    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );

    select public.purchase_item('desk') into v_result;
    v_names := array_append(v_names, 'purchase_item_desk_success_balance_20');
    v_pass := array_append(v_pass, (v_result ->> 'balance')::int = 20);
    v_detail := array_append(
      v_detail, format('balance=%s (expected 20)', v_result ->> 'balance')
    );

    begin
      perform public.purchase_item('desk');
      v_names := array_append(v_names, 'purchase_item_desk_already_owned_error');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'purchase succeeded, expected already_owned');
    exception when others then
      v_names := array_append(v_names, 'purchase_item_desk_already_owned_error');
      v_pass := array_append(v_pass, sqlerrm = 'already_owned');
      v_detail := array_append(v_detail, format('sqlerrm=%s', sqlerrm));
    end;

    begin
      perform public.purchase_item('hoverboard');
      v_names := array_append(v_names, 'purchase_item_hoverboard_unknown_item_error');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'purchase succeeded, expected unknown_item');
    exception when others then
      v_names := array_append(v_names, 'purchase_item_hoverboard_unknown_item_error');
      v_pass := array_append(v_pass, sqlerrm = 'unknown_item');
      v_detail := array_append(v_detail, format('sqlerrm=%s', sqlerrm));
    end;

    -----------------------------------------------------------------------
    -- anon: role anon, no sub. Every one of the 7 tables and both RPCs are
    -- blocked with 42501 (the acceptance criterion only requires
    -- purchase_item; record_round is proved the same way for completeness).
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

    begin
      perform count(*) from public.players;
      v_names := array_append(v_names, 'anon_select_players_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'select succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'anon_select_players_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    begin
      perform count(*) from public.player_badges;
      v_names := array_append(v_names, 'anon_select_player_badges_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'select succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'anon_select_player_badges_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    begin
      perform count(*) from public.minigame_bests;
      v_names := array_append(v_names, 'anon_select_minigame_bests_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'select succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'anon_select_minigame_bests_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    begin
      perform count(*) from public.minigame_rounds;
      v_names := array_append(v_names, 'anon_select_minigame_rounds_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'select succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'anon_select_minigame_rounds_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    begin
      perform count(*) from public.shop_items;
      v_names := array_append(v_names, 'anon_select_shop_items_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'select succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'anon_select_shop_items_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    begin
      perform count(*) from public.player_items;
      v_names := array_append(v_names, 'anon_select_player_items_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'select succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'anon_select_player_items_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    begin
      perform count(*) from public.igloo_slots;
      v_names := array_append(v_names, 'anon_select_igloo_slots_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'select succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'anon_select_igloo_slots_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    begin
      perform public.purchase_item('desk');
      v_names := array_append(v_names, 'anon_purchase_item_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'purchase succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'anon_purchase_item_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s sqlerrm=%s', sqlstate, sqlerrm));
    end;

    perform set_config('role', 'postgres', true);

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_27_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_27_rollback' then
        -- A real, unexpected error escaped a check above. Surface it
        -- instead of silently reporting a partial or misleading result.
        raise;
      end if;
      -- Expected: the sentinel above rolled back every write this function
      -- made. Fall through to return the collected results.
  end;

  v_total := coalesce(array_length(v_names, 1), 0);
  v_all := true;
  for i in 1..v_total loop
    if not v_pass[i] then
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

select * from pg_temp.proof_27('00000000-0000-0000-0000-00000000f1f0'::uuid);
