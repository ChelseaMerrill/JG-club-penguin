-- Igloo Badge Quest (#143, part of #129): "Decorate your igloo with a JG
-- badge" -- talk to Casey Snow at the Igloo Gear stall, buy one of the three
-- JG award wall items (#135), and hang it on an igloo wall slot. Reward: 75
-- Tokens, paid once by the shared registry's `complete_quest` (no code
-- change there).
--
-- Runs after 20261006000000_quest_registry.sql (#143's own shared
-- foundation for #140, #141 and #143), and so after everything that
-- migration needs. A sibling Quest (#140 or #141) may land in a migration
-- between that one and this one, or after this one: this file touches only
-- its own row, its own function and its own column, so the order between
-- sibling Quest migrations never matters. Apply by pasting into the
-- Supabase SQL editor (no CLI). Safe to rerun. Proof:
-- supabase/tests/quest_igloo_badge_proof.sql (run in PGlite by
-- src/persistence/sql-quest-igloo-badge.test.ts; the reviewer re-runs it on
-- real Postgres/Supabase).
--
-- Deploy order (the registry's own rule): apply this migration before the
-- client that lists the 'igloo-badge' Quest merges or deploys (including a
-- Vercel preview). An old client on this schema keeps working (it never
-- reads `public.quests` at all); a new client on an old server (this
-- migration not yet applied) sees `questSteps['igloo-badge']` read as `{}`
-- (the registry's `quest_steps_for` fallback), so the Quest always shows
-- 0 / 3 and `complete_quest('igloo-badge')` always refuses with
-- `quest_incomplete` -- never paid early, never broken.
--
-- Decisions (execution packet for #143, 2026-10-06). Each is numbered so a
-- review comment can cite it.
--
-- I1 The registry row. `insert ... on conflict (id) do update` exactly as
-- the registry's own rule requires (R1): `('igloo-badge', 75)`.
--
-- I2 `quest_steps__igloo_badge(p_player)` (the registry's R2 convention:
-- security definer, `set search_path = ''`, stable, schema-qualified,
-- EXECUTE revoked from public/anon/authenticated, nothing granted back).
-- Its three steps, all worked out from data that already exists (Q1 of
-- #46's "earlier play counts" rule -- nothing here is session-only):
--   talk-to-casey  player_quest_state.casey_talked_at is not null (I3)
--   buy-jg-award   a player_items row whose item_id is one of the three JG
--                  award ids seeded by #135's igloo_wall_slots migration
--                  (award-bptw, award-inc5000, award-top-workplaces)
--   hang-jg-award  an igloo_slots row whose item_id is one of those same
--                  three ids. No placement/slot-range check is needed: all
--                  three awards are `placement = 'wall'` (#135), and
--                  igloo_slots_placement_guard already refuses an award in
--                  any slot of another placement (wrong_placement, 23514),
--                  so "the award is in *some* igloo_slots row" already
--                  means "the award is hung on a wall slot" -- there is no
--                  way to own an igloo_slots row for it otherwise.
--
-- I3 The "talk to Casey" flag, following #46's mark_dev_pit_visited()
-- pattern (Q2) exactly: a nullable timestamp,
-- player_quest_state.casey_talked_at, written only by
-- mark_casey_talked() (security definer, client-asserted, no Player id
-- argument -- always auth.uid()'s own row, so no caller can ever set it for
-- someone else), coalesced so the first call's time sticks. Kept
-- Casey-specific rather than a generic `mark_quest_npc_talked(quest_id)`:
-- this Quest has exactly one "talk to an NPC" step, a generic dispatcher
-- would need its own per-Quest table/column mapping for no present benefit,
-- and a plain, single-purpose function can't collide with a sibling Quest
-- migration (#140/#141) choosing a different shape for its own NPC-talked
-- state. Same residual risk as #46 Q2, stated there: at most one of three
-- steps of a one-time 75-Token reward is this client-asserted; the other
-- two (a real purchase, a real placement) are fully server-checked.
--
-- I4 No Badge branch here. Hanging an award also advances the Interior
-- Penguin Badge (#138 D5's igloo_slots trigger, unconditional on which item
-- is placed), but that already exists and needs no change from this Quest.
-- complete_quest's `badgesEarned` stays `[]` for 'igloo-badge' (only 'main'
-- awards Ship It, per the registry's R5) -- Interior Penguin, if newly
-- earned, is announced the normal way (the igloo_slots trigger + the next
-- Session Badge check), not through this Quest's own result.
--
-- I5 Never redefines complete_quest or quest_progress (the registry's own
-- rule): both already read public.quests and dispatch through
-- quest_steps_for, so this Quest is paid and reported as soon as its row,
-- its function and its column exist.
--
-- Rerun chain: rerunning this file re-adds the 'igloo-badge' row (refreshing
-- reward_tokens only) and replaces quest_steps__igloo_badge and
-- mark_casey_talked; it never touches complete_quest, quest_progress or any
-- other Quest's row/function. The registry's own rerun-chain notes still
-- apply to everything upstream of this file.
--
-- Conventions (the registry's own, from the leaderboard migration's D5):
-- every function is security definer with set search_path = '', every
-- relation schema-qualified, #variable_conflict use_column, identity from
-- auth.uid() only in client-callable functions, EXECUTE revoked from
-- public/anon/authenticated and granted back to authenticated only where
-- stated.

-- ---------------------------------------------------------------------------
-- public.quests: the 'igloo-badge' row (I1)
-- ---------------------------------------------------------------------------

-- Mirrored by the 'igloo-badge' entry in src/quests/quest-definitions.ts
-- (rewardTokens) and in src/persistence/in-memory-steps-quests.ts.
insert into public.quests (id, reward_tokens) values
  ('igloo-badge', 75)
on conflict (id) do update
  set reward_tokens = excluded.reward_tokens;

-- ---------------------------------------------------------------------------
-- player_quest_state.casey_talked_at (I3), written only by
-- mark_casey_talked() below. Additive: #140/#141 may add their own columns
-- to this same table in a sibling migration without conflict.
-- ---------------------------------------------------------------------------

alter table public.player_quest_state
  add column if not exists casey_talked_at timestamptz null;

-- ---------------------------------------------------------------------------
-- mark_casey_talked() (I3)
--
-- Records the caller's first "talk to Casey" moment at the server's now();
-- a later call keeps the first time. No Player id argument: always the
-- caller's own row. Errors: not_authenticated, no_player.
-- ---------------------------------------------------------------------------

create or replace function public.mark_casey_talked()
returns void
language plpgsql
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

  if not exists (select 1 from public.players p where p.id = v_uid) then
    raise exception 'no_player';
  end if;

  insert into public.player_quest_state as s (player_id, casey_talked_at)
  values (v_uid, now())
  on conflict (player_id) do update
    set casey_talked_at = coalesce(s.casey_talked_at, excluded.casey_talked_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- quest_steps__igloo_badge(p_player) -> jsonb (I2). Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.quest_steps__igloo_badge(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return jsonb_build_object(
    'talk-to-casey', exists (
      select 1 from public.player_quest_state s
      where s.player_id = p_player and s.casey_talked_at is not null
    ),
    'buy-jg-award', exists (
      select 1 from public.player_items o
      where o.player_id = p_player
        and o.item_id in ('award-bptw', 'award-inc5000', 'award-top-workplaces')
    ),
    'hang-jg-award', exists (
      select 1 from public.igloo_slots sl
      where sl.player_id = p_player
        and sl.item_id in ('award-bptw', 'award-inc5000', 'award-top-workplaces')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Postgres grants EXECUTE to PUBLIC by default, and Supabase adds
-- anon and authenticated.
-- ---------------------------------------------------------------------------

revoke all on function public.mark_casey_talked() from public, anon, authenticated;
revoke all on function public.quest_steps__igloo_badge(uuid) from public, anon, authenticated;

grant execute on function public.mark_casey_talked() to authenticated;
