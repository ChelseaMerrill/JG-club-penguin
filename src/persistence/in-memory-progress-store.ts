import type { TypedEmitter } from '../contracts/emitter';
import { DEFAULT_LOOK, type PenguinLook } from '../contracts/penguin';
import type { BadgeId, GameEventMap, MinigameId, MinigameStatsMap } from '../contracts/game-events';
import { BADGE_CATALOG } from './badge-catalog';
import { isNightOwlTime } from './badge-rules';
import { isBlankLeaderboardName, isUnderLeaderboardCeiling } from './leaderboard-rules';
import {
  BADGE_BONUS,
  IGLOO_GEAR_CATALOG,
  MINIGAME_RULES,
  SCORE_MAX,
  SCORE_MIN,
  STARTING_TOKENS,
  STAT_MAX,
  STAT_MIN,
  STATS_MAX_KEY_LENGTH,
  MIN_ROUND_INTERVAL_SECONDS,
  STATS_MAX_KEYS,
  type MinigameRule,
} from './minigame-rules';
import {
  clampLeaderboardRows,
  IGLOO_SLOTS,
  type BadgeCheckResult,
  type CoffeeRun,
  type CompleteQuestResult,
  type QuestProgress,
  ProgressStoreError,
  emptySlots,
  fitsSlot,
  isIglooSlot,
  validateLook,
  type IglooSlot,
  type LeaderboardEntry,
  type ProgressSnapshot,
  type ProgressStore,
  type PurchaseResult,
  type RoundResult,
} from './progress-store';
import { IN_MEMORY_STEPS_QUESTS, type InMemoryQuestState } from './in-memory-steps-quests';
import {
  askTom,
  coffeeRunView,
  deliverCoffee,
  startCoffeeRun,
  visitKitchen,
  type CoffeeRunRecord,
} from './coffee-run-rules';

function defaultLook(): PenguinLook {
  return { ...DEFAULT_LOOK };
}

/** Orders map keys by their recorded time then by id, for `loadAll`. */
function sortedByTimeThenId<T extends string>(entries: ReadonlyMap<T, number>): T[] {
  return Array.from(entries.entries())
    .sort(([aId, aAt], [bId, bAt]) => aAt - bAt || aId.localeCompare(bId))
    .map(([id]) => id);
}

interface PlayerState {
  look: PenguinLook;
  profileCreatedAt: string | null;
  tokens: number;
  /** Badge id to the time (ms) it was earned, for `loadAll`'s ordering. */
  badges: Map<BadgeId, number>;
  bests: Partial<Record<MinigameId, number>>;
  /** When each entry in `bests` was reached (`now()` at the round that set
   *  it), for `leaderboard()`'s tie-break -- the fake's mirror of #27's
   *  `minigame_bests.updated_at`. */
  bestReachedAtMs: Partial<Record<MinigameId, number>>;
  lastRoundFinishedAtMs: Partial<Record<MinigameId, number>>;
  /** Recorded match wins per `'match-wins'`-Badge Minigame (Beystadium):
   *  the fake's count of `minigame_rounds` rows with `stats.won = 1`. */
  matchWins: Partial<Record<MinigameId, number>>;
  /** Item id to the time (ms) it was acquired, for `loadAll`'s ordering. */
  ownedItems: Map<string, number>;
  slots: Record<IglooSlot, string | null>;
  /** #46: the Dev Pit visit flag (`player_quest_state.dev_pit_visited_at`). */
  devPitVisited: boolean;
  /** #143: the Igloo Badge Quest's "talk to Casey" flag (`player_quest_state.casey_talked_at`). */
  caseyTalked: boolean;
  /** #46: Quests `completeQuest` has paid (`player_quest_completions`). */
  completedQuests: Set<string>;
  /** #141: the `player_coffee_runs` row, `null` before talking to Nicole. */
  coffeeRun: CoffeeRunRecord | null;
}

/** One rival's Minigame best, for `InMemoryProgressStoreOptions.leaderboardRivals`. Test-only. */
export interface LeaderboardRival {
  penguinName: string;
  minigameId: MinigameId;
  bestScore: number;
  /** Mirrors #27's `minigame_bests.updated_at`: when this best was reached, for the tie-break. */
  reachedAtMs: number;
}

