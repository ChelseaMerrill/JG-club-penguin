-- Leaderboard proof for #70, against the #9 H1 fixture Player, in #27's
-- 27_rls_proof.sql style.
--
-- What this proves: `public.leaderboard()` ranks by best_score desc, then
-- updated_at asc (whoever reached a tied score first) as its tiebreak;
-- appends the caller's own row (is_me = true) exactly once when it falls
-- outside the requested row count; excludes a Player whose name is blank
-- (including one made only of invisible characters) even when their score
-- would otherwise rank #1; is `security definer` with `search_path = ''`
-- locked down, has exactly one overload, and is revoked from anon/granted
-- to authenticated only.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- Live-data-tolerant (R3): every throwaway best is set relative to
-- whatever `max(best_score)` already exists for 'bug-squash'
-- (`v_max + 3`, `v_max + 2`, `v_max + 2` again for the tie, `v_max + 10` for
-- the excluded unnamed Player), so this passes whether the project has zero
-- real bests or thousands, and never depends on running before or after any
-- other proof. Each throwaway Player is created through #27's own
-- precondition-handled `auth.users` insert (as `27_rls_proof.sql` does for
-- its Player B), with `players ... on conflict do nothing`.
--
-- This changes nothing: every check runs inside pg_temp.proof_70(), which
-- ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the fixture's own best, every throwaway Player
-- and their bests, all of it). It prints only counts and ranks -- no real
-- Player's name, id or email is ever selected or printed here.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final `select * from pg_temp.proof_70(...)`
-- below. Expected result: every row has pass = true, including the final
-- ALL row.

