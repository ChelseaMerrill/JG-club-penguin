-- Quest registry (#143, shared foundation for #140, #141 and #143): every
-- "steps" Quest the server pays becomes a data row plus one steps function,
-- so a new Quest is added without redefining complete_quest or
-- quest_progress again.
--
-- Runs after 20260928020000_phishing_quiz.sql (#146), and so after #135's
-- 20260927010000_igloo_wall_slots.sql (#138's ordering rule for any
-- migration that redefines complete_quest). Needs #9's
-- 20260924000000_players.sql, #27's 20260924010000_saved_progress.sql,
-- #46's 20260925000000_quests.sql, #138's 20260927000000_badges.sql and
-- #121's 20260928000000_beystadium.sql (whose quest_progress, with
-- matchWins, is rebased here). Apply by pasting into the Supabase SQL editor
-- (no CLI). Safe to rerun. Proof: supabase/tests/quest_registry_proof.sql
-- (run in PGlite by src/persistence/sql-quest-registry.test.ts; the reviewer
-- re-runs it on real Postgres/Supabase).
--
-- Deploy order (#138 D15): apply this migration before the client that
-- reads quest_progress().questSteps merges or deploys (including a Vercel
-- preview). An old client on this schema keeps working: it ignores the new
-- questSteps key, and complete_quest('main') behaves exactly as before. A
-- new client on the old schema also keeps working: a missing questSteps
-- reads as {} and the main Quest falls back to the client's own step checks.
--
-- Decisions (execution packet for the #140/#141/#143 shared foundation,
-- 2026-10-06). Each is numbered so a review comment can cite it.
--
-- R1 public.quests (id, reward_tokens) lists every Quest complete_quest
-- pays. Seeded with ('main', 150); a rerun refreshes the reward. RLS is on
-- with no policy and every privilege is revoked from anon and authenticated:
-- nothing in the client reads it (the client keeps its own copy of each
-- Quest's reward in src/quests/quest-definitions.ts), so no client role can
-- read or write it. The Minigame Quests stay out of it: their reward is
-- #27's first-time Badge bonus, paid by record_round, and they have no RPC.
--
-- R2 The steps-function convention. Each steps Quest <id> has
--   public.quest_steps__<id with every '-' replaced by '_'>(p_player uuid) returns jsonb
-- returning an object of step id -> boolean, using the client's step ids
-- (QuestStepDefinition.id in src/quests/quest-definitions.ts). It takes a
-- player id, so it is NEVER executable by public, anon or authenticated
-- (EXECUTE revoked from all three, nothing granted back): only the
-- security-definer functions below call it, always with auth.uid(). It is
-- security definer with set search_path = '' like every other function
-- here, and read-only (stable).
--
-- R3 public.quest_steps__main(p_player) holds the main Quest's five checks,
-- moved verbatim out of #138's complete_quest (#46 Q1):
--   create-penguin       players.profile_created_at is not null
--   visit-dev-pit        player_quest_state.dev_pit_visited_at is not null
--   finish-bug-squash    a public.minigame_rounds row for 'bug-squash'
--   finish-pancake-flip  a public.minigame_rounds row for 'pancake-flip'
--   buy-igloo-gear       a public.player_items row whose shop_items.stall = 'igloo'
-- The keys are the client's MainQuestStepId strings.
--
-- R4 public.quest_steps_for(p_player, p_quest_id) is the one place that
-- calls a steps function by name (dynamic SQL). It refuses (unknown_quest)
-- an id that doesn't match ^[a-z0-9-]+$, builds the function name with
-- format('%I'), so the identifier is always quoted, and resolves it with
-- to_regprocedure('public.<name>(uuid)'), so only that exact public
-- function with one uuid argument can ever be called. A Quest row with no
-- steps function, or a function returning anything but a JSON object,
-- reads as {} (no steps), which complete_quest treats as incomplete, so a
-- half-applied Quest can never be paid and never breaks quest_progress for
-- everyone. Internal only, like the steps functions.
--
-- R5 complete_quest(quest_id), redefined (same signature, return shape and
-- error codes as #138's): unknown_quest unless the id matches ^[a-z0-9-]+$
-- and is a public.quests row (null included); the Player's row is locked
-- `for update` as before; the alreadyCompleted path is unchanged;
-- quest_incomplete unless quest_steps_for returns a non-empty object whose
-- every value is JSON true; then it pays that row's reward_tokens and inserts
-- the completion row. Ship It (#138) is awarded only when quest_id = 'main';
-- the balance is re-read after it, as before. A Quest that awards its own
-- Badge is a later decision: it needs its own branch here (see the rules).
--
-- R6 quest_progress(), redefined: every key and value of #121's version is
-- kept (devPitVisited, roundsFinished, completedQuests, matchWins), plus
-- questSteps: { "<quest id>": <quest_steps_for(auth.uid(), id)>, ... } for
-- every public.quests row ({} when there are none). Read-only.
--
-- R7 player_quest_completions.quest_id: #46's check (quest_id in ('main'))
-- is replaced by a foreign key to public.quests, so a new Quest is a data row,
-- not a schema change (as #138 D3 did for Badges).
--
-- R8 Errors (the message is the code, as #46 Q4), unchanged:
--   not_authenticated (errcode 42501)  no auth.uid()
--   unknown_quest                      quest_id malformed, null, or not a public.quests row
--   no_player                          no public.players row for the caller
--   quest_incomplete                   any step is not met, or the Quest has no steps; nothing is paid
-- Mirrored by PROGRESS_ERROR_CODES in src/persistence/progress-store.ts.
--
-- Rules for later migrations (#140, #141, #143 and any other new steps
-- Quest), replacing #138's rule for Quests:
--   * a new steps Quest adds ONLY, in its own migration (sorting after this
--     one): (a) its public.quests row, inserted `on conflict (id) do update
--     set reward_tokens = excluded.reward_tokens`; and (b) its
--     public.quest_steps__<id>(p_player uuid) function per R2 (security
--     definer, set search_path = '', stable, schema-qualified relations,
--     `revoke all ... from public, anon, authenticated` and no grant), plus
--     any state tables and RPCs it needs;
--   * it must NEVER redefine complete_quest or quest_progress: both read
--     public.quests, so the Quest is paid and reported as soon as its row
--     and function exist, and two Quests' migrations can't undo each other;
--   * a change that does have to redefine complete_quest copies it from this
--     file and keeps the lines marked "-- #138: Ship It (keep when
--     redefining)" inside the 'main' branch, and badgesEarned on every
--     return path; a redefinition of quest_progress keeps every key above;
--   * supabase/tests/quest_registry_proof.sql checks that every public.quests
--     row has its steps function and that no quest_steps__* function is
--     executable by anon or authenticated, so it catches a new Quest that
--     breaks R2.
--
-- Rerun chain (read before rerunning any earlier migration):
--   * Rerunning #46's 20260925000000_quests.sql re-adds its check
--     (quest_id in ('main')) and its own complete_quest and quest_progress.
--     Once any non-main Quest has been paid, the check fails and the SQL
--     editor rolls the whole paste back, so nothing is applied. Before that,
--     it succeeds and silently reverts both functions (and blocks every
--     non-main Quest) until this file is rerun.
--   * Rerunning #138's badges file or #121's beystadium file silently
--     reverts complete_quest or quest_progress to their versions.
--   The rule stays #138's: after rerunning any earlier migration, rerun this
--   file and then every later one, in timestamp order.
--
-- Conventions (the leaderboard migration's D5): every function is security
-- definer with set search_path = '', every relation schema-qualified,
-- #variable_conflict use_column, identity from auth.uid() only in client-
-- callable functions, EXECUTE revoked from public/anon/authenticated and
-- granted back to authenticated only where stated.

-- ---------------------------------------------------------------------------
-- public.quests: the server-paid steps Quests (R1)
-- ---------------------------------------------------------------------------

create table if not exists public.quests (
  id text primary key,
  reward_tokens int not null
);

-- Named, re-added each run (see #27's note on inline checks and reruns).
alter table public.quests drop constraint if exists quests_reward_tokens_check;
alter table public.quests
  add constraint quests_reward_tokens_check check (reward_tokens > 0);
alter table public.quests drop constraint if exists quests_id_check;
alter table public.quests
  add constraint quests_id_check check (id ~ '^[a-z0-9-]+$');

-- Mirrored by the 'main' entry in src/quests/quest-definitions.ts
-- (rewardTokens) and in src/persistence/in-memory-steps-quests.ts.
insert into public.quests (id, reward_tokens) values
  ('main', 150)
on conflict (id) do update
  set reward_tokens = excluded.reward_tokens;

alter table public.quests enable row level security;

-- No policy and no grant: no client role reads or writes it (R1).
revoke all on public.quests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- player_quest_completions: foreign key to the registry instead of #46's
-- one-id check (R7)
-- ---------------------------------------------------------------------------

alter table public.player_quest_completions
  drop constraint if exists player_quest_completions_quest_id_check;
alter table public.player_quest_completions
  drop constraint if exists player_quest_completions_quest_id_fkey;
alter table public.player_quest_completions add constraint player_quest_completions_quest_id_fkey
  foreign key (quest_id) references public.quests (id);

-- ---------------------------------------------------------------------------
-- quest_steps__main(p_player) -> jsonb (R2, R3). Internal only.
-- ---------------------------------------------------------------------------

create or replace function public.quest_steps__main(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return jsonb_build_object(
    'create-penguin', exists (
      select 1 from public.players p
      where p.id = p_player and p.profile_created_at is not null
    ),
    'visit-dev-pit', exists (
      select 1 from public.player_quest_state s
      where s.player_id = p_player and s.dev_pit_visited_at is not null
    ),
    'finish-bug-squash', exists (
      select 1 from public.minigame_rounds r
      where r.player_id = p_player and r.minigame_id = 'bug-squash'
    ),
    'finish-pancake-flip', exists (
      select 1 from public.minigame_rounds r
      where r.player_id = p_player and r.minigame_id = 'pancake-flip'
    ),
    'buy-igloo-gear', exists (
      select 1
      from public.player_items o
      join public.shop_items i on i.id = o.item_id
      where o.player_id = p_player and i.stall = 'igloo'
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- quest_steps_for(p_player, p_quest_id) -> jsonb (R4). Internal only.
--
-- The steps object of one Quest for one Player: {} when the Quest has no
-- steps function or it returns something other than an object.
-- Errors: unknown_quest (a malformed id).
-- ---------------------------------------------------------------------------

create or replace function public.quest_steps_for(p_player uuid, p_quest_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_name text;
  v_fn regprocedure;
  v_steps jsonb;
begin
  if p_quest_id is null or p_quest_id !~ '^[a-z0-9-]+$' then
    raise exception 'unknown_quest';
  end if;

  v_name := 'quest_steps__' || replace(p_quest_id, '-', '_');
  v_fn := to_regprocedure(format('public.%I(uuid)', v_name));
  if v_fn is null then
    return '{}'::jsonb;
  end if;

  execute format('select public.%I($1)', v_name) into v_steps using p_player;

  if v_steps is null or jsonb_typeof(v_steps) <> 'object' then
    return '{}'::jsonb;
  end if;
  return v_steps;
end;
$$;

-- ---------------------------------------------------------------------------
-- quest_progress(), redefined (R6)
--
-- #121's quest_progress (20260928000000_beystadium.sql) plus questSteps.
-- Returns { devPitVisited, roundsFinished, completedQuests, matchWins,
-- questSteps } for the caller. Read-only. Errors: not_authenticated.
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
    ), '[]'::jsonb),
    -- B9: the same count record_round's B7 makes, per match-win Minigame.
    'matchWins', coalesce((
      select jsonb_object_agg(w.minigame_id, w.wins)
      from (
        select r.minigame_id, count(*) as wins
        from public.minigame_rounds r
        where r.player_id = v_uid
          and r.minigame_id = 'beystadium'
          and r.stats -> 'won' = '1'::jsonb
        group by r.minigame_id
      ) w
    ), '{}'::jsonb),
    -- R6: every registered steps Quest's steps for the caller.
    'questSteps', coalesce((
      select jsonb_object_agg(q.id, public.quest_steps_for(v_uid, q.id))
      from public.quests q
    ), '{}'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_quest(quest_id), redefined (R5)
--
-- #138's complete_quest with the Quest, its reward and its steps read from
-- the registry. Returns { tokensAwarded, balance, alreadyCompleted,
-- badgesEarned }. Errors: not_authenticated, unknown_quest, no_player,
-- quest_incomplete (R8).
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
  v_reward int;
  v_balance int;
  v_steps jsonb;
  v_badges text[] := '{}';
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_quest is null or v_quest !~ '^[a-z0-9-]+$' then
    raise exception 'unknown_quest';
  end if;

  select q.reward_tokens into v_reward from public.quests q where q.id = v_quest;
  if not found then
    raise exception 'unknown_quest';
  end if;

  -- Lock the Player's row so parallel calls (and rounds/purchases) run one
  -- at a time; the second call then sees the first one's completion row.
  select p.tokens into v_balance
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
      'alreadyCompleted', true,
      'badgesEarned', to_jsonb(v_badges)
    );
  end if;

  v_steps := public.quest_steps_for(v_uid, v_quest);
  if not exists (select 1 from jsonb_each(v_steps))
    or exists (
      select 1 from jsonb_each(v_steps) as e (key, value)
      where e.value is distinct from 'true'::jsonb
    ) then
    raise exception 'quest_incomplete';
  end if;

  update public.players p
  set tokens = p.tokens + v_reward
  where p.id = v_uid
  returning p.tokens into v_balance;

  insert into public.player_quest_completions (player_id, quest_id, tokens_awarded)
  values (v_uid, v_quest, v_reward);

  if v_quest = 'main' then
    -- #138: Ship It (keep when redefining)
    if public.award_badge(v_uid, 'ship-it') then
      v_badges := array_append(v_badges, 'ship-it');
    end if;
    -- #138: Ship It (keep when redefining) -- the balance includes the +50.
    select p.tokens into v_balance from public.players p where p.id = v_uid;
  end if;

  return jsonb_build_object(
    'tokensAwarded', v_reward,
    'balance', v_balance,
    'alreadyCompleted', false,
    'badgesEarned', to_jsonb(v_badges)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Postgres grants EXECUTE to PUBLIC by default, and Supabase adds
-- anon and authenticated. The steps functions and quest_steps_for take a
-- player id, so no client role may execute them (R2, R4). If a signature
-- ever changes, add `drop function if exists` for the old one first.
-- ---------------------------------------------------------------------------

revoke all on function public.quest_steps__main(uuid) from public, anon, authenticated;
revoke all on function public.quest_steps_for(uuid, text) from public, anon, authenticated;
revoke all on function public.quest_progress() from public, anon, authenticated;
revoke all on function public.complete_quest(text) from public, anon, authenticated;

grant execute on function public.quest_progress() to authenticated;
grant execute on function public.complete_quest(text) to authenticated;
