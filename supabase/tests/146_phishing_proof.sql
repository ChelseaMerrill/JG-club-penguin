-- Phishing Quiz proof, against the #9 H1 fixture Player, in #121's
-- 80_beystadium_proof.sql style. Covers 20260928020000_phishing_quiz.sql's
-- decisions P1-P15.
--
-- What this proves: the guard schedule at fixed times (the same post for a
-- whole 600 s window, a different Room the next window, position 0 at the
-- epoch, the cycle wrapping) and that two signed-in Players see the same
-- post (P3, P4); every new table has RLS on and no client privilege (P2);
-- start_phishing_challenge returns exactly its documented keys and never
-- the correct choice, and no RPC result anywhere in this run carries one
-- (P5, P8); a correct answer pays 10 and passes the guard window, a wrong
-- answer or a timeout pays 0 and resets the streak, an answer after the
-- 23 s grace is a timeout even when right, a closed or unknown challenge is
-- rejected (P6); no question repeats until all 10 have been asked (P5); the
-- 11th correct answer in a New York day pays 0 and the next day pays again
-- (P7); Phish Fry is awarded through award_badge exactly once, at 10 in a
-- row, +50 once, badgesEarned only on that call (P11); a Map bypass counts
-- only for the guarded Room, with a challenge in the current window, not
-- passed, not locked; a correct answer resets the counter; the 5th locks,
-- training mode follows, and 3 correct answers unlock and reset (P9, P10);
-- phishing_state() reads it back (P12); as anon every function is denied,
-- and as authenticated the internal ones are (P14); each function is
-- security definer with search_path = '' and one overload, with EXECUTE
-- granted to authenticated for the five RPCs only.
--
-- One replacement before pasting into the Supabase SQL editor: replace every
-- occurrence of 00000000-0000-0000-0000-00000000f1f0 below with the real
-- fixture Player's id (the #9 H1 fixture), exactly as 27_rls_proof.sql
-- instructs. The "second Player" of the schedule check is a random signed-in
-- id; phishing_guard_now() reads no Player data.
--
-- This changes nothing: every check runs inside pg_temp.proof_146(), which
-- ends by raising and catching a sentinel exception, rolling back every
-- write the function made (the fixture's challenges, quiz state, Badge and
-- Tokens). It prints only booleans, counts and Token amounts -- no Player's
-- name, id or email.
--
-- The SQL editor shows only the last statement's result, so every check is
-- collected into one table by the final select below. Expected result:
-- every row has pass = true, including the final ALL row.

create or replace function pg_temp.proof_146(fixture uuid)
returns table (check_name text, pass boolean, detail text)
language plpgsql
as $$
declare
  v_names text[] := array[]::text[];
  v_pass boolean[] := array[]::boolean[];
  v_detail text[] := array[]::text[];
  -- Every jsonb any RPC returned in this run, for the P8 scan.
  v_seen jsonb[] := array[]::jsonb[];
  v_other uuid := gen_random_uuid();
  v_count int;
  v_err text;
  v_state text;
  v_ok boolean;
  v_a jsonb;
  v_b jsonb;
  v_c jsonb;
  v_expected jsonb;
  v_start jsonb;
  v_answer jsonb;
  v_answers jsonb[];
  v_bypass jsonb;
  v_step text;
  v_idx int;
  v_ids text[];
  v_tokens int;
  v_room text;
  v_other_room text;
  v_window timestamptz;
  v_available boolean;
  v_all boolean;
  v_total int;
  i int;
  v_start_keys constant text[] :=
    array['category', 'challengeId', 'choices', 'mode', 'prompt', 'questionId', 'secondsLeft'];
  v_answer_keys constant text[] :=
    array['badgesEarned', 'balance', 'bypassCount', 'correct', 'dailyCorrect', 'explanation',
          'locked', 'passedGuardWindow', 'streak', 'tokensAwarded', 'trainingCorrect'];
  v_state_keys constant text[] :=
    array['bypassCount', 'dailyCorrect', 'locked', 'passedGuardWindow', 'streak', 'trainingCorrect'];