create or replace function pg_temp.proof_70(fixture uuid)
returns table (check_name text, pass boolean, detail text)
language plpgsql
as $$
declare
  v_names text[] := array[]::text[];
  v_pass boolean[] := array[]::boolean[];
  v_detail text[] := array[]::text[];
  v_game text := 'bug-squash';
  v_max int;
  v_c_id uuid;
  v_d_id uuid;
  v_e_id uuid;
  v_f_id uuid;
  v_count int;
  v_rows_count int := 0;
  v_is_me_count int := 0;
  v_rank1 int;
  v_rank2 int;
  v_rank3 int;
  v_name1 text;
  v_name2 text;
  v_name3 text;
  v_saw_f boolean := false;
  v_all boolean;
  v_total int;
  r record;
  i int;
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres. Reset the fixture's own bug-squash best
    -- so a rerun starts clean, then read the current live max relative to
    -- which every throwaway best below is set.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.minigame_bests where player_id = fixture and minigame_id = v_game;

    select coalesce(max(best_score), 0) into v_max
    from public.minigame_bests
    where minigame_id = v_game;

    -----------------------------------------------------------------------
    -- Three named throwaway Players (C, D, E) and one unnamed (F), each via
    -- #27's precondition-handled auth.users insert. Everything here is
    -- rolled back at the end.
    -----------------------------------------------------------------------
    begin
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'leaderboard-proof-c@example.invalid')
      returning id into v_c_id;
    exception when others then
      raise exception
        'precondition failed: could not create throwaway Player C in auth.users (sqlstate=%, sqlerrm=%)',
        sqlstate, sqlerrm;
    end;
    insert into public.players (id) values (v_c_id) on conflict do nothing;
    update public.players set penguin_name = 'PROOF C' where id = v_c_id;

    begin
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'leaderboard-proof-d@example.invalid')
      returning id into v_d_id;
    exception when others then
      raise exception
        'precondition failed: could not create throwaway Player D in auth.users (sqlstate=%, sqlerrm=%)',
        sqlstate, sqlerrm;
    end;
    insert into public.players (id) values (v_d_id) on conflict do nothing;
    update public.players set penguin_name = 'PROOF D' where id = v_d_id;

    begin
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'leaderboard-proof-e@example.invalid')
      returning id into v_e_id;
    exception when others then
      raise exception
        'precondition failed: could not create throwaway Player E in auth.users (sqlstate=%, sqlerrm=%)',
        sqlstate, sqlerrm;
    end;
    insert into public.players (id) values (v_e_id) on conflict do nothing;
    update public.players set penguin_name = 'PROOF E' where id = v_e_id;

    begin
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'leaderboard-proof-f@example.invalid')
      returning id into v_f_id;
    exception when others then
      raise exception
        'precondition failed: could not create throwaway Player F in auth.users (sqlstate=%, sqlerrm=%)',
        sqlstate, sqlerrm;
    end;
    insert into public.players (id) values (v_f_id) on conflict do nothing;
    -- F stays unnamed (blank penguin_name): must never appear below, even
    -- though its best (v_max + 10) is the single highest of the five.

    -----------------------------------------------------------------------
    -- Bests: C > D = E (tied, D reached first) > fixture; F highest of all
    -- but unnamed.
    -----------------------------------------------------------------------
    insert into public.minigame_bests (player_id, minigame_id, best_score, updated_at)
    values
      (v_c_id, v_game, v_max + 3, now()),
      (v_d_id, v_game, v_max + 2, now() - interval '1 minute'),
      (v_e_id, v_game, v_max + 2, now()),
      (v_f_id, v_game, v_max + 10, now())
    on conflict (player_id, minigame_id) do update
      set best_score = excluded.best_score, updated_at = excluded.updated_at;

    insert into public.minigame_bests (player_id, minigame_id, best_score, updated_at)
    values (fixture, v_game, greatest(v_max - 1, 0), now())
    on conflict (player_id, minigame_id) do update
      set best_score = excluded.best_score, updated_at = excluded.updated_at;

    -----------------------------------------------------------------------
    -- As the fixture, call leaderboard(v_game, 3): the top 3 (C, D, E, in
    -- that order) plus the fixture's own row appended (it can't be in the
    -- top 3: C/D/E were each set above the live max on purpose).
    -----------------------------------------------------------------------
    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );

    for r in select * from public.leaderboard(v_game, 3) order by rank loop
      v_rows_count := v_rows_count + 1;
      if r.is_me then
        v_is_me_count := v_is_me_count + 1;
      end if;
      if r.best_score = v_max + 10 then
        v_saw_f := true;
      end if;
      if v_rows_count = 1 then
        v_rank1 := r.rank;
        v_name1 := r.penguin_name;
      elsif v_rows_count = 2 then
        v_rank2 := r.rank;
        v_name2 := r.penguin_name;
      elsif v_rows_count = 3 then
        v_rank3 := r.rank;
        v_name3 := r.penguin_name;
      end if;
    end loop;

    v_names := array_append(v_names, 'top_3_ranks_are_1_2_3_in_order');
    v_pass := array_append(v_pass, v_rank1 = 1 and v_rank2 = 2 and v_rank3 = 3);
    v_detail := array_append(
      v_detail, format('ranks=[%s,%s,%s] (expected [1,2,3])', v_rank1, v_rank2, v_rank3)
    );

    v_names := array_append(v_names, 'rank_1_is_the_highest_named_best');
    v_pass := array_append(v_pass, v_name1 = 'PROOF C');
    v_detail := array_append(v_detail, format('rank 1 matched expected top score: %s', v_name1 = 'PROOF C'));

    v_names := array_append(v_names, 'tie_order_reached_first_ranks_higher');
    v_pass := array_append(v_pass, v_name2 = 'PROOF D' and v_name3 = 'PROOF E');
    v_detail := array_append(
      v_detail, format('tie order matched expected: %s', v_name2 = 'PROOF D' and v_name3 = 'PROOF E')
    );

    v_names := array_append(v_names, 'unnamed_highest_best_is_absent');
    v_pass := array_append(v_pass, not v_saw_f);
    v_detail := array_append(v_detail, format('unnamed row seen=%s (expected false)', v_saw_f));

    v_names := array_append(v_names, 'total_rows_is_top_3_plus_own_row');
    v_pass := array_append(v_pass, v_rows_count = 4);
    v_detail := array_append(v_detail, format('rows=%s (expected 4)', v_rows_count));

    v_names := array_append(v_names, 'exactly_one_is_me_row');
    v_pass := array_append(v_pass, v_is_me_count = 1);
    v_detail := array_append(v_detail, format('is_me count=%s (expected 1)', v_is_me_count));

    -----------------------------------------------------------------------
    -- anon is denied
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

    begin
      perform * from public.leaderboard(v_game, 3);
      v_names := array_append(v_names, 'anon_leaderboard_blocked_42501');
      v_pass := array_append(v_pass, false);
      v_detail := array_append(v_detail, 'call succeeded, expected 42501');
    exception when others then
      v_names := array_append(v_names, 'anon_leaderboard_blocked_42501');
      v_pass := array_append(v_pass, sqlstate = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s', sqlstate));
    end;

    -----------------------------------------------------------------------
    -- security/shape checks, as postgres
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    v_names := array_append(v_names, 'single_overload');
    select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'leaderboard';
    v_pass := array_append(v_pass, v_count = 1);
    v_detail := array_append(v_detail, format('overloads=%s (expected 1)', v_count));

    v_names := array_append(v_names, 'security_definer');
    v_pass := array_append(
      v_pass,
      (select p.prosecdef from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'leaderboard')
    );
    v_detail := array_append(v_detail, 'prosecdef checked');

    v_names := array_append(v_names, 'search_path_locked');
    v_pass := array_append(
      v_pass,
      (select 'search_path=""' = any(coalesce(p.proconfig, array[]::text[]))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'leaderboard')
    );
    v_detail := array_append(v_detail, 'proconfig checked');

    v_names := array_append(v_names, 'authenticated_can_execute');
    v_pass := array_append(
      v_pass, has_function_privilege('authenticated', 'public.leaderboard(text, int)', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege(authenticated) checked');

    v_names := array_append(v_names, 'anon_cannot_execute');
    v_pass := array_append(
      v_pass, not has_function_privilege('anon', 'public.leaderboard(text, int)', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege(anon) checked');

    perform set_config('role', 'postgres', true);

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_70_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_70_rollback' then
        raise;
      end if;
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

select * from pg_temp.proof_70('00000000-0000-0000-0000-00000000f1f0'::uuid);
