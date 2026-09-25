-- In-game feedback (owner request, Track D): the public.feedback table and
-- one function, submit_feedback(kind, message, room_id, client_info).
--
-- Runs after 20260925000000_quests.sql and needs only #9's
-- 20260924000000_players.sql. Apply by pasting into the Supabase SQL editor
-- (no CLI). Safe to rerun. Proved by supabase/tests/feedback_proof.sql
-- (run under PGlite by src/persistence/sql-feedback.test.ts).
--
-- Decisions (for the red-team review):
--
-- F1 Write path. A Player submits only through submit_feedback(), a
-- security-definer function. The table has RLS on, NO policies, and every
-- privilege revoked from anon and authenticated: no client can select,
-- insert, update or delete a row directly, so nobody can read anyone's
-- feedback (their own included) from the browser. Only the function (owned
-- by postgres) writes; only the service role (the feedback-email Edge
-- Function) reads a row's Player name and sets emailed_at.
--
-- F2 Identity. player_id is always auth.uid(); there is no player id
-- argument. player_id references public.players ON DELETE CASCADE, like
-- every other per-Player table (#27, #46): feedback is free text a Player
-- wrote and may contain personal details, so it goes when their account
-- goes. The owner still has the emailed copy; "on delete set null" was
-- rejected because it would keep a deleted Player's words with no owner to
-- ask about them. player_id is NOT NULL so the rate limit can't be dodged.
--
-- F3 Validation (the server never trusts the modal's own checks):
--   kind         'issue' or 'suggestion'
--   message      trimmed of leading/trailing whitespace; 1..2000 characters
--   room_id      trimmed, blank -> null; at most 64 characters. Informational
--                only (which Room the Player was in); never used for access.
--   client_info  trimmed, blank -> null; at most 300 characters
-- The same limits are table checks too, so a later function can't bypass
-- them. The email escapes every field (supabase/functions/feedback-email),
-- so free text here is never HTML.
--
-- F4 Rate limit: at most 5 stored submissions per Player per rolling 10
-- minutes (created_at > now() - 10 min), counted before the insert. The
-- function locks the Player's row (`for update`, as record_round and
-- complete_quest do), so parallel calls from one Player run one after the
-- other and can't all pass the count together. Refused and invalid calls
-- store nothing and don't count. This bounds the owner's inbox (and Resend
-- usage) at 30 emails per Player per hour.
--
-- F5 Errors (the message is the code, as #27's functions):
--   not_authenticated (errcode 42501)  no auth.uid()
--   invalid_feedback                   any F3 rule fails
--   no_player                          no public.players row for the caller
--   feedback_rate_limited              F4's limit is reached; nothing stored
-- Mirrored by FeedbackErrorCode in src/feedback/feedback-client.ts.
--
-- F6 (the leaderboard migration's D5): `security definer`, `set search_path
-- = ''`, every relation schema-qualified, `#variable_conflict use_column`,
-- EXECUTE revoked from public/anon/authenticated and granted back to
-- authenticated only.
--
-- F7 Email. A Supabase Database Webhook (INSERT on public.feedback) calls
-- the feedback-email Edge Function, which checks a shared secret header
-- before anything else. The destination address lives only in that
-- function's secrets; it is not in this file or in client code. The webhook
-- is configured in the dashboard (see supabase/functions/feedback-email/
-- README.md), not here, so applying this migration alone sends no email.
-- emailed_at stays null until the function has sent the email, which makes
-- unsent feedback easy to find.
--
-- F8 Service role. Where a service_role role exists (real Supabase), its
-- privileges on the table are narrowed to what the Edge Function needs:
-- SELECT and UPDATE of emailed_at only.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null,
  message text not null,
  room_id text null,
  client_info text null,
  created_at timestamptz not null default now(),
  emailed_at timestamptz null
);

-- Named, re-added each run (see #27's note on inline checks and reruns).
alter table public.feedback drop constraint if exists feedback_kind_check;
alter table public.feedback
  add constraint feedback_kind_check check (kind in ('issue', 'suggestion'));
alter table public.feedback drop constraint if exists feedback_message_length;
alter table public.feedback
  add constraint feedback_message_length
  check (char_length(message) between 1 and 2000 and message = btrim(message, E' \t\r\n'));
alter table public.feedback drop constraint if exists feedback_room_id_length;
alter table public.feedback
  add constraint feedback_room_id_length check (room_id is null or char_length(room_id) <= 64);
alter table public.feedback drop constraint if exists feedback_client_info_length;
alter table public.feedback
  add constraint feedback_client_info_length
  check (client_info is null or char_length(client_info) <= 300);

-- F4's count: one Player's recent rows.
create index if not exists feedback_player_created_at_idx
  on public.feedback (player_id, created_at desc);

-- F1: RLS on and no policies, so even a stray grant would expose no rows.
alter table public.feedback enable row level security;

revoke all on public.feedback from public, anon, authenticated;

-- F8: only where the role exists (real Supabase); the local stub has none.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on public.feedback from service_role;
    grant select on public.feedback to service_role;
    grant update (emailed_at) on public.feedback to service_role;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- submit_feedback(kind, message, room_id, client_info)
--
-- Validates (F3), rate-limits (F4) and stores one submission for the caller.
-- Returns { id }. Errors: not_authenticated, invalid_feedback, no_player,
-- feedback_rate_limited (F5).
-- ---------------------------------------------------------------------------

create or replace function public.submit_feedback(
  kind text,
  message text,
  room_id text,
  client_info text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_kind text := submit_feedback.kind;
  v_message text := btrim(submit_feedback.message, E' \t\r\n');
  v_room text := nullif(btrim(submit_feedback.room_id, E' \t\r\n'), '');
  v_client text := nullif(btrim(submit_feedback.client_info, E' \t\r\n'), '');
  v_recent int;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_kind is null
    or v_kind not in ('issue', 'suggestion')
    or v_message is null
    or char_length(v_message) < 1
    or char_length(v_message) > 2000
    or (v_room is not null and char_length(v_room) > 64)
    or (v_client is not null and char_length(v_client) > 300)
  then
    raise exception 'invalid_feedback';
  end if;

  -- Lock the Player's row so one Player's parallel calls count one at a time.
  perform 1 from public.players p where p.id = v_uid for update;
  if not found then
    raise exception 'no_player';
  end if;

  select count(*) into v_recent
  from public.feedback f
  where f.player_id = v_uid
    and f.created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception 'feedback_rate_limited';
  end if;

  insert into public.feedback (player_id, kind, message, room_id, client_info)
  values (v_uid, v_kind, v_message, v_room, v_client)
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and Supabase adds anon and
-- authenticated. Only signed-in Players may call this. If the signature ever
-- changes, add `drop function if exists` for the old one first.
revoke all on function public.submit_feedback(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_feedback(text, text, text, text) to authenticated;
