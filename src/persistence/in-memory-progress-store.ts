import type { TypedEmitter } from '../contracts/emitter';
import { DEFAULT_LOOK, type PenguinLook } from '../contracts/penguin';
import type { BadgeId, GameEventMap, MinigameId, MinigameStatsMap } from '../contracts/game-events';
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
  MAIN_QUEST_REWARD,
  SERVER_QUEST_IDS,
  type CompleteQuestResult,
  type QuestProgress,
  ProgressStoreError,
  emptySlots,
  isIglooSlot,
  validateLook,
  type IglooSlot,
  type LeaderboardEntry,
  type ProgressSnapshot,
  type ProgressStore,
  type PurchaseResult,
  type RoundResult,
} from './progress-store';

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
  /** #46: Quests `completeQuest` has paid (`player_quest_completions`). */
  completedQuests: Set<string>;
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
 * The in-memory fake for `ProgressStore`: enforces the same rules as #27's
 * `saved_progress` migration (`record_round`, `purchase_item`, the look and
 * Igloo slot constraints) without a database, for one Player per instance.
 */
export function createInMemoryProgressStore(
  options: InMemoryProgressStoreOptions = {},
): ProgressStore {
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
    completedQuests: new Set(),
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
    };
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

    return { tokensAwarded: payout, balance: state.tokens, newBest, badgeEarned };
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
    for (const otherSlot of IGLOO_SLOTS) {
      if (state.slots[otherSlot] === itemId) {
        state.slots[otherSlot] = null;
      }
    }
    state.slots[slot] = itemId;
  }

  // #46: mirrors `20260925000000_quests.sql`'s `quest_progress`,
  // `mark_dev_pit_visited` and `complete_quest`. A finished round is any
  // recorded round (`lastRoundFinishedAtMs` has an entry), best or not.
  async function questProgress(): Promise<QuestProgress> {
    return {
      devPitVisited: state.devPitVisited,
      roundsFinished: (Object.keys(state.lastRoundFinishedAtMs) as MinigameId[]).sort(),
      completedQuests: [...state.completedQuests].sort(),
      matchWins: { ...state.matchWins },
    };
  }

  async function markDevPitVisited(): Promise<void> {
    state.devPitVisited = true;
  }

  async function completeQuest(questId: string): Promise<CompleteQuestResult> {
    if (!(SERVER_QUEST_IDS as readonly string[]).includes(questId)) {
      throw new ProgressStoreError('unknown_quest');
    }
    if (state.completedQuests.has(questId)) {
      emitter?.emit('tokens:changed', { balance: state.tokens });
      return { tokensAwarded: 0, balance: state.tokens, alreadyCompleted: true };
    }
    const stepsMet =
      state.profileCreatedAt !== null &&
      state.devPitVisited &&
      state.lastRoundFinishedAtMs['bug-squash'] !== undefined &&
      state.lastRoundFinishedAtMs['pancake-flip'] !== undefined &&
      state.ownedItems.size > 0;
    if (!stepsMet) {
      throw new ProgressStoreError('quest_incomplete');
    }
    state.tokens += MAIN_QUEST_REWARD;
    state.completedQuests.add(questId);
    emitter?.emit('tokens:changed', { balance: state.tokens });
    return { tokensAwarded: MAIN_QUEST_REWARD, balance: state.tokens, alreadyCompleted: false };
  }

  return {
    loadAll,
    saveLook,
    recordRound,
    purchase,
    setSlot,
    leaderboard,
    questProgress,
    markDevPitVisited,
    completeQuest,
  };
}
