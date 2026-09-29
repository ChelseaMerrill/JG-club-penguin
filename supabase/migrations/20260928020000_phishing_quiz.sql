-- Phishing Quiz (#146): Anthony Conway (Director of IT) guards one door of
-- one shared prototype Room at a time and asks each Player a security
-- question before they may pass (`design/Minigame Phishing Quiz.dc.html`,
-- unbranded). Correct answers pay Tokens, earn the Phish Fry Badge (#138)
-- at 10 in a row, and using the Map to slip past him leads to a Security
-- Training lockout.
--
-- Runs after 20260928000000_beystadium.sql (#121) and needs #9's
-- 20260924000000_players.sql, #27's 20260924010000_saved_progress.sql and
-- #138's 20260927000000_badges.sql (public.badges, public.award_badge).
-- 20260928010000 is reserved by the feedback branch (#178); this file sorts
-- after it. Apply by pasting into the Supabase SQL editor (no CLI). Safe to
-- rerun. Proof: supabase/tests/146_phishing_proof.sql (run in PGlite by
-- src/persistence/sql-phishing.test.ts; the reviewer re-runs it on real
-- Postgres/Supabase).
--
-- Deploy order (#138 D15): apply this migration before the client that
-- calls these functions merges or deploys (including a Vercel preview). The
-- client degrades without it (no Anthony, no quiz): every RPC below fails
-- and the client logs it.
--
-- Decisions for red-team review (#146; owner-approved defaults 2026-09-25).
-- Each is numbered so a review comment can cite it.
--
-- P1 Scope. Four new tables (phishing_questions, phishing_guard_posts,
-- phishing_player_state, phishing_challenges), seven new functions (five
-- client-callable RPCs and two internal helpers) and one catalog update
-- (P11). No existing table, column, policy, grant or function is changed;
-- record_round, complete_quest and award_badge are not redefined.
--
-- P2 Every new table has RLS enabled with no policies, and every privilege
-- is revoked from public, anon and authenticated (Supabase's default
-- privileges grant them everything on a new table, so the revokes are
-- load-bearing). No client role can read or write any of them directly:
-- only the security-definer functions below touch them. In particular
-- phishing_questions.correct_index is never readable by a client (P8).
--
-- P3 Guard schedule, server-side and job-free. phishing_guard_posts is an
-- ordered list (position 0..n-1) of (room_id, door_label): every enabled
-- door (targetRoomId !== null) of the four shared prototype Rooms, not the
-- Igloo (it's private). The post for time t is the row at offset
-- floor(epoch(t) / 600) mod n, so every Player sees the same post, and it
-- moves every 10 minutes, with no scheduled job. The order interleaves the
-- Rooms so consecutive windows (including the wrap from the last post to the
-- first) are always in different Rooms. src/phishing/guard-posts.test.ts
-- fails if a seeded door no longer exists or is disabled in the client's
-- Room definitions. The seed is replaced on every run (delete + insert).
--
-- P4 Time is injectable for proofs only: public.phishing_guard_at(at_time)
-- computes the post for any time; public.phishing_guard_now() is
-- phishing_guard_at(now()). phishing_guard_at is internal (no client
-- grant): a client can only ever ask about "now". It returns { roomId,
-- doorLabel, windowStart, windowEnd, serverNow } (ISO timestamps).
--
-- P5 Challenges. start_phishing_challenge() (no arguments; identity from
-- auth.uid() only) picks the next question this Player hasn't seen, at
-- random, from phishing_player_state.seen_question_ids; after all 10 have
-- been seen the set resets (and the question just asked last is skipped once,
-- so a reset never repeats back to back). It records an open challenge
-- (player, question, started_at = now(), mode, and for mode 'guard' the
-- current guard window's start) and returns { challengeId, questionId,
-- category, prompt, choices (4 texts, A-D), secondsLeft: 20, mode }. mode is
-- 'training' while the Player is locked out (P10), else 'guard'. Starting a
-- challenge closes any still-open one of this Player's as a timeout (P6), so
-- a Player has at most one open challenge and can't hold several questions
-- open to pick from.
--
-- P6 Scoring. answer_phishing_question(challenge_id, choice) scores one of
-- the caller's own open challenges: choice 0-3 (A-D) or null (the client's
-- 20 s timer ran out). Null, or an answer more than 23 s after started_at
-- (the 20 s timer plus 3 s grace for latency), is a timeout; a choice other
-- than correct_index is wrong. The challenge is closed either way (a second
-- answer is challenge_closed). A correct answer pays +10 Tokens unless the
-- Player already has 10 paid correct answers on the same America/New_York
-- calendar day (P7). The streak counts correct answers in a row (any mode)
-- and resets to 0 on a wrong answer or timeout. It returns { correct,
-- explanation, tokensAwarded, balance, streak, dailyCorrect, bypassCount,
-- locked, trainingCorrect, passedGuardWindow, badgesEarned }.
--
-- P7 Daily cap: at most 10 paid correct answers (100 Tokens) per Player per
-- America/New_York calendar day, counted from phishing_challenges rows
-- (outcome 'correct' and tokens_awarded > 0) by answered_at in New York
-- time. The 11th correct answer of the day is still scored correct (streak,
-- door, training) but pays 0. dailyCorrect is that day's count of paid
-- correct answers (0-10).
--
-- P8 Anti-cheat: the correct choice never leaves the database. No function
-- returns correct_index or any field derived from it other than the
-- caller's own `correct` boolean after answering; the explanation text is
-- returned after answering (by design). The Tokens are computed here, never
-- sent by the client. Residual risk, stated plainly: a Player can learn the
-- answers by playing (that is the training), and a scripted client can
-- answer instantly; the daily cap bounds what that earns (100 Tokens a day,
-- plus the one-time +50 for Phish Fry).
--
-- P9 Map bypass. record_map_bypass(room_id) is called by the client when
-- the Player uses the Map to leave room_id. It counts only if (a) the
-- Player isn't locked out, (b) Anthony is guarding room_id right now (P3),
-- (c) the Player has a 'guard' challenge in the current guard window, and
-- (d) the Player hasn't passed the current window (no correct 'guard'
-- answer in it) -- i.e. challenged and not passed: open, wrong or timed
-- out. Leaving by a door never calls it. Any correct answer resets the
-- counter to 0 (P10 for the locked case). The counter lives in
-- phishing_player_state.bypass_count. Returns phishing_state()'s object plus
-- `counted`. A Player can only ever count bypasses against themselves.
--
-- P10 Lockout and Security Training. The 5th counted bypass sets locked =
-- true (the client disables the Map and shows "Security Training is
-- Required!"). While locked, every correct answer (in any mode) counts
-- toward trainingCorrect instead of resetting the bypass counter; the 3rd
-- sets locked = false and resets both bypass_count and training_correct to
-- 0. Training answers pay the usual +10 within the daily cap (P7). The
-- lockout is a row in phishing_player_state, so it survives reloads and
-- sign-out. A training challenge never passes a guarded door.
--
-- P11 Phish Fry on: `update public.badges set available = true where id =
-- 'phish-fry'` (#138 seeded it coming soon; its insert never touches
-- `available` on conflict, so rerunning #138 keeps it on). When a correct
-- answer takes the streak to 10 or more, answer_phishing_question calls
-- public.award_badge(v_uid, 'phish-fry') (#138 D4): it awards once and pays
-- +50 once, and returns true only then; the id goes into badgesEarned only
-- on that call. The award runs before this answer's own Token update, whose
-- `returning` re-reads the balance, so the balance includes the +50 (#138's
-- order). No Badge check constraint is added: #138's
-- player_badges_badge_id_fkey decides which ids exist. The client mirrors
-- P11 in src/persistence/badge-catalog.ts.
--
-- P12 phishing_state() returns { locked, bypassCount, trainingCorrect,
-- streak, dailyCorrect, passedGuardWindow } for the caller (defaults for a
-- Player with no row yet), for load and reload. Read-only.
--
-- P13 Locking: every function that changes a Player's Tokens or quiz state
-- first locks that Player's public.players row `for update` (the same lock
-- record_round and complete_quest take, so it also serializes with them),
-- then the phishing_player_state row. Two parallel answers or bypasses
-- therefore can't double-pay, double-count or skip the cap.
--
-- P14 Security posture, unchanged from #27/#46/#70/#138: every function is
-- `security definer` with `set search_path = ''`, every relation
-- schema-qualified, `#variable_conflict use_column`, identity from
-- auth.uid() only in client-callable functions (no player id argument),
-- EXECUTE revoked from public/anon/authenticated and granted back to
-- authenticated only for the five RPCs. anon gets nothing (42501).
-- phishing_guard_at and phishing_state_for are internal (no grant), and
-- award_badge stays internal. Errors (the message is the code):
-- not_authenticated (42501), no_player, invalid_choice, unknown_challenge
-- (not found, or another Player's), challenge_closed, no_guard_posts,
-- invalid_time, and award_badge's unknown_badge / badge_unavailable.
--
-- P15 Ordering and reruns. Every statement is idempotent (create table if
-- not exists, enable RLS, revoke, upsert/replace seeds, create or replace,
-- a plain update, revoke/grant). Rerunning this file keeps every Player's
-- state and challenges; it refreshes the question texts and replaces the
-- guard-post list. Rerunning an earlier migration doesn't touch these
-- objects; #138's rule stays: after rerunning any earlier migration, rerun
-- every later one, in timestamp order.

-- ---------------------------------------------------------------------------
-- Tables (P2)
-- ---------------------------------------------------------------------------

create table if not exists public.phishing_questions (
  id text primary key,
  sort_order int not null unique,
  category text not null,
  prompt text not null,
  choices text[] not null check (array_length(choices, 1) = 4),
  correct_index int not null check (correct_index between 0 and 3),
  explanation text not null
);

create table if not exists public.phishing_guard_posts (
  position int primary key check (position >= 0),
  room_id text not null check (room_id in ('town-center', 'dev-pit', 'the-melt', 'roof-deck')),
  door_label text not null,
  unique (room_id, door_label)
);

create table if not exists public.phishing_player_state (
  player_id uuid primary key references public.players (id) on delete cascade,
  streak int not null default 0 check (streak >= 0),
  bypass_count int not null default 0 check (bypass_count between 0 and 5),
  locked boolean not null default false,
  training_correct int not null default 0 check (training_correct between 0 and 3),
  seen_question_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.phishing_challenges (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  question_id text not null references public.phishing_questions (id),
  mode text not null check (mode in ('guard', 'training')),
  guard_window_start timestamptz,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  choice int check (choice between 0 and 3),
  outcome text check (outcome in ('correct', 'wrong', 'timeout')),
  tokens_awarded int not null default 0 check (tokens_awarded in (0, 10)),
  constraint phishing_challenges_guard_window_check
    check ((mode = 'guard') = (guard_window_start is not null)),
  constraint phishing_challenges_answered_check
    check ((outcome is null) = (answered_at is null))
);

create index if not exists phishing_challenges_player_started_idx
  on public.phishing_challenges (player_id, started_at desc);
create index if not exists phishing_challenges_player_window_idx
  on public.phishing_challenges (player_id, guard_window_start);

alter table public.phishing_questions enable row level security;
alter table public.phishing_guard_posts enable row level security;
alter table public.phishing_player_state enable row level security;
alter table public.phishing_challenges enable row level security;

revoke all on table public.phishing_questions from public, anon, authenticated;
revoke all on table public.phishing_guard_posts from public, anon, authenticated;
revoke all on table public.phishing_player_state from public, anon, authenticated;
revoke all on table public.phishing_challenges from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Question bank: the design's 10 questions and explanations, unbranded (P8).
-- choices are A-D in order; correct_index is 0-based.
-- ---------------------------------------------------------------------------

insert into public.phishing_questions (id, sort_order, category, prompt, choices, correct_index, explanation) values
  ('phishing-emails', 1, 'PHISHING EMAILS',
   'Which of the following is a primary indicator of a phishing email?',
   array[
     'The sender''s display name doesn''t match the actual email address domain.',
     'The email is sent during standard business hours.',
     'The email contains standard company branding.',
     'The message is addressed to your professional title.'
   ], 0,
   'Display name and real address not matching is a classic spoof. Branding, timing and titles are all easy to fake.'),
  ('social-engineering', 2, 'SOCIAL ENGINEERING',
   'What should you do if you receive an unexpected email from a coworker asking you to urgently purchase gift cards?',
   array[
     'Reply to the email asking for confirmation.',
     'Click the link in the email to verify the request.',
     'Independently verify the request by calling or messaging the coworker through a known, trusted channel.',
     'Forward the email to all company contacts as a warning.'
   ], 2,
   'Verify out-of-band. Replying or clicking talks to the attacker; mass-forwarding spreads the bait.'),
  ('links', 3, 'LINKS',
   'Before clicking a link in an email, the safest first step is to:',
   array[
     'Click it quickly so the page loads before it expires.',
     'Hover over it to preview the real destination URL.',
     'Check that the email has a company logo.',
     'Open it on your phone instead of your laptop.'
   ], 1,
   'Hovering shows where the link really goes. Logos prove nothing and phones are just as vulnerable.'),
  ('passwords', 4, 'PASSWORDS',
   'Which password practice is the strongest?',
   array[
     'One complex password reused across all accounts.',
     'A unique passphrase per account stored in a password manager, plus MFA.',
     'Your pet''s name followed by the current year.',
     'Writing passwords on a sticky note under the keyboard.'
   ], 1,
   'Unique passphrases plus multi-factor authentication limit the blast radius when one site leaks.'),
  ('removable-media', 5, 'REMOVABLE MEDIA',
   'You find a USB drive labeled "Payroll Q3" in the parking lot. What do you do?',
   array[
     'Plug it in to find the owner.',
     'Plug it into a spare laptop that is not on the network.',
     'Hand it to IT / Security without plugging it in anywhere.',
     'Throw it away.'
   ], 2,
   'Dropped drives are a known attack. Only IT should handle it, in a controlled environment.'),
  ('physical-security', 6, 'PHYSICAL SECURITY',
   'Someone in a delivery uniform asks you to hold the badge-locked door because their hands are full. You should:',
   array[
     'Hold the door; being helpful is part of the culture.',
     'Ask them to badge in or direct them to the front desk to sign in.',
     'Let them in but watch where they go.',
     'Take a photo of them first.'
   ], 1,
   'Tailgating relies on politeness. Everyone badges in or checks in at the front desk. No exceptions.'),
  ('urgency-pressure', 7, 'URGENCY & PRESSURE',
   'An email from "the CEO" says a wire transfer must go out in the next 10 minutes and to keep it confidential. The biggest red flag is:',
   array[
     'It mentions a wire transfer.',
     'It came from the CEO.',
     'The urgency plus secrecy combination.',
     'It arrived on a Friday.'
   ], 2,
   'Urgency and secrecy together are the signature of business email compromise. Slow down and verify.'),
  ('reporting', 8, 'REPORTING',
   'You clicked a link in a suspicious email before realizing it was phishing. What now?',
   array[
     'Delete the email and say nothing.',
     'Report it to IT / Security immediately, even though it is embarrassing.',
     'Change your password next week.',
     'Run antivirus and move on.'
   ], 1,
   'Fast reporting lets IT contain it. Nobody is in trouble for reporting; people are in trouble for hiding it.'),
  ('mfa', 9, 'MFA',
   'You receive an MFA approval prompt on your phone but you are not logging in anywhere. You should:',
   array[
     'Approve it so the notifications stop.',
     'Deny it and report it; someone has your password.',
     'Ignore it.',
     'Approve it once to see what happens.'
   ], 1,
   'That is MFA fatigue: an attacker already has your password and is hoping you tap Approve. Deny and report.'),
  ('smishing', 10, 'SMISHING',
   'A text says your package is held and links to a page asking for a $1.99 redelivery fee and your card number. This is most likely:',
   array[
     'A legitimate carrier notice.',
     'Smishing: an SMS phishing attempt to harvest card data.',
     'A billing error.',
     'A survey.'
   ], 1,
   'Carriers do not collect fees via random text links. The small amount is bait for your card details.')
on conflict (id) do update
  set sort_order = excluded.sort_order,
      category = excluded.category,
      prompt = excluded.prompt,
      choices = excluded.choices,
      correct_index = excluded.correct_index,
      explanation = excluded.explanation;

-- ---------------------------------------------------------------------------
-- Guard posts (P3): every enabled door of Town Center, Dev Pit, The Melt and
-- the Roof Deck, labels exactly as src/game/rooms/definitions/*.ts has them,
-- interleaved so neighbouring windows are always in different Rooms.
-- ---------------------------------------------------------------------------

delete from public.phishing_guard_posts;
insert into public.phishing_guard_posts (position, room_id, door_label) values
  (0, 'town-center', 'THE ICEBOX'),
  (1, 'dev-pit', 'THE ICEBOX'),
  (2, 'the-melt', 'TOWN CENTER'),
  (3, 'town-center', 'DEV PIT'),
  (4, 'dev-pit', 'TOWN CENTER'),
  (5, 'the-melt', 'ROOF DECK'),
  (6, 'town-center', 'ELEVATOR · ROOF DECK'),
  (7, 'roof-deck', 'KITCHEN');

-- ---------------------------------------------------------------------------
-- Phish Fry on (P11)
-- ---------------------------------------------------------------------------

update public.badges set available = true where id = 'phish-fry';

-- ---------------------------------------------------------------------------
-- phishing_guard_at(at_time) -> jsonb (P3, P4). Internal.
-- ---------------------------------------------------------------------------

create or replace function public.phishing_guard_at(at_time timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_at timestamptz := phishing_guard_at.at_time;
  v_count int;
  v_slot bigint;
  v_index int;
  v_room text;
  v_door text;
  v_start timestamptz;
begin
  if v_at is null then
    raise exception 'invalid_time';
  end if;

  select count(*) into v_count from public.phishing_guard_posts;
  if v_count = 0 then
    raise exception 'no_guard_posts';
  end if;

  v_slot := floor(extract(epoch from v_at) / 600)::bigint;
  -- A true modulo, so a time before 1970 still lands on a post.
  v_index := (((v_slot % v_count) + v_count) % v_count)::int;
  v_start := to_timestamp(v_slot * 600);

  select g.room_id, g.door_label into v_room, v_door
  from public.phishing_guard_posts g
  order by g.position
  offset v_index
  limit 1;

  return jsonb_build_object(
    'roomId', v_room,
    'doorLabel', v_door,
    'windowStart', v_start,
    'windowEnd', v_start + interval '600 seconds',
    'serverNow', v_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- phishing_state_for(player_id, at_time) -> jsonb (P12). Internal: the one
-- place the state object is built, for phishing_state, record_map_bypass
-- and answer_phishing_question.
-- ---------------------------------------------------------------------------

create or replace function public.phishing_state_for(player_id uuid, at_time timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_player uuid := phishing_state_for.player_id;
  v_at timestamptz := phishing_state_for.at_time;
  v_window timestamptz;
  v_streak int;
  v_bypass int;
  v_locked boolean;
  v_training int;
  v_daily int;
  v_passed boolean;
begin
  v_window := (public.phishing_guard_at(v_at) ->> 'windowStart')::timestamptz;

  -- A Player with no row yet reads as all defaults (nulls, coalesced below).
  select s.streak, s.bypass_count, s.locked, s.training_correct
    into v_streak, v_bypass, v_locked, v_training
  from public.phishing_player_state s
  where s.player_id = v_player;

  select count(*) into v_daily
  from public.phishing_challenges c
  where c.player_id = v_player
    and c.outcome = 'correct'
    and c.tokens_awarded > 0
    and (c.answered_at at time zone 'America/New_York')::date
      = (v_at at time zone 'America/New_York')::date;

  v_passed := exists (
    select 1 from public.phishing_challenges c
    where c.player_id = v_player
      and c.mode = 'guard'
      and c.guard_window_start = v_window
      and c.outcome = 'correct'
  );

  return jsonb_build_object(
    'locked', coalesce(v_locked, false),
    'bypassCount', coalesce(v_bypass, 0),
    'trainingCorrect', coalesce(v_training, 0),
    'streak', coalesce(v_streak, 0),
    'dailyCorrect', v_daily,
    'passedGuardWindow', v_passed
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- phishing_guard_now() -> jsonb (P3, P4). Client-callable.
-- Errors: not_authenticated, no_guard_posts.
-- ---------------------------------------------------------------------------

create or replace function public.phishing_guard_now()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return public.phishing_guard_at(now());
end;
$$;

-- ---------------------------------------------------------------------------
-- phishing_state() -> jsonb (P12). Client-callable, read-only.
-- Errors: not_authenticated.
-- ---------------------------------------------------------------------------

create or replace function public.phishing_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return public.phishing_state_for(v_uid, now());
end;
$$;

-- ---------------------------------------------------------------------------
-- start_phishing_challenge() -> jsonb (P5). Client-callable.
-- Returns { challengeId, questionId, category, prompt, choices, secondsLeft,
-- mode } -- never the correct choice (P8).
-- Errors: not_authenticated, no_player.
-- ---------------------------------------------------------------------------

create or replace function public.start_phishing_challenge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_locked boolean;
  v_seen text[];
  v_last text;
  v_closed int;
  v_mode text;
  v_window timestamptz;
  v_question record;
  v_challenge uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- P13: the Player's row first, then their quiz state.
  perform 1 from public.players p where p.id = v_uid for update;
  if not found then
    raise exception 'no_player';
  end if;

  insert into public.phishing_player_state (player_id) values (v_uid)
  on conflict (player_id) do nothing;

  select s.locked, s.seen_question_ids into v_locked, v_seen
  from public.phishing_player_state s
  where s.player_id = v_uid
  for update;

  -- P5: a still-open challenge is closed as a timeout (P6), which resets the
  -- streak like any other timeout.
  update public.phishing_challenges c
  set answered_at = now(), outcome = 'timeout'
  where c.player_id = v_uid and c.outcome is null;
  get diagnostics v_closed = row_count;

  -- P5: the next unseen question, at random; after all of them, start over
  -- (skipping the one asked last, once).
  select q.id, q.category, q.prompt, q.choices into v_question
  from public.phishing_questions q
  where not (q.id = any (v_seen))
  order by random()
  limit 1;
  if not found then
    v_last := v_seen[array_length(v_seen, 1)];
    v_seen := '{}';
    select q.id, q.category, q.prompt, q.choices into v_question
    from public.phishing_questions q
    where q.id is distinct from v_last
    order by random()
    limit 1;
  end if;

  v_mode := case when v_locked then 'training' else 'guard' end;
  if v_mode = 'guard' then
    v_window := (public.phishing_guard_at(now()) ->> 'windowStart')::timestamptz;
  end if;

  update public.phishing_player_state s
  set seen_question_ids = array_append(v_seen, v_question.id),
      streak = case when v_closed > 0 then 0 else s.streak end,
      updated_at = now()
  where s.player_id = v_uid;

  insert into public.phishing_challenges (player_id, question_id, mode, guard_window_start)
  values (v_uid, v_question.id, v_mode, v_window)
  returning id into v_challenge;

  return jsonb_build_object(
    'challengeId', v_challenge,
    'questionId', v_question.id,
    'category', v_question.category,
    'prompt', v_question.prompt,
    'choices', to_jsonb(v_question.choices),
    'secondsLeft', 20,
    'mode', v_mode
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- answer_phishing_question(challenge_id, choice) -> jsonb (P6, P7, P10, P11).
-- Client-callable. choice is 0-3 (A-D) or null (timed out).
-- Returns { correct, explanation, tokensAwarded, balance, streak,
-- dailyCorrect, bypassCount, locked, trainingCorrect, passedGuardWindow,
-- badgesEarned } -- never the correct choice (P8).
-- Errors: not_authenticated, invalid_choice, no_player, unknown_challenge,
-- challenge_closed, and award_badge's unknown_badge / badge_unavailable.
-- ---------------------------------------------------------------------------

create or replace function public.answer_phishing_question(challenge_id uuid, choice int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_challenge_id uuid := answer_phishing_question.challenge_id;
  v_choice int := answer_phishing_question.choice;
  v_challenge record;
  v_correct_index int;
  v_explanation text;
  v_outcome text;
  v_correct boolean;
  v_daily int;
  v_payout int := 0;
  v_streak int;
  v_bypass int;
  v_locked boolean;
  v_training int;
  v_balance int;
  v_badges text[] := '{}';
  v_state jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_choice is not null and (v_choice < 0 or v_choice > 3) then
    raise exception 'invalid_choice';
  end if;

  -- P13: the Player's row first, then the challenge, then their quiz state.
  perform 1 from public.players p where p.id = v_uid for update;
  if not found then
    raise exception 'no_player';
  end if;

  select c.id, c.question_id, c.started_at, c.outcome into v_challenge
  from public.phishing_challenges c
  where c.id = v_challenge_id and c.player_id = v_uid
  for update;
  if not found then
    raise exception 'unknown_challenge';
  end if;
  if v_challenge.outcome is not null then
    raise exception 'challenge_closed';
  end if;

  select q.correct_index, q.explanation into v_correct_index, v_explanation
  from public.phishing_questions q
  where q.id = v_challenge.question_id;

  -- P6: null, or later than the 20 s timer plus 3 s grace, is a timeout.
  if v_choice is null or now() - v_challenge.started_at > interval '23 seconds' then
    v_outcome := 'timeout';
  elsif v_choice = v_correct_index then
    v_outcome := 'correct';
  else
    v_outcome := 'wrong';
  end if;
  v_correct := v_outcome = 'correct';

  insert into public.phishing_player_state (player_id) values (v_uid)
  on conflict (player_id) do nothing;
  select s.streak, s.bypass_count, s.locked, s.training_correct
    into v_streak, v_bypass, v_locked, v_training
  from public.phishing_player_state s
  where s.player_id = v_uid
  for update;

  if v_correct then
    -- P7: at most 10 paid correct answers per New York calendar day.
    select count(*) into v_daily
    from public.phishing_challenges c
    where c.player_id = v_uid
      and c.outcome = 'correct'
      and c.tokens_awarded > 0
      and (c.answered_at at time zone 'America/New_York')::date
        = (now() at time zone 'America/New_York')::date;
    v_payout := case when v_daily < 10 then 10 else 0 end;

    v_streak := v_streak + 1;
    if v_locked then
      -- P10: Security Training.
      v_training := v_training + 1;
      if v_training >= 3 then
        v_locked := false;
        v_training := 0;
        v_bypass := 0;
      end if;
    else
      -- P9: any correct answer resets the bypass counter.
      v_bypass := 0;
    end if;
  else
    v_streak := 0;
  end if;

  update public.phishing_player_state s
  set streak = v_streak,
      bypass_count = v_bypass,
      locked = v_locked,
      training_correct = v_training,
      updated_at = now()
  where s.player_id = v_uid;

  update public.phishing_challenges c
  set answered_at = now(),
      choice = v_choice,
      outcome = v_outcome,
      tokens_awarded = v_payout
  where c.id = v_challenge.id;

  -- P11: Phish Fry at 10 in a row, through #138's award_badge (once, +50 once).
  if v_correct and v_streak >= 10 then
    if public.award_badge(v_uid, 'phish-fry') then
      v_badges := array_append(v_badges, 'phish-fry');
    end if;
  end if;

  -- The balance is re-read here, after the award, so it includes the +50.
  update public.players p
  set tokens = p.tokens + v_payout
  where p.id = v_uid
  returning p.tokens into v_balance;

  v_state := public.phishing_state_for(v_uid, now());

  return jsonb_build_object(
    'correct', v_correct,
    'explanation', v_explanation,
    'tokensAwarded', v_payout,
    'balance', v_balance,
    'streak', v_state -> 'streak',
    'dailyCorrect', v_state -> 'dailyCorrect',
    'bypassCount', v_state -> 'bypassCount',
    'locked', v_state -> 'locked',
    'trainingCorrect', v_state -> 'trainingCorrect',
    'passedGuardWindow', v_state -> 'passedGuardWindow',
    'badgesEarned', to_jsonb(v_badges)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- record_map_bypass(room_id) -> jsonb (P9, P10). Client-callable.
-- Returns phishing_state()'s object plus `counted`.
-- Errors: not_authenticated, no_player.
-- ---------------------------------------------------------------------------

create or replace function public.record_map_bypass(room_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_room text := record_map_bypass.room_id;
  v_guard jsonb;
  v_window timestamptz;
  v_bypass int;
  v_locked boolean;
  v_counted boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform 1 from public.players p where p.id = v_uid for update;
  if not found then
    raise exception 'no_player';
  end if;

  insert into public.phishing_player_state (player_id) values (v_uid)
  on conflict (player_id) do nothing;
  select s.bypass_count, s.locked into v_bypass, v_locked
  from public.phishing_player_state s
  where s.player_id = v_uid
  for update;

  v_guard := public.phishing_guard_at(now());
  v_window := (v_guard ->> 'windowStart')::timestamptz;

  -- P9 (a)-(d).
  v_counted := not v_locked
    and v_room is not distinct from (v_guard ->> 'roomId')
    and exists (
      select 1 from public.phishing_challenges c
      where c.player_id = v_uid
        and c.mode = 'guard'
        and c.guard_window_start = v_window
    )
    and not exists (
      select 1 from public.phishing_challenges c
      where c.player_id = v_uid
        and c.mode = 'guard'
        and c.guard_window_start = v_window
        and c.outcome = 'correct'
    );

  if v_counted then
    v_bypass := least(v_bypass + 1, 5);
    -- P10: the 5th counted bypass locks the Map.
    update public.phishing_player_state s
    set bypass_count = v_bypass,
        locked = v_bypass >= 5,
        training_correct = 0,
        updated_at = now()
    where s.player_id = v_uid;
  end if;

  return public.phishing_state_for(v_uid, now())
    || jsonb_build_object('counted', v_counted);
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and Supabase adds anon and
-- authenticated (P14). The two helpers stay internal.
revoke all on function public.phishing_guard_at(timestamptz) from public, anon, authenticated;
revoke all on function public.phishing_state_for(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.phishing_guard_now() from public, anon, authenticated;
revoke all on function public.phishing_state() from public, anon, authenticated;
revoke all on function public.start_phishing_challenge() from public, anon, authenticated;
revoke all on function public.answer_phishing_question(uuid, int) from public, anon, authenticated;
revoke all on function public.record_map_bypass(text) from public, anon, authenticated;
grant execute on function public.phishing_guard_now() to authenticated;
grant execute on function public.phishing_state() to authenticated;
grant execute on function public.start_phishing_challenge() to authenticated;
grant execute on function public.answer_phishing_question(uuid, int) to authenticated;
grant execute on function public.record_map_bypass(text) to authenticated;
