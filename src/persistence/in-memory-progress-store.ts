import type { TypedEmitter } from '../contracts/emitter';
import { DEFAULT_LOOK, type PenguinLook } from '../contracts/penguin';
import type { BadgeId, GameEventMap, MinigameId, MinigameStatsMap } from '../contracts/game-events';
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
} from './minigame-rules';
import {
  IGLOO_SLOTS,
  ProgressStoreError,
  emptySlots,
  isIglooSlot,
  validateLook,
  type IglooSlot,
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
  lastRoundFinishedAtMs: Partial<Record<MinigameId, number>>;
  /** Item id to the time (ms) it was acquired, for `loadAll`'s ordering. */
  ownedItems: Map<string, number>;
  slots: Record<IglooSlot, string | null>;
}

export interface InMemoryProgressStoreOptions {
  /** Defaults to `Date.now`; tests pass a controllable clock. */
  now?: () => number;
  /** Omit to build a store that emits nothing (most contract tests). */
  emitter?: TypedEmitter<GameEventMap>;
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
    look: defaultLook(),
    profileCreatedAt: null,
    tokens: STARTING_TOKENS,
    badges: new Map(),
    bests: {},
    lastRoundFinishedAtMs: {},
    ownedItems: new Map(),
    slots: emptySlots(),
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

    const rule = MINIGAME_RULES[minigameId];
    if (!rule) {
      throw new ProgressStoreError('unknown_minigame');
    }

    const nowMs = now();
    const lastFinishedAtMs = state.lastRoundFinishedAtMs[minigameId];
    const elapsedSeconds =
      lastFinishedAtMs === undefined ? undefined : (nowMs - lastFinishedAtMs) / 1000;
    if (elapsedSeconds !== undefined && elapsedSeconds < MIN_ROUND_INTERVAL_SECONDS) {
      throw new ProgressStoreError('round_too_soon');
    }

    const numericStats = statsRecord as Record<string, number>;
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
    }

    let badgeEarned = false;
    let bonus = 0;
    if (!state.badges.has(rule.badgeId) && rawBest >= rule.badgeThreshold) {
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

  return { loadAll, saveLook, recordRound, purchase, setSlot };
}