export interface InMemoryProgressStoreOptions {
  /** Defaults to `Date.now`; tests pass a controllable clock. */
  now?: () => number;
  /** Omit to build a store that emits nothing (most contract tests). */
  emitter?: TypedEmitter<GameEventMap>;
  /** Pre-seeds the fake's own Player as though the Penguin Creator were
   *  already completed (sets `look` and `profileCreatedAt`), so a
   *  `leaderboard()` test doesn't need a `saveLook` round-trip first to give
   *  the caller a name. */
  completedLook?: PenguinLook;
  /** Other Players' Minigame bests, for `leaderboard()`. Test-only: the real
   *  store reads these from every other signed-in Player via
   *  `public.leaderboard`; the fake has no other Players, so this stands in
   *  for them. */
  leaderboardRivals?: readonly LeaderboardRival[];
}

/**
 * Test-only controls over a fake's Player, mirroring what a test does as the
 * postgres role against the real database (`ProgressStoreHarness`).
 */
export interface InMemoryProgressStoreTestControls {
  store: ProgressStore;
  /** Adds `tokens` to the balance directly. */
  grantTokens(tokens: number): void;
  /** Awards `badgeId` with its +50, as `award_badge` would, without emitting anything. */
  holdBadge(badgeId: BadgeId): void;
}

/**
 * The in-memory fake for `ProgressStore`: enforces the same rules as #27's
 * `saved_progress` migration (`record_round`, `purchase_item`, the look and
 * Igloo slot constraints) and #138's Badge rules without a database, for one
 * Player per instance.
 */
export function createInMemoryProgressStore(
  options: InMemoryProgressStoreOptions = {},
): ProgressStore {
  return createInMemoryProgressStoreWithControls(options).store;
}

