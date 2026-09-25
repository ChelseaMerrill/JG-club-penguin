-- Quests (#46): the Dev Pit visit flag, which Quests the server has paid,
-- and three functions -- quest_progress(), mark_dev_pit_visited() and
-- complete_quest(quest_id).
--
-- Runs after 20260924020000_leaderboard.sql (#70), and needs #27's
-- 20260924010000_saved_progress.sql. Apply by pasting into the Supabase SQL
-- editor (no CLI). Safe to rerun.
--
-- Decisions (settled with the BA 2026-09-25, execution packet #46):
--
-- Q1 Earlier play counts. Quest progress is worked out from saved data, so
-- a Player who played before this migration still gets credit:
--   step 1 "Create your Penguin"        players.profile_created_at is not null
--   step 2 "Visit the Dev Pit"          player_quest_state.dev_pit_visited_at is not null (new, below)
--   step 3 "Finish Bug Squash"          a public.minigame_rounds row for 'bug-squash'
--   step 4 "Finish Pancake Flip"        a public.minigame_rounds row for 'pancake-flip'
--   step 5 "Buy at Igloo Gear"          a public.player_items row whose shop_items.stall = 'igloo'
-- Steps count in any order. minigame_rounds (not minigame_bests) proves a
-- finished round: #27's record_round inserts a rounds row for every round,
-- including a 0-score round that sets no best, and a quit never calls
-- record_round (#37's shell). Only the Dev Pit visit needed new state.
--
-- Q2 The Dev Pit flag is written only by mark_dev_pit_visited(), a
-- security-definer function, not by an own-row insert under RLS. Why: with
-- an RPC the table stays SELECT-only for `authenticated` (no insert/update
-- grant, no write policy to get wrong); the stored value is always the
-- server's now() and the first visit is never overwritten (coalesce), so a
-- client can't backdate or rewrite it; and it follows #27's rule that
-- reward-relevant state changes only inside validated functions.
-- Residual risk (stated plainly): like record_round's client-asserted
-- rounds, the server can't know the Penguin really walked into the Dev Pit
-- -- a signed-in Player could call this RPC directly. That is worth at most
-- one of five steps of a one-time 150-Token reward; the Token-costing step
-- (a real purchase) and the two finished rounds (rate-limited by
-- record_round's 10 s rule) still have to be met on the server.
--
-- Q3 complete_quest(quest_id) pays the main Quest's 150 Tokens exactly once.
-- It locks the Player's row (`for update`, as record_round and
-- purchase_item do), so two parallel calls run one after the other; the
-- second sees the completion row and returns alreadyCompleted. The
-- (player_id, quest_id) primary key is a second guarantee. A repeat call
-- returns { tokensAwarded: 0, balance, alreadyCompleted: true } even though
-- every step is still met -- it never raises and never pays again. The
-- browser never supplies the reward or the balance: 150 is a constant here.
-- Only 'main' is accepted; the Minigame Quests have no RPC (their reward is
-- #27's existing first-time Badge bonus, paid by record_round).
--
-- Q4 Errors (the message is the code, as #27's functions):
--   not_authenticated (errcode 42501)  no auth.uid()
--   unknown_quest                      quest_id is not 'main' (null included)
--   no_player                          no public.players row for the caller
--   quest_incomplete                   any main-Quest step is not met; nothing is paid
-- Mirrored by PROGRESS_ERROR_CODES in src/persistence/progress-store.ts.
--
-- Q5 (the leaderboard migration's D5): every function is `security
-- definer` with `set search_path = ''`, every relation schema-qualified,
-- `#variable_conflict use_column`, identity from auth.uid() only (no player
-- id argument anywhere), EXECUTE revoked from public/anon/authenticated and
-- granted back to authenticated only. Both tables have RLS on with an
-- own-rows SELECT policy and no write policy; anon gets nothing.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per Player once they first enter the Dev Pit. Written only by
-- mark_dev_pit_visited().
create table if not exists public.player_quest_state (
  player_id uuid primary key references public.players (id) on delete cascade,
  dev_pit_visited_at timestamptz null
);

-- One row per Quest the server has paid. Written only by complete_quest().
create table if not exists public.player_quest_completions (
  player_id uuid not null references public.players (id) on delete cascade,
  quest_id text not null,
  tokens_awarded int not null check (tokens_awarded >= 0),
  completed_at timestamptz not null default now(),
  primary key (player_id, quest_id)
);

-- Named, re-added each run (see #27's note on inline checks and reruns).
alter table public.player_quest_completions
  drop constraint if exists player_quest_completions_quest_id_check;
alter table public.player_quest_completions
  add constraint player_quest_completions_quest_id_check check (quest_id in ('main'));

alter table public.player_quest_state enable row level security;
alter table public.player_quest_completions enable row level security;

drop policy if exists "player_quest_state select own rows" on public.player_quest_state;
create policy "player_quest_state select own rows"
  on public.player_quest_state for select to authenticated
  using (auth.uid() = player_id);

drop policy if exists "player_quest_completions select own rows" on public.player_quest_completions;
create policy "player_quest_completions select own rows"
  on public.player_quest_completions for select to authenticated
  using (auth.uid() = player_id);

-- Explicit grants instead of Supabase defaults: read-only for the owner,
-- nothing for anon. The functions below do every write.
revoke all on public.player_quest_state from anon, authenticated;
revoke all on public.player_quest_completions from anon, authenticated;
grant select on public.player_quest_state to authenticated;
grant select on public.player_quest_completions to authenticated;

-- ---------------------------------------------------------------------------
-- quest_progress()
--
-- Returns { devPitVisited, roundsFinished, completedQuests } for the
-- caller: the Dev Pit flag, the distinct Minigame ids with at least one
-- finished round (ordered), and the paid Quest ids (ordered). Read-only.
-- Errors: not_authenticated.
-- ---------------------------------------------------------------------------

create or replace function public.quest_progress()
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

  return jsonb_build_object(
    'devPitVisited', exists (
      select 1 from public.player_quest_state s
      where s.player_id = v_uid and s.dev_pit_visited_at is not null
    ),
    'roundsFinished', coalesce((
      select jsonb_agg(g.minigame_id order by g.minigame_id)
      from (
        select distinct r.minigame_id
        from public.minigame_rounds r
        where r.player_id = v_uid
      ) g
    ), '[]'::jsonb),
    'completedQuests', coalesce((
      select jsonb_agg(c.quest_id order by c.quest_id)
      from public.player_quest_completions c
      where c.player_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_dev_pit_visited()
--
-- Records the caller's first Dev Pit visit at the server's now(); a later
-- call keeps the first time (Q2). Errors: not_authenticated, no_player.
-- ---------------------------------------------------------------------------

create or replace function public.mark_dev_pit_visited()
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

  insert into public.player_quest_state as s (player_id, dev_pit_visited_at)
  values (v_uid, now())
  on conflict (player_id) do update
    set dev_pit_visited_at = coalesce(s.dev_pit_visited_at, excluded.dev_pit_visited_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_quest(quest_id)
--
-- Checks the main Quest's five steps against saved records (Q1) and pays
-- 150 Tokens once (Q3). Returns { tokensAwarded, balance, alreadyCompleted }.
-- Errors: not_authenticated, unknown_quest, no_player, quest_incomplete (Q4).
-- ---------------------------------------------------------------------------

create or replace function public.complete_quest(quest_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_quest text := complete_quest.quest_id;
  v_reward constant int := 150;
  v_balance int;
  v_profile_created_at timestamptz;
  v_steps_met boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_quest is null or v_quest <> 'main' then
    raise exception 'unknown_quest';
  end if;

  -- Lock the Player's row so parallel calls (and rounds/purchases) run one
  -- at a time; the second call then sees the first one's completion row.
  select p.tokens, p.profile_created_at into v_balance, v_profile_created_at
  from public.players p
  where p.id = v_uid
  for update;
  if not found then
    raise exception 'no_player';
  end if;

  if exists (
    select 1 from public.player_quest_completions c
    where c.player_id = v_uid and c.quest_id = v_quest
  ) then
    return jsonb_build_object(
      'tokensAwarded', 0,
      'balance', v_balance,
      'alreadyCompleted', true
    );
  end if;

  v_steps_met :=
    v_profile_created_at is not null
    and exists (
      select 1 from public.player_quest_state s
      where s.player_id = v_uid and s.dev_pit_visited_at is not null
    )
    and exists (
      select 1 from public.minigame_rounds r
      where r.player_id = v_uid and r.minigame_id = 'bug-squash'
    )
    and exists (
      select 1 from public.minigame_rounds r
      where r.player_id = v_uid and r.minigame_id = 'pancake-flip'
    )
    and exists (
      select 1
      from public.player_items o
      join public.shop_items i on i.id = o.item_id
      where o.player_id = v_uid and i.stall = 'igloo'
    );
  if not v_steps_met then
    raise exception 'quest_incomplete';
  end if;

  update public.players p
  set tokens = p.tokens + v_reward
  where p.id = v_uid
  returning p.tokens into v_balance;

  insert into public.player_quest_completions (player_id, quest_id, tokens_awarded)
  values (v_uid, v_quest, v_reward);

  return jsonb_build_object(
    'tokensAwarded', v_reward,
    'balance', v_balance,
    'alreadyCompleted', false
  );
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and Supabase adds anon and
-- authenticated. Only signed-in Players may call these. If a signature ever
-- changes, add `drop function if exists` for the old one first (a `create
-- or replace` with a different signature adds a second overload that anon
-- could still call).
revoke all on function public.quest_progress() from public, anon, authenticated;
revoke all on function public.mark_dev_pit_visited() from public, anon, authenticated;
revoke all on function public.complete_quest(text) from public, anon, authenticated;
grant execute on function public.quest_progress() to authenticated;
grant execute on function public.mark_dev_pit_visited() to authenticated;
grant execute on function public.complete_quest(text) to authenticated;