begin
  begin
    -----------------------------------------------------------------------
    -- Preconditions, as postgres: the fixture has 1000 Tokens and no quiz
    -- history, state or Phish Fry Badge, so every run starts the same.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);

    select count(*) into v_count from public.players where id = fixture;
    if v_count <> 1 then
      raise exception 'fixture Player row not found for %', fixture;
    end if;

    delete from public.phishing_challenges where player_id = fixture;
    delete from public.phishing_player_state where player_id = fixture;
    delete from public.player_badges where player_id = fixture and badge_id = 'phish-fry';
    update public.players set tokens = 1000 where id = fixture;

    -- P11: Phish Fry is on in #138's catalog.
    select b.available into v_available from public.badges b where b.id = 'phish-fry';
    v_names := array_append(v_names, 'phish_fry_available_in_catalog');
    v_pass := array_append(v_pass, v_available is true);
    v_detail := array_append(v_detail, format('available=%s (expected true)', v_available));

    -----------------------------------------------------------------------
    -- P3/P4: the schedule at fixed times (phishing_guard_at, as postgres).
    -----------------------------------------------------------------------
    select count(*) into v_count from public.phishing_guard_posts;
    v_names := array_append(v_names, 'eight_guard_posts_seeded');
    v_pass := array_append(v_pass, v_count = 8);
    v_detail := array_append(v_detail, format('%s posts (expected 8)', v_count));

    v_a := public.phishing_guard_at('2026-09-28 14:00:00+00');
    v_b := public.phishing_guard_at('2026-09-28 14:09:59.999+00');
    v_c := public.phishing_guard_at('2026-09-28 14:10:00+00');
    v_names := array_append(v_names, 'same_post_for_the_whole_600s_window');
    v_pass := array_append(
      v_pass,
      v_a ->> 'roomId' = v_b ->> 'roomId'
        and v_a ->> 'doorLabel' = v_b ->> 'doorLabel'
        and (v_a ->> 'windowStart')::timestamptz = '2026-09-28 14:00:00+00'
        and (v_a ->> 'windowEnd')::timestamptz = '2026-09-28 14:10:00+00'
        and (v_b ->> 'windowStart')::timestamptz = '2026-09-28 14:00:00+00'
        and (v_a ->> 'serverNow')::timestamptz = '2026-09-28 14:00:00+00'
    );
    v_detail := array_append(v_detail, format('14:00 %s / 14:09:59 %s', v_a ->> 'roomId', v_b ->> 'roomId'));

    v_names := array_append(v_names, 'next_window_moves_to_another_room');
    v_pass := array_append(
      v_pass,
      v_c ->> 'roomId' <> v_a ->> 'roomId'
        and (v_c ->> 'windowStart')::timestamptz = '2026-09-28 14:10:00+00'
        and (v_c ->> 'windowEnd')::timestamptz = '2026-09-28 14:20:00+00'
    );
    v_detail := array_append(v_detail, format('14:00 %s, 14:10 %s', v_a ->> 'roomId', v_c ->> 'roomId'));

    -- floor(epoch / 600) mod 8: position 0 at the epoch, 7 in the 8th window,
    -- 0 again in the 9th.
    v_a := public.phishing_guard_at(to_timestamp(0));
    v_b := public.phishing_guard_at(to_timestamp(600 * 7 + 1));
    v_c := public.phishing_guard_at(to_timestamp(600 * 8 + 599));
    v_names := array_append(v_names, 'post_index_is_epoch_window_mod_count');
    v_pass := array_append(
      v_pass,
      v_a ->> 'roomId' = 'town-center' and v_a ->> 'doorLabel' = 'THE ICEBOX'
        and v_b ->> 'roomId' = 'roof-deck' and v_b ->> 'doorLabel' = 'KITCHEN'
        and v_c ->> 'roomId' = 'town-center' and v_c ->> 'doorLabel' = 'THE ICEBOX'
    );
    v_detail := array_append(v_detail, format('0: %s, 7: %s, 8: %s', v_a, v_b ->> 'doorLabel', v_c ->> 'doorLabel'));

    v_ok := true;
    for i in 0..8 loop
      v_a := public.phishing_guard_at(to_timestamp(600 * i));
      v_b := public.phishing_guard_at(to_timestamp(600 * (i + 1)));
      if v_a ->> 'roomId' = v_b ->> 'roomId' then
        v_ok := false;
      end if;
    end loop;
    v_names := array_append(v_names, 'consecutive_windows_never_share_a_room');
    v_pass := array_append(v_pass, v_ok);
    v_detail := array_append(v_detail, 'windows 0-9 checked, including the wrap');

    -- The post right now, for the signed-in checks below.
    v_expected := public.phishing_guard_at(now());
    v_room := v_expected ->> 'roomId';
    v_window := (v_expected ->> 'windowStart')::timestamptz;
    v_other_room := case when v_room = 'the-melt' then 'dev-pit' else 'the-melt' end;

    -----------------------------------------------------------------------
    -- P2: RLS on, no client privilege on any new table.
    -----------------------------------------------------------------------
    v_names := array_append(v_names, 'rls_on_every_new_table');
    v_pass := array_append(
      v_pass,
      (select count(*) = 4 and bool_and(c.relrowsecurity)
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('phishing_questions', 'phishing_guard_posts',
                           'phishing_player_state', 'phishing_challenges'))
    );
    v_detail := array_append(v_detail, 'pg_class.relrowsecurity checked');

    v_ok := true;
    foreach v_step in array array['public.phishing_questions', 'public.phishing_guard_posts',
                                  'public.phishing_player_state', 'public.phishing_challenges'] loop
      if has_table_privilege('anon', v_step, 'select, insert, update, delete')
        or has_table_privilege('authenticated', v_step, 'select, insert, update, delete') then
        v_ok := false;
      end if;
    end loop;
    v_names := array_append(v_names, 'no_client_privilege_on_any_new_table');
    v_pass := array_append(v_pass, v_ok);
    v_detail := array_append(v_detail, 'has_table_privilege checked for anon and authenticated');

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

    -- P3: two Players see the same post.
    v_a := public.phishing_guard_now();
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_other, 'role', 'authenticated')::text,
      true
    );
    v_b := public.phishing_guard_now();
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', fixture, 'role', 'authenticated')::text,
      true
    );
    v_seen := v_seen || v_a || v_b;
    v_names := array_append(v_names, 'two_players_see_the_same_post');
    v_pass := array_append(v_pass, v_a = v_b and v_a = v_expected);
    v_detail := array_append(v_detail, format('%s / %s', v_a ->> 'doorLabel', v_b ->> 'doorLabel'));

    -- P12: a Player with no quiz history reads as the defaults.
    v_a := public.phishing_state();
    v_seen := v_seen || v_a;
    v_names := array_append(v_names, 'fresh_state_is_defaults');
    v_pass := array_append(
      v_pass,
      array(select jsonb_object_keys(v_a) order by 1) = v_state_keys
        and v_a = '{"locked":false,"bypassCount":0,"trainingCorrect":0,"streak":0,"dailyCorrect":0,"passedGuardWindow":false}'::jsonb
    );
    v_detail := array_append(v_detail, v_a::text);

    -- P5/P8: the challenge's exact keys, never the correct choice.
    v_start := public.start_phishing_challenge();
    v_seen := v_seen || v_start;
    v_names := array_append(v_names, 'start_returns_exact_keys_no_correct_choice');
    v_pass := array_append(
      v_pass,
      array(select jsonb_object_keys(v_start) order by 1) = v_start_keys
        and v_start ->> 'mode' = 'guard'
        and (v_start ->> 'secondsLeft')::int = 20
        and jsonb_array_length(v_start -> 'choices') = 4
    );
    v_detail := array_append(v_detail, array_to_string(array(select jsonb_object_keys(v_start) order by 1), ','));

    -- P6: a correct answer pays 10 and passes the current guard window.
    perform set_config('role', 'postgres', true);
    select q.correct_index into v_idx from public.phishing_questions q where q.id = v_start ->> 'questionId';
    perform set_config('role', 'authenticated', true);
    v_answer := public.answer_phishing_question((v_start ->> 'challengeId')::uuid, v_idx);
    v_seen := v_seen || v_answer;
    v_names := array_append(v_names, 'correct_pays_10_and_passes_the_window');
    v_pass := array_append(
      v_pass,
      array(select jsonb_object_keys(v_answer) order by 1) = v_answer_keys
        and (v_answer ->> 'correct')::boolean
        and (v_answer ->> 'tokensAwarded')::int = 10
        and (v_answer ->> 'balance')::int = 1010
        and (v_answer ->> 'streak')::int = 1
        and (v_answer ->> 'dailyCorrect')::int = 1
        and (v_answer ->> 'passedGuardWindow')::boolean
        and v_answer -> 'badgesEarned' = '[]'::jsonb
        and length(v_answer ->> 'explanation') > 0
    );
    v_detail := array_append(v_detail, v_answer::text);

    -- P6: the challenge is closed; unknown ids and bad choices are rejected.
    v_err := null;
    begin
      perform public.answer_phishing_question((v_start ->> 'challengeId')::uuid, v_idx);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'second_answer_is_challenge_closed');
    v_pass := array_append(v_pass, v_err is not distinct from 'challenge_closed');
    v_detail := array_append(v_detail, format('err=%s', v_err));

    v_err := null;
    begin
      perform public.answer_phishing_question(gen_random_uuid(), 0);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'unknown_challenge_rejected');
    v_pass := array_append(v_pass, v_err is not distinct from 'unknown_challenge');
    v_detail := array_append(v_detail, format('err=%s', v_err));

    v_start := public.start_phishing_challenge();
    v_seen := v_seen || v_start;
    v_err := null;
    begin
      perform public.answer_phishing_question((v_start ->> 'challengeId')::uuid, 4);
    exception when others then
      v_err := sqlerrm;
    end;
    v_names := array_append(v_names, 'choice_out_of_range_rejected');
    v_pass := array_append(v_pass, v_err is not distinct from 'invalid_choice');
    v_detail := array_append(v_detail, format('err=%s', v_err));

    -- P6: wrong, timeout (null) and late (right, but after 23 s) all pay 0
    -- and reset the streak. The open challenge above is answered wrong.
    perform set_config('role', 'postgres', true);
    select q.correct_index into v_idx from public.phishing_questions q where q.id = v_start ->> 'questionId';
    perform set_config('role', 'authenticated', true);
    v_answer := public.answer_phishing_question((v_start ->> 'challengeId')::uuid, (v_idx + 1) % 4);
    v_seen := v_seen || v_answer;
    v_names := array_append(v_names, 'wrong_pays_0_and_resets_streak');
    v_pass := array_append(
      v_pass,
      not (v_answer ->> 'correct')::boolean
        and (v_answer ->> 'tokensAwarded')::int = 0
        and (v_answer ->> 'balance')::int = 1010
        and (v_answer ->> 'streak')::int = 0
    );
    v_detail := array_append(v_detail, v_answer::text);

    v_start := public.start_phishing_challenge();
    v_seen := v_seen || v_start;
    v_answer := public.answer_phishing_question((v_start ->> 'challengeId')::uuid, null);
    v_seen := v_seen || v_answer;
    v_names := array_append(v_names, 'timeout_pays_0');
    v_pass := array_append(
      v_pass,
      not (v_answer ->> 'correct')::boolean
        and (v_answer ->> 'tokensAwarded')::int = 0
        and (v_answer ->> 'streak')::int = 0
    );
    v_detail := array_append(v_detail, v_answer::text);

    v_start := public.start_phishing_challenge();
    v_seen := v_seen || v_start;
    perform set_config('role', 'postgres', true);
    select q.correct_index into v_idx from public.phishing_questions q where q.id = v_start ->> 'questionId';
    update public.phishing_challenges set started_at = now() - interval '24 seconds'
    where id = (v_start ->> 'challengeId')::uuid;
    perform set_config('role', 'authenticated', true);
    v_answer := public.answer_phishing_question((v_start ->> 'challengeId')::uuid, v_idx);
    v_seen := v_seen || v_answer;
    perform set_config('role', 'postgres', true);
    select c.outcome into v_state from public.phishing_challenges c where c.id = (v_start ->> 'challengeId')::uuid;
    perform set_config('role', 'authenticated', true);
    v_names := array_append(v_names, 'late_right_answer_counts_as_timeout');
    v_pass := array_append(
      v_pass,
      not (v_answer ->> 'correct')::boolean
        and (v_answer ->> 'tokensAwarded')::int = 0
        and v_state = 'timeout'
    );
    v_detail := array_append(v_detail, format('outcome=%s, %s', v_state, v_answer ->> 'tokensAwarded'));

    -- An open challenge is closed as a timeout by the next start.
    v_start := public.start_phishing_challenge();
    v_seen := v_seen || v_start;
    v_b := public.start_phishing_challenge();
    v_seen := v_seen || v_b;
    perform set_config('role', 'postgres', true);
    select c.outcome into v_state from public.phishing_challenges c where c.id = (v_start ->> 'challengeId')::uuid;
    select count(*) into v_count from public.phishing_challenges c
    where c.player_id = fixture and c.outcome is null;
    perform set_config('role', 'authenticated', true);
    v_names := array_append(v_names, 'new_start_closes_the_open_challenge');
    v_pass := array_append(v_pass, v_state = 'timeout' and v_count = 1);
    v_detail := array_append(v_detail, format('previous=%s, open=%s', v_state, v_count));

    -----------------------------------------------------------------------
    -- P5: no repeats until all 10 have been asked.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);
    delete from public.phishing_challenges where player_id = fixture;
    delete from public.phishing_player_state where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_ids := array[]::text[];
    for i in 1..11 loop
      v_start := public.start_phishing_challenge();
      v_seen := v_seen || v_start;
      v_ids := array_append(v_ids, v_start ->> 'questionId');
    end loop;
    v_names := array_append(v_names, 'no_repeats_until_all_10_seen');
    v_pass := array_append(
      v_pass,
      (select count(distinct x) from unnest(v_ids[1:10]) as x) = 10
        and v_ids[11] <> v_ids[10]
    );
    v_detail := array_append(v_detail, format('first 10 distinct=%s, 11th=%s after %s',
      (select count(distinct x) from unnest(v_ids[1:10]) as x), v_ids[11], v_ids[10]));

    -----------------------------------------------------------------------
    -- P7/P11: the daily cap and Phish Fry.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);
    delete from public.phishing_challenges where player_id = fixture;
    delete from public.phishing_player_state where player_id = fixture;
    update public.players set tokens = 1000 where id = fixture;
    perform set_config('role', 'authenticated', true);
    v_answers := array[]::jsonb[];
    for i in 1..11 loop
      v_start := public.start_phishing_challenge();
      perform set_config('role', 'postgres', true);
      select q.correct_index into v_idx from public.phishing_questions q where q.id = v_start ->> 'questionId';
      perform set_config('role', 'authenticated', true);
      v_answer := public.answer_phishing_question((v_start ->> 'challengeId')::uuid, v_idx);
      v_answers := array_append(v_answers, v_answer);
      v_seen := v_seen || v_start || v_answer;
    end loop;

    v_names := array_append(v_names, 'ten_correct_pay_10_each');
    v_pass := array_append(
      v_pass,
      (select bool_and((a ->> 'tokensAwarded')::int = 10) from unnest(v_answers[1:10]) as a)
        and (v_answers[10] ->> 'dailyCorrect')::int = 10
    );
    v_detail := array_append(v_detail, format('10th dailyCorrect=%s', v_answers[10] ->> 'dailyCorrect'));

    v_names := array_append(v_names, 'eleventh_correct_in_a_ny_day_pays_0');
    v_pass := array_append(
      v_pass,
      (v_answers[11] ->> 'correct')::boolean
        and (v_answers[11] ->> 'tokensAwarded')::int = 0
        and (v_answers[11] ->> 'dailyCorrect')::int = 10
        and (v_answers[11] ->> 'balance')::int = (v_answers[10] ->> 'balance')::int
    );
    v_detail := array_append(v_detail, v_answers[11]::text);

    v_names := array_append(v_names, 'phish_fry_at_10_in_a_row_plus_50');
    v_pass := array_append(
      v_pass,
      v_answers[10] -> 'badgesEarned' = '["phish-fry"]'::jsonb
        and (v_answers[10] ->> 'streak')::int = 10
        and (v_answers[10] ->> 'balance')::int = 1000 + 100 + 50
        and (select bool_and(a -> 'badgesEarned' = '[]'::jsonb) from unnest(v_answers[1:9]) as a)
        and v_answers[11] -> 'badgesEarned' = '[]'::jsonb
    );
    v_detail := array_append(v_detail, format('10th=%s, 11th=%s, balance=%s',
      v_answers[10] -> 'badgesEarned', v_answers[11] -> 'badgesEarned', v_answers[10] ->> 'balance'));

    -- A new New York day pays again (the day's answers moved back a day).
    perform set_config('role', 'postgres', true);
    update public.phishing_challenges set answered_at = answered_at - interval '1 day'
    where player_id = fixture;
    perform set_config('role', 'authenticated', true);
    v_start := public.start_phishing_challenge();
    perform set_config('role', 'postgres', true);
    select q.correct_index into v_idx from public.phishing_questions q where q.id = v_start ->> 'questionId';
    perform set_config('role', 'authenticated', true);
    v_answer := public.answer_phishing_question((v_start ->> 'challengeId')::uuid, v_idx);
    v_seen := v_seen || v_start || v_answer;
    v_names := array_append(v_names, 'next_ny_day_pays_again');
    v_pass := array_append(
      v_pass,
      (v_answer ->> 'tokensAwarded')::int = 10 and (v_answer ->> 'dailyCorrect')::int = 1
    );
    v_detail := array_append(v_detail, v_answer::text);

    -- A wrong answer, then 10 more in a row: no second Phish Fry, no second +50.
    v_start := public.start_phishing_challenge();
    v_answer := public.answer_phishing_question((v_start ->> 'challengeId')::uuid, null);
    v_seen := v_seen || v_start || v_answer;
    v_answers := array[]::jsonb[];
    for i in 1..10 loop
      v_start := public.start_phishing_challenge();
      perform set_config('role', 'postgres', true);
      select q.correct_index into v_idx from public.phishing_questions q where q.id = v_start ->> 'questionId';
      perform set_config('role', 'authenticated', true);
      v_answer := public.answer_phishing_question((v_start ->> 'challengeId')::uuid, v_idx);
      v_answers := array_append(v_answers, v_answer);
      v_seen := v_seen || v_start || v_answer;
    end loop;
    perform set_config('role', 'postgres', true);
    select count(*) into v_count from public.player_badges
    where player_id = fixture and badge_id = 'phish-fry';
    select p.tokens into v_tokens from public.players p where p.id = fixture;
    perform set_config('role', 'authenticated', true);
    v_names := array_append(v_names, 'phish_fry_awarded_exactly_once');
    v_pass := array_append(
      v_pass,
      v_count = 1
        and (v_answers[10] ->> 'streak')::int = 10
        and (select bool_and(a -> 'badgesEarned' = '[]'::jsonb) from unnest(v_answers) as a)
        -- 1000 + 10 x 10 + 50 (day 1) + 10 (day 2, first) + 9 x 10 (day 2, cap at 10)
        and v_tokens = 1000 + 100 + 50 + 10 + 90
    );
    v_detail := array_append(v_detail, format('badges=%s, tokens=%s', v_count, v_tokens));

    -----------------------------------------------------------------------
    -- P9/P10: Map bypasses, the lockout and Security Training.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);
    delete from public.phishing_challenges where player_id = fixture;
    delete from public.phishing_player_state where player_id = fixture;
    perform set_config('role', 'authenticated', true);

    v_bypass := public.record_map_bypass(v_room);
    v_seen := v_seen || v_bypass;
    v_names := array_append(v_names, 'bypass_without_a_challenge_not_counted');
    v_pass := array_append(
      v_pass,
      not (v_bypass ->> 'counted')::boolean and (v_bypass ->> 'bypassCount')::int = 0
    );
    v_detail := array_append(v_detail, v_bypass::text);

    v_start := public.start_phishing_challenge();
    v_seen := v_seen || v_start;
    v_bypass := public.record_map_bypass(v_other_room);
    v_seen := v_seen || v_bypass;
    v_names := array_append(v_names, 'bypass_from_an_unguarded_room_not_counted');
    v_pass := array_append(
      v_pass,
      not (v_bypass ->> 'counted')::boolean and (v_bypass ->> 'bypassCount')::int = 0
    );
    v_detail := array_append(v_detail, format('%s: %s', v_other_room, v_bypass));

    v_bypass := public.record_map_bypass(v_room);
    v_seen := v_seen || v_bypass;
    v_names := array_append(v_names, 'bypass_with_an_open_challenge_counted');
    v_pass := array_append(
      v_pass,
      (v_bypass ->> 'counted')::boolean and (v_bypass ->> 'bypassCount')::int = 1
    );
    v_detail := array_append(v_detail, v_bypass::text);

    perform set_config('role', 'postgres', true);
    select q.correct_index into v_idx from public.phishing_questions q where q.id = v_start ->> 'questionId';
    perform set_config('role', 'authenticated', true);
    v_answer := public.answer_phishing_question((v_start ->> 'challengeId')::uuid, (v_idx + 1) % 4);
    v_bypass := public.record_map_bypass(v_room);
    v_seen := v_seen || v_answer || v_bypass;
    v_names := array_append(v_names, 'bypass_after_a_wrong_answer_counted');
    v_pass := array_append(
      v_pass,
      (v_bypass ->> 'counted')::boolean and (v_bypass ->> 'bypassCount')::int = 2
    );
    v_detail := array_append(v_detail, v_bypass::text);

    v_start := public.start_phishing_challenge();
    perform set_config('role', 'postgres', true);
    select q.correct_index into v_idx from public.phishing_questions q where q.id = v_start ->> 'questionId';
    perform set_config('role', 'authenticated', true);
    v_answer := public.answer_phishing_question((v_start ->> 'challengeId')::uuid, v_idx);
    v_seen := v_seen || v_start || v_answer;
    v_bypass := public.record_map_bypass(v_room);
    v_seen := v_seen || v_bypass;
    v_names := array_append(v_names, 'correct_answer_resets_counter_and_passes');
    v_pass := array_append(
      v_pass,
      (v_answer ->> 'bypassCount')::int = 0
        and (v_answer ->> 'passedGuardWindow')::boolean
        and not (v_bypass ->> 'counted')::boolean
        and (v_bypass ->> 'bypassCount')::int = 0
    );
    v_detail := array_append(v_detail, format('answer bypassCount=%s, then %s', v_answer ->> 'bypassCount', v_bypass));

    -- Challenges from an earlier window don't count: moved back one window,
    -- the fixture is no longer passed and no longer challenged.
    perform set_config('role', 'postgres', true);
    update public.phishing_challenges
    set guard_window_start = v_window - interval '600 seconds'
    where player_id = fixture and mode = 'guard';
    perform set_config('role', 'authenticated', true);
    v_bypass := public.record_map_bypass(v_room);
    v_seen := v_seen || v_bypass;
    v_names := array_append(v_names, 'challenge_from_an_earlier_window_not_counted');
    v_pass := array_append(v_pass, not (v_bypass ->> 'counted')::boolean);
    v_detail := array_append(v_detail, v_bypass::text);

    -- A timed-out challenge in this window, then five bypasses: the 5th locks.
    v_start := public.start_phishing_challenge();
    v_answer := public.answer_phishing_question((v_start ->> 'challengeId')::uuid, null);
    v_seen := v_seen || v_start || v_answer;
    v_answers := array[]::jsonb[];
    for i in 1..6 loop
      v_bypass := public.record_map_bypass(v_room);
      v_answers := array_append(v_answers, v_bypass);
      v_seen := v_seen || v_bypass;
    end loop;
    v_names := array_append(v_names, 'fifth_counted_bypass_locks_the_map');
    v_pass := array_append(
      v_pass,
      (select bool_and((b ->> 'counted')::boolean) from unnest(v_answers[1:5]) as b)
        and (v_answers[4] ->> 'bypassCount')::int = 4
        and not (v_answers[4] ->> 'locked')::boolean
        and (v_answers[5] ->> 'bypassCount')::int = 5
        and (v_answers[5] ->> 'locked')::boolean
        and not (v_answers[6] ->> 'counted')::boolean
        and (v_answers[6] ->> 'bypassCount')::int = 5
    );
    v_detail := array_append(v_detail, format('4th=%s, 5th=%s, 6th=%s', v_answers[4], v_answers[5], v_answers[6]));

    v_a := public.phishing_state();
    v_seen := v_seen || v_a;
    perform set_config('role', 'postgres', true);
    select count(*) into v_count from public.phishing_player_state s
    where s.player_id = fixture and s.locked;
    perform set_config('role', 'authenticated', true);
    v_names := array_append(v_names, 'lockout_is_saved_and_read_back');
    v_pass := array_append(
      v_pass,
      v_count = 1 and (v_a ->> 'locked')::boolean and (v_a ->> 'bypassCount')::int = 5
        and (v_a ->> 'trainingCorrect')::int = 0
    );
    v_detail := array_append(v_detail, v_a::text);

    -- Training: correct, wrong, correct, correct -> unlocked on the 3rd correct.
    v_answers := array[]::jsonb[];
    foreach v_step in array array['correct', 'wrong', 'correct', 'correct'] loop
      v_start := public.start_phishing_challenge();
      perform set_config('role', 'postgres', true);
      select q.correct_index into v_idx from public.phishing_questions q where q.id = v_start ->> 'questionId';
      perform set_config('role', 'authenticated', true);
      v_answer := public.answer_phishing_question(
        (v_start ->> 'challengeId')::uuid,
        case when v_step = 'correct' then v_idx else (v_idx + 1) % 4 end
      );
      v_answers := array_append(v_answers, v_start);
      v_answers := array_append(v_answers, v_answer);
      v_seen := v_seen || v_start || v_answer;
    end loop;
    v_names := array_append(v_names, 'locked_challenges_are_training_mode');
    v_pass := array_append(
      v_pass,
      v_answers[1] ->> 'mode' = 'training' and v_answers[7] ->> 'mode' = 'training'
    );
    v_detail := array_append(v_detail, format('%s / %s', v_answers[1] ->> 'mode', v_answers[7] ->> 'mode'));

    v_names := array_append(v_names, 'training_progress_counts_correct_answers');
    v_pass := array_append(
      v_pass,
      (v_answers[2] ->> 'trainingCorrect')::int = 1
        and (v_answers[2] ->> 'locked')::boolean
        and (v_answers[2] ->> 'tokensAwarded')::int = 10
        and (v_answers[4] ->> 'trainingCorrect')::int = 1
        and (v_answers[6] ->> 'trainingCorrect')::int = 2
        and (v_answers[6] ->> 'locked')::boolean
    );
    v_detail := array_append(v_detail, format('%s, %s, %s', v_answers[2] ->> 'trainingCorrect',
      v_answers[4] ->> 'trainingCorrect', v_answers[6] ->> 'trainingCorrect'));

    v_names := array_append(v_names, 'three_training_correct_unlock_and_reset');
    v_pass := array_append(
      v_pass,
      not (v_answers[8] ->> 'locked')::boolean
        and (v_answers[8] ->> 'bypassCount')::int = 0
        and (v_answers[8] ->> 'trainingCorrect')::int = 0
        -- A training answer never passes the guarded door.
        and not (v_answers[8] ->> 'passedGuardWindow')::boolean
    );
    v_detail := array_append(v_detail, v_answers[8]::text);

    v_start := public.start_phishing_challenge();
    v_seen := v_seen || v_start;
    v_names := array_append(v_names, 'unlocked_challenges_are_guard_mode_again');
    v_pass := array_append(v_pass, v_start ->> 'mode' = 'guard');
    v_detail := array_append(v_detail, v_start ->> 'mode');

    -- P14: the internal helpers and award_badge are closed to a Player.
    v_count := 0;
    foreach v_step in array array[
      'select public.phishing_guard_at(now())',
      'select public.phishing_state_for(auth.uid(), now())',
      'select public.award_badge(auth.uid(), ''phish-fry'')',
      'select count(*) from public.phishing_questions',
      'select count(*) from public.phishing_challenges'
    ] loop
      v_state := null;
      begin
        execute v_step;
      exception when others then
        v_state := sqlstate;
      end;
      if v_state is not distinct from '42501' then
        v_count := v_count + 1;
      end if;
    end loop;
    v_names := array_append(v_names, 'authenticated_denied_internals_and_tables');
    v_pass := array_append(v_pass, v_count = 5);
    v_detail := array_append(v_detail, format('%s of 5 denied (42501)', v_count));

    -----------------------------------------------------------------------
    -- P8: no RPC result in this run carried a correct choice.
    -----------------------------------------------------------------------
    v_ok := true;
    for i in 1..coalesce(array_length(v_seen, 1), 0) loop
      if v_seen[i]::text ~* 'correct_?index|correctchoice|correct_choice|"answer"' then
        v_ok := false;
      end if;
    end loop;
    v_names := array_append(v_names, 'no_rpc_result_carries_the_correct_choice');
    v_pass := array_append(v_pass, v_ok and array_length(v_seen, 1) > 50);
    v_detail := array_append(v_detail, format('%s results scanned', array_length(v_seen, 1)));

    -----------------------------------------------------------------------
    -- As anon (no sub claim): every function is denied.
    -----------------------------------------------------------------------
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'anon', true);
    v_count := 0;
    foreach v_step in array array[
      'select public.phishing_guard_now()',
      'select public.phishing_state()',
      'select public.start_phishing_challenge()',
      'select public.answer_phishing_question(gen_random_uuid(), 0)',
      'select public.record_map_bypass(''town-center'')',
      'select public.phishing_guard_at(now())',
      'select public.phishing_state_for(gen_random_uuid(), now())',
      'select public.award_badge(gen_random_uuid(), ''phish-fry'')'
    ] loop
      v_state := null;
      begin
        execute v_step;
      exception when others then
        v_state := sqlstate;
      end;
      if v_state is not distinct from '42501' then
        v_count := v_count + 1;
      end if;
    end loop;
    v_names := array_append(v_names, 'anon_denied_every_function');
    v_pass := array_append(v_pass, v_count = 8);
    v_detail := array_append(v_detail, format('%s of 8 denied (42501)', v_count));

    -----------------------------------------------------------------------
    -- P14: definer, locked search_path, one overload, grants.
    -----------------------------------------------------------------------
    perform set_config('role', 'postgres', true);
    v_names := array_append(v_names, 'one_overload_each_security_definer_search_path_locked');
    v_pass := array_append(
      v_pass,
      (select count(*) = 7
         and bool_and(p.prosecdef)
         and bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
       from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('phishing_guard_at', 'phishing_state_for', 'phishing_guard_now',
                           'phishing_state', 'start_phishing_challenge',
                           'answer_phishing_question', 'record_map_bypass'))
    );
    v_detail := array_append(v_detail, 'pg_proc prosecdef/proconfig checked for all seven');

    v_names := array_append(v_names, 'execute_granted_to_authenticated_for_the_five_rpcs_only');
    v_pass := array_append(
      v_pass,
      has_function_privilege('authenticated', 'public.phishing_guard_now()', 'execute')
        and has_function_privilege('authenticated', 'public.phishing_state()', 'execute')
        and has_function_privilege('authenticated', 'public.start_phishing_challenge()', 'execute')
        and has_function_privilege('authenticated', 'public.answer_phishing_question(uuid, int)', 'execute')
        and has_function_privilege('authenticated', 'public.record_map_bypass(text)', 'execute')
        and not has_function_privilege('anon', 'public.phishing_guard_now()', 'execute')
        and not has_function_privilege('anon', 'public.phishing_state()', 'execute')
        and not has_function_privilege('anon', 'public.start_phishing_challenge()', 'execute')
        and not has_function_privilege('anon', 'public.answer_phishing_question(uuid, int)', 'execute')
        and not has_function_privilege('anon', 'public.record_map_bypass(text)', 'execute')
        and not has_function_privilege('authenticated', 'public.phishing_guard_at(timestamptz)', 'execute')
        and not has_function_privilege('anon', 'public.phishing_guard_at(timestamptz)', 'execute')
        and not has_function_privilege('authenticated', 'public.phishing_state_for(uuid, timestamptz)', 'execute')
        and not has_function_privilege('anon', 'public.phishing_state_for(uuid, timestamptz)', 'execute')
        and not has_function_privilege('authenticated', 'public.award_badge(uuid, text)', 'execute')
    );
    v_detail := array_append(v_detail, 'has_function_privilege checked for both roles');

    -- Every check is done. Roll back everything this function wrote.
    raise exception 'proof_146_rollback';
  exception
    when others then
      if sqlerrm <> 'proof_146_rollback' then
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

select * from pg_temp.proof_146('00000000-0000-0000-0000-00000000f1f0'::uuid);
