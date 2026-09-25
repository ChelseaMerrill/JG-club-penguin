-- Feedback proof for 20260925020000_feedback.sql, against the #9 H1 fixture
-- Player, in 46_quests_proof.sql's style.
--
-- What this proves, as the fixture signed in (role authenticated):
-- submit_feedback() stores a trimmed issue or suggestion with its Room and
-- returns { id }; refuses a bad kind, a blank or over-long message, an
-- over-long Room id or client info with invalid_feedback (storing nothing);
-- accepts 5 submissions in 10 minutes and refuses the 6th with
-- feedback_rate_limited (storing nothing), while rows older than 10 minutes
-- don't count; refuses a caller with no Player row (no_player) and a caller
-- with no auth.uid() (not_authenticated). Direct select/insert/update/delete
-- on public.feedback are denied (42501) for authenticated and anon, and anon
-- can't call the function. Also: RLS is on with no policies, the function is
-- security definer with search_path = '' and exactly one overload, and
-- EXECUTE is granted to authenticated only.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs.
--
-- This changes nothing: every check runs inside pg_temp.proof_feedback(),
-- which ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the fixture's feedback rows and the throwaway
-- Player B). Rolled back too, so no Database Webhook request is ever sent
-- for these rows (pg_net sends only after commit). It prints only booleans,
-- counts and error codes -- no Player's name, id, email or message.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_feedback(fixture uuid)
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
  v_row record;
  v_all boolean;
  v_total int;
  i int;
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: the fixture exists and has no feedback
    -- rows. A throwaway Player B exists in auth.users only (no players row).
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.feedback where player_id = fixture;

    begin
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'feedback-proof-b@example.invalid')
      returning id into v_b_id;
    exception when others then
      raise exception
        'precondition failed: could not create throwaway Player B in auth.users (sqlstate=%, sqlerrm=%)',
        sqlstate, sqlerrm;
    end;

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

    v_result := public.submit_feedback('issue', E'  The door is stuck \n', ' the-melt ', 'proof agent');
    v_names := array_append(v_names, 'submit_issue_returns_id');
    v_pass := array_append(v_pass, (v_result ->> 'id') is not null and jsonb_typeof(v_result -> 'id') = 'string');
    v_detail := array_append(v_detail, format('keys=%s', (select string_agg(k, ',') from jsonb_object_keys(v_result) k)));

    perform set_config('role', 'postgres', true);
    select f.kind, f.message, f.room_id, f.client_info, f.player_id, f.emailed_at
      into v_row
    from public.feedback f
    where f.id = (v_result ->> 'id')::uuid;
    v_names := array_append(v_names, 'row_stored_trimmed_with_room_and_owner');
    v_pass := array_append(
      v_pass,
      v_row.kind = 'issue'
        and v_row.message = 'The door is stuck'
        and v_row.room_id = 'the-melt'
        and v_row.client_info = 'proof agent'
        and v_row.player_id = fixture
        and v_row.emailed_at is null
    );
    v_detail := array_append(v_detail, 'kind, trimmed message, room_id, client_info, player_id, emailed_at null');
    perform set_config('role', 'authenticated', true);

    v_result := public.submit_feedback('suggestion', repeat('s', 2000), null, null);
    v_names := array_append(v_names, 'suggestion_of_2000_chars_accepted');
    v_pass := array_append(v_pass, (v_result ->> 'id') is not null);
    v_detail := array_append(v_detail, 'message length 2000');

    v_result := public.submit_feedback('issue', 'blank extras', '   ', '');
    perform set_config('role', 'postgres', true);
    select f.room_id, f.client_info into v_row
    from public.feedback f
    where f.id = (v_result ->> 'id')::uuid;
    v_names := array_append(v_names, 'blank_room_and_client_info_stored_as_null');
    v_pass := array_append(v_pass, v_row.room_id is null and v_row.client_info is null);
    v_detail := array_append(v_detail, 'room_id and client_info null');
    perform set_config('role', 'authenticated', true);

    -- Invalid inputs: each raises invalid_feedback.
    for v_row in
      select *
      from (values
        ('rejects_unknown_kind', 'rant', 'hello', null::text, null::text),
        ('rejects_null_kind', null, 'hello', null, null),
        ('rejects_null_message', 'issue', null, null, null),
        ('rejects_whitespace_message', 'issue', E'  \n\t ', null, null),
        ('rejects_2001_char_message', 'issue', repeat('x', 2001), null, null),
        ('rejects_65_char_room_id', 'issue', 'hello', repeat('r', 65), null),
        ('rejects_301_char_client_info', 'issue', 'hello', null, repeat('c', 301))
      ) as t (name, kind, message, room_id, client_info)
    loop
      v_err := null;
      begin
        perform public.submit_feedback(v_row.kind, v_row.message, v_row.room_id, v_row.client_info);
      exception when others then
        v_err := sqlerrm;
      end;
      v_names := array_append(v_names, v_row.name::text);
      v_pass := array_append(v_pass, v_err is not distinct from 'invalid_feedback');
      v_detail := array_append(v_detail, format('error=%s (expected invalid_feedback)', v_err));
    end loop;

    perform set_config('role', 'postgres', true);
    select count(*) into v_count from public.feedback where player_id = fixture;
    v_names := array_append(v_names, 'invalid_attempts_store_nothing');
    v_pass := array_append(v_pass, v_count = 3);
    v_detail := array_append(v_detail, format('rows=%s (expected 3)', v_count));
    perform set_config('role', 'authenticated', true);

    -- Rate limit: two more fit (5 in 10 minutes), the 6th is refused.
    perform public.submit_feedback('issue', 'fourth', null, null);
    v_result := public.submit_feedback('suggestion', 'fifth', null, null);
    v_names := array_append(v_names, 'fifth_in_10_minutes_accepted');
    v_pass := array_append(v_pass, (v_result ->> 'id') is not null);
    v_detail := array_append(v_detail, 'five submissions stored');

    v_err := null;
    begin
      perform public.submit_feedback('issue', 'sixth', null, null);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'sixth_in_10_minutes_rate_limited');
    v_pass := array_append(v_pass, v_err is not distinct from 'feedback_rate_limited');
    v_detail := array_append(v_detail, format('error=%s (expected feedback_rate_limited)', v_err));

    perform set_config('role', 'postgres', true);
    select count(*) into v_count from public.feedback where player_id = fixture;
    v_names := array_append(v_names, 'rate_limited_attempt_stores_nothing');
    v_pass := array_append(v_pass, v_count = 5);
    v_detail := array_append(v_detail, format('rows=%s (expected 5)', v_count));

    -- Age every row past the window: they no longer count.
    update public.feedback
    set created_at = now() - interval '11 minutes'
    where player_id = fixture;
    perform set_config('role', 'authenticated', true);

    v_err := null;
    begin
      perform public.submit_feedback('issue', 'after the window', null, null);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'rows_older_than_10_minutes_not_counted');
    v_pass := array_append(v_pass, v_err is null);
    v_detail := array_append(v_detail, format('error=%s (expected none)', v_err));

    -- Direct table access, as the signed-in fixture.
    for v_row in
      select *
      from (values
        ('authenticated_direct_select_denied', 'select count(*) from public.feedback'),
        ('authenticated_direct_insert_denied',
          format('insert into public.feedback (player_id, kind, message) values (%L, ''issue'', ''x'')', fixture)),
        ('authenticated_direct_update_denied', 'update public.feedback set emailed_at = now()'),
        ('authenticated_direct_delete_denied', 'delete from public.feedback')
      ) as t (name, sql)
    loop
      v_state := null;
      begin
        execute v_row.sql;
      exception when others then
        v_state := sqlstate;
      end;
      v_names := array_append(v_names, v_row.name::text);
      v_pass := array_append(v_pass, v_state = '42501');
      v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));
    end loop;

    -----------------------------------------------------------------------
    -- As Player B (signed in, no players row).
    -----------------------------------------------------------------------
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_b_id, 'role', 'authenticated')::text,
      true
    );
    v_err := null;
    begin
      perform public.submit_feedback('issue', 'hello', null, null);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'refuses_caller_without_player_row');
    v_pass := array_append(v_pass, v_err is not distinct from 'no_player');
    v_detail := array_append(v_detail, format('error=%s (expected no_player)', v_err));

    -----------------------------------------------------------------------
    -- Role authenticated but no auth.uid().
    -----------------------------------------------------------------------
    perform set_config('request.jwt.claims', '', true);
    v_err := null;
    v_state := null;
    begin
      perform public.submit_feedback('issue', 'hello', null, null);
    exception when others then
      v_err := sqlerrm;
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'refuses_without_auth_uid');
    v_pass := array_append(v_pass, v_err is not distinct from 'not_authenticated' and v_state = '42501');
    v_detail := array_append(v_detail, format('error=%s sqlstate=%s (expected not_authenticated 42501)', v_err, v_state));

    -----------------------------------------------------------------------
    -- As anon.
    -----------------------------------------------------------------------
    perform set_config('role', 'anon', true);

    v_state := null;
    begin
      perform public.submit_feedback('issue', 'hello', null, null);
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_denied_submit_feedback');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    v_state := null;
    begin
      perform count(*) from public.feedback;
    exception when others then
      v_state := sqlstate;
    end;
    v_names := array_append(v_names, 'anon_direct_select_denied');
    v_pass := array_append(v_pass, v_state = '42501');
    v_detail := array_append(v_detail, format('sqlstate=%s (expected 42501)', v_state));

    -----------------------------------------------------------------------
    -- Table and function definitions and grants, as postgres.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    v_names := array_append(v_names, 'rls_enabled_with_no_policies');
    v_pass := array_append(
      v_pass,
      (select c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'feedback')
        and not exists (
          select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'feedback'
        )
    );
    v_detail := array_append(v_detail, 'pg_class.relrowsecurity and pg_policies checked');

    v_names := array_append(v_names, 'no_table_privileges_for_anon_or_authenticated');
    v_pass := array_append(
      v_pass,
      not has_table_privilege('authenticated', 'public.feedback', 'select')
        and not has_table_privilege('authenticated', 'public.feedback', 'insert')
        and not has_table_privilege('authenticated', 'public.feedback', 'update')
        and not has_table_privilege('authenticated', 'public.feedback', 'delete')
        and not has_table_privilege('anon', 'public.feedback', 'select')
        and not has_table_privilege('anon', 'public.feedback', 'insert')
        and not has_table_privilege('anon', 'public.feedback', 'update')
        and not has_table_privilege('anon', 'public.feedback', 'delete')
    );
    v_detail := array_append(v_detail, 'has_table_privilege checked for both roles');

    v_names := array_append(v_names, 'one_overload_security_definer_search_path_locked');
    v_pass := array_append(
      v_pass,
      (select count(*) = 1
         and bool_and(p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'submit_feedback')
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked');

    v_names := array_append(v_names, 'execute_granted_to_authenticated_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.submit_feedback(text, text, text, text)', 'execute')
        and not has_function_privilege('anon', 'public.submit_feedback(text, text, text, text)', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_feedback_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_feedback_rollback' then
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

select * from pg_temp.proof_feedback('00000000-0000-0000-0000-00000000f1f0'::uuid);