/** `createInMemoryProgressStore`, plus test-only controls over its Player. */
export function createInMemoryProgressStoreWithControls(
  options: InMemoryProgressStoreOptions = {},
): InMemoryProgressStoreTestControls {
  const now = options.now ?? (() => Date.now());
  const emitter = options.emitter;

  const state: PlayerState = {
    look: options.completedLook ? { ...options.completedLook } : defaultLook(),
    profileCreatedAt: options.completedLook ? new Date(now()).toISOString() : null,
    tokens: STARTING_TOKENS,
    badges: new Map(),
    bests: {},
    bestReachedAtMs: {},
    lastRoundFinishedAtMs: {},
    matchWins: {},
    ownedItems: new Map(),
    slots: emptySlots(),
    devPitVisited: false,
    caseyTalked: false,
    completedQuests: new Set(),
    coffeeRun: null,
  };

  async function loadAll(): Promise<ProgressSnapshot> {
    return {
      look: { ...state.look },
      profileCreatedAt: state.profileCreatedAt,
      tokens: state.tokens,
      badges: sortedByTimeThenId(state.badges),
      bests: { ...state.bests },
      ownedItems: sortedByTimeThenId(state.ownedItems),
      slots: { ...state.slots },
      catalog: [...IGLOO_GEAR_CATALOG]
        .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))
        .map((item) => ({ ...item })),
      badgeCatalog: [...BADGE_CATALOG]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
        .map((badge) => ({ ...badge })),
    };
  }

  /**
   * Mirrors #138's `award_badge_if_available`: awards an available Badge the
   * Player doesn't hold yet and pays its +50 once. Returns true only when it
   * awarded it. Emits nothing; callers decide what to announce.
   */
  function awardBadge(badgeId: BadgeId): boolean {
    const badge = BADGE_CATALOG.find((entry) => entry.id === badgeId);
    if (!badge?.available || state.badges.has(badgeId)) {
      return false;
    }
    state.badges.set(badgeId, now());
    state.tokens += BADGE_BONUS;
    return true;
  }

  function placedSlotCount(): number {
    return IGLOO_SLOTS.filter((slot) => state.slots[slot] !== null).length;
  }

  async function saveLook(look: PenguinLook): Promise<void> {
    validateLook(look);
    state.look = { ...look };
    if (state.profileCreatedAt === null) {
      state.profileCreatedAt = new Date(now()).toISOString();
    }
  }

  async function recordRound<K extends MinigameId>(
    minigameId: K,
    score: number,
    stats: MinigameStatsMap[K],
  ): Promise<RoundResult> {
    if (!Number.isInteger(score) || score < SCORE_MIN || score > SCORE_MAX) {
      throw new ProgressStoreError('invalid_score');
    }

    if (stats === null || typeof stats !== 'object' || Array.isArray(stats)) {
      throw new ProgressStoreError('invalid_stats');
    }
    const statsRecord = stats as unknown as Record<string, unknown>;
    const statsKeys = Object.keys(statsRecord);
    // The SQL also rejects stats over 2 kB; 16 numeric keys of at most
    // `STATS_MAX_KEY_LENGTH` characters stay under that.
    if (
      statsKeys.length > STATS_MAX_KEYS ||
      statsKeys.some((key) => key.length > STATS_MAX_KEY_LENGTH)
    ) {
      throw new ProgressStoreError('invalid_stats');
    }
    for (const value of Object.values(statsRecord)) {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < STAT_MIN ||
        value > STAT_MAX ||
        !Number.isInteger(value)
      ) {
        throw new ProgressStoreError('invalid_stats');
      }
    }

    const rule: MinigameRule | undefined = MINIGAME_RULES[minigameId];
    if (!rule) {
      throw new ProgressStoreError('unknown_minigame');
    }
    const numericStats = statsRecord as Record<string, number>;
    if (rule.validStats && !rule.validStats(numericStats)) {
      throw new ProgressStoreError('invalid_stats');
    }

    const nowMs = now();
    const lastFinishedAtMs = state.lastRoundFinishedAtMs[minigameId];
    const elapsedSeconds =
      lastFinishedAtMs === undefined ? undefined : (nowMs - lastFinishedAtMs) / 1000;
    if (elapsedSeconds !== undefined && elapsedSeconds < MIN_ROUND_INTERVAL_SECONDS) {
      throw new ProgressStoreError('round_too_soon');
    }

    const rawPayout = rule.rawPayout(score, numericStats);
    let payout = Math.min(Math.max(rawPayout, 0), rule.cap);
    if (elapsedSeconds !== undefined) {
      const allowed = Math.floor(rule.cap * Math.min(1, elapsedSeconds / rule.durationSeconds));
      payout = Math.min(payout, allowed);
    }
    const rawBest = rule.rawBest(score, numericStats);
    const previousBest = state.bests[minigameId];
    // A best must beat the previous one; a first round scoring 0 is not a best.
    const newBest = rawBest > (previousBest ?? 0);
    if (newBest) {
      state.bests[minigameId] = rawBest;
      state.bestReachedAtMs[minigameId] = nowMs;
    }

    // A 'match-wins' Badge counts this round's win too (the SQL counts the
    // earlier rows, then adds this one before inserting it).
    const isMatchWin = rule.badgeKind === 'match-wins' && rule.isMatchWin(numericStats);
    const matchWins = (state.matchWins[minigameId] ?? 0) + (isMatchWin ? 1 : 0);
    const badgeMet =
      rule.badgeKind === 'match-wins'
        ? isMatchWin && matchWins >= rule.badgeMatchWins
        : rawBest >= rule.badgeThreshold;
    if (isMatchWin) {
      state.matchWins[minigameId] = matchWins;
    }

    let badgeEarned = false;
    let bonus = 0;
    if (!state.badges.has(rule.badgeId) && badgeMet) {
      state.badges.set(rule.badgeId, nowMs);
      badgeEarned = true;
      bonus = BADGE_BONUS;
    }

    state.tokens += payout + bonus;
    state.lastRoundFinishedAtMs[minigameId] = nowMs;

    emitter?.emit('tokens:changed', { balance: state.tokens });
    if (badgeEarned) {
      emitter?.emit('badge:earned', { badgeId: rule.badgeId });
    }

    return {
      tokensAwarded: payout,
      balance: state.tokens,
      newBest,
      badgeEarned,
      badgesEarned: badgeEarned ? [rule.badgeId] : [],
    };
  }

  async function purchase(itemId: string): Promise<PurchaseResult> {
    const item = IGLOO_GEAR_CATALOG.find((entry) => entry.id === itemId);
    if (!item) {
      throw new ProgressStoreError('unknown_item');
    }
    if (state.ownedItems.has(itemId)) {
      throw new ProgressStoreError('already_owned');
    }
    if (state.tokens < item.price) {
      throw new ProgressStoreError('insufficient_tokens');
    }

    state.tokens -= item.price;
    state.ownedItems.set(itemId, now());
    emitter?.emit('tokens:changed', { balance: state.tokens });

    return { balance: state.tokens };
  }

  async function leaderboard(
    minigameId: MinigameId,
    maxRows?: number,
  ): Promise<LeaderboardEntry[]> {
    if (!MINIGAME_RULES[minigameId]) {
      throw new ProgressStoreError('unknown_minigame');
    }
    const rows = clampLeaderboardRows(maxRows);

    interface Candidate {
      penguinName: string;
      bestScore: number;
      reachedAtMs: number;
      isSelf: boolean;
    }

    function eligible(penguinName: string, bestScore: number): boolean {
      return (
        !isBlankLeaderboardName(penguinName) && isUnderLeaderboardCeiling(minigameId, bestScore)
      );
    }

    const candidates: Candidate[] = [];
    for (const rival of options.leaderboardRivals ?? []) {
      if (rival.minigameId !== minigameId) continue;
      if (!eligible(rival.penguinName, rival.bestScore)) continue;
      candidates.push({
        penguinName: rival.penguinName,
        bestScore: rival.bestScore,
        reachedAtMs: rival.reachedAtMs,
        isSelf: false,
      });
    }

    const ownBest = state.bests[minigameId];
    const ownReachedAtMs = state.bestReachedAtMs[minigameId];
    if (
      ownBest !== undefined &&
      ownReachedAtMs !== undefined &&
      eligible(state.look.name, ownBest)
    ) {
      candidates.push({
        penguinName: state.look.name,
        bestScore: ownBest,
        reachedAtMs: ownReachedAtMs,
        isSelf: true,
      });
    }

    // Mirrors `public.leaderboard`'s `order by best_score desc, updated_at
    // asc, player_id asc`. The fake has no real per-Player id to break a
    // full tie with, so it falls back to the name -- deterministic, but not
    // meant to bit-match the SQL store's own (untestable-here) UUID order.
    candidates.sort(
      (a, b) =>
        b.bestScore - a.bestScore ||
        a.reachedAtMs - b.reachedAtMs ||
        a.penguinName.localeCompare(b.penguinName),
    );

    const ranked: LeaderboardEntry[] = candidates.map((candidate, index) => ({
      rank: index + 1,
      penguinName: candidate.penguinName,
      bestScore: candidate.bestScore,
      isMe: candidate.isSelf,
    }));

    const top = ranked.filter((entry) => entry.rank <= rows);
    const own = ranked.find((entry) => entry.isMe && entry.rank > rows);
    return own ? [...top, own] : top;
  }

  async function setSlot(slot: IglooSlot, itemId: string | null): Promise<void> {
    if (!isIglooSlot(slot)) {
      throw new ProgressStoreError('invalid_slot');
    }
    if (itemId === null) {
      state.slots[slot] = null;
      return;
    }
    if (!state.ownedItems.has(itemId)) {
      throw new ProgressStoreError('not_owned');
    }
    // #135: mirrors the database's igloo_slots_placement_guard, checked
    // before anything moves so a rejected move leaves the item in place.
    const item = IGLOO_GEAR_CATALOG.find((entry) => entry.id === itemId);
    if (item && !fitsSlot(item, slot)) {
      throw new ProgressStoreError('wrong_placement');
    }
    for (const otherSlot of IGLOO_SLOTS) {
      if (state.slots[otherSlot] === itemId) {
        state.slots[otherSlot] = null;
      }
    }
    state.slots[slot] = itemId;
    // Mirrors #138's igloo_slots trigger: silent, announced by the session
    // wrapper's `checkBadges` diff.
    if (placedSlotCount() >= 6) {
      awardBadge('interior-penguin');
    }
  }

  // #46: mirrors `20260925000000_quests.sql`'s `quest_progress`,
  // `mark_dev_pit_visited` and `complete_quest`, as generalized by
  // `20261006000000_quest_registry.sql` (every steps Quest comes from
  // `IN_MEMORY_STEPS_QUESTS`). A finished round is any recorded round
  // (`lastRoundFinishedAtMs` has an entry), best or not.
  function roundsFinished(): MinigameId[] {
    return (Object.keys(state.lastRoundFinishedAtMs) as MinigameId[]).sort();
  }

  function questState(): InMemoryQuestState {
    return {
      profileCreatedAt: state.profileCreatedAt,
      devPitVisited: state.devPitVisited,
      roundsFinished: roundsFinished(),
      ownedItems: sortedByTimeThenId(state.ownedItems),
      slots: { ...state.slots },
      badges: sortedByTimeThenId(state.badges),
      bests: { ...state.bests },
      matchWins: { ...state.matchWins },
      caseyTalked: state.caseyTalked,
      coffeeRun: state.coffeeRun ? { ...state.coffeeRun } : null,
      nowMs: now(),
    };
  }

  async function questProgress(): Promise<QuestProgress> {
    const view = questState();
    const questSteps: Record<string, Record<string, boolean>> = {};
    for (const [id, quest] of IN_MEMORY_STEPS_QUESTS) {
      questSteps[id] = { ...quest.steps(view) };
    }
    return {
      devPitVisited: state.devPitVisited,
      roundsFinished: roundsFinished(),
      completedQuests: [...state.completedQuests].sort(),
      matchWins: { ...state.matchWins },
      questSteps,
    };
  }

  async function markDevPitVisited(): Promise<void> {
    state.devPitVisited = true;
  }

  // #143: the Igloo Badge Quest's "talk to Casey" flag.
  async function markCaseyTalked(): Promise<void> {
    state.caseyTalked = true;
  }

  async function completeQuest(questId: string): Promise<CompleteQuestResult> {
    const quest = IN_MEMORY_STEPS_QUESTS.get(questId);
    if (!quest) {
      throw new ProgressStoreError('unknown_quest');
    }
    if (state.completedQuests.has(questId)) {
      emitter?.emit('tokens:changed', { balance: state.tokens });
      return { tokensAwarded: 0, balance: state.tokens, alreadyCompleted: true, badgesEarned: [] };
    }
    const steps = Object.values(quest.steps(questState()));
    if (steps.length === 0 || steps.some((met) => met !== true)) {
      throw new ProgressStoreError('quest_incomplete');
    }
    state.tokens += quest.rewardTokens;
    state.completedQuests.add(questId);
    // #138: Ship It, for the main Quest only.
    const badgesEarned: BadgeId[] = questId === 'main' && awardBadge('ship-it') ? ['ship-it'] : [];
    emitter?.emit('tokens:changed', { balance: state.tokens });
    for (const badgeId of badgesEarned) {
      emitter?.emit('badge:earned', { badgeId });
    }
    return {
      tokensAwarded: quest.rewardTokens,
      balance: state.tokens,
      alreadyCompleted: false,
      badgesEarned,
    };
  }

  // #141: mirrors 20261006020000_quest_nicole_coffee.sql's RPCs. A refused
  // step throws before anything is written, as the SQL's raise rolls back.
  function applyCoffee(
    step: (record: CoffeeRunRecord | null, nowMs: number) => CoffeeRunRecord,
  ): CoffeeRun {
    const nowMs = now();
    state.coffeeRun = step(state.coffeeRun, nowMs);
    return coffeeRunView(state.coffeeRun, nowMs);
  }

  // #138: mirrors `check_session_badges` / `evaluate_session_badges`, with
  // the injected clock standing in for the server's `now()`.
  async function checkBadges(): Promise<BadgeCheckResult> {
    if (state.profileCreatedAt !== null && state.look.name !== '') {
      awardBadge('first-waddle');
      if (isNightOwlTime(new Date(now()))) {
        awardBadge('night-owl');
      }
      if (placedSlotCount() >= 6) {
        awardBadge('interior-penguin');
      }
    }
    return { badges: sortedByTimeThenId(state.badges), balance: state.tokens };
  }

  return {
    store: {
      loadAll,
      saveLook,
      recordRound,
      purchase,
      setSlot,
      leaderboard,
      questProgress,
      markDevPitVisited,
      markCaseyTalked,
      completeQuest,
      checkBadges,
      coffeeRun: async () => coffeeRunView(state.coffeeRun, now()),
      talkToNicole: async () => applyCoffee(startCoffeeRun),
      markKitchenVisited: async () => applyCoffee(visitKitchen),
      askTomForCoffee: async () => applyCoffee(askTom),
      deliverCoffee: async () => applyCoffee(deliverCoffee),
    },
    grantTokens(tokens: number): void {
      state.tokens += tokens;
    },
    holdBadge(badgeId: BadgeId): void {
      if (!state.badges.has(badgeId)) {
        state.badges.set(badgeId, now());
        state.tokens += BADGE_BONUS;
      }
    },
  };
}
