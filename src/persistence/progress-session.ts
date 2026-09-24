// The sign-in wiring between auth and `ProgressStore` (#34). `createProgressSession`
// is what `main.ts` calls from `onSignedIn`/`onSignedOut`; the registry keys it
// writes are the one place every other track reads saved progress from.

import type { TypedEmitter } from '../contracts/emitter';
import type { GameEventMap, MinigameId, MinigameStatsMap } from '../contracts/game-events';
import type { PenguinLook } from '../contracts/penguin';
import { bindPlayer, type Player } from '../auth/player';
import { MINIGAME_RULES } from './minigame-rules';
import {
  IGLOO_SLOTS,
  type IglooSlot,
  type ProgressSnapshot,
  type ProgressStore,
  type PurchaseResult,
  type RoundResult,
} from './progress-store';

/**
 * Holds the `ProgressSnapshot` loaded on sign-in. Producer: #34. Consumers:
 * every track that reads saved progress (#35, #37, #40, #41, #42) via
 * `game.registry.get(PROGRESS_KEY)`.
 */
export const PROGRESS_KEY = 'progress';

/**
 * Holds the `ProgressStore` (wrapped to keep `PROGRESS_KEY` current after
 * every write). Producer: #34. Consumers: #35, #37, #40, #41, #42 call
 * `game.registry.get(PROGRESS_STORE_KEY)` for every write.
 */
export const PROGRESS_STORE_KEY = 'progressStore';

/** A registry narrow enough for `game.registry` (Phaser's `DataManager`). */
export interface ProgressSessionRegistry {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
  remove(key: string): unknown;
}

export interface CreateProgressSessionOptions {
  registry: ProgressSessionRegistry;
  emitter: TypedEmitter<GameEventMap>;
}

export interface ProgressSession {
  /**
   * Loads the Player's saved progress and puts it (plus a tracking wrapper
   * of `store`) into the registry. Never rejects: a `loadAll` failure is
   * swallowed (the store already emitted `ui:toast`) and resolves to `null`.
   * A load that resolves after `stop()`, or after a newer `start()`, is
   * dropped and also resolves to `null`.
   */
  start(player: Player, store: ProgressStore): Promise<ProgressSnapshot | null>;
  /** Removes both registry keys and invalidates any in-flight `start()`. */
  stop(): void;
}

/**
 * Wraps `store` so every successful write keeps `PROGRESS_KEY` (and the
 * registry's `player.look`, for `saveLook`) current, without re-fetching.
 * Errors propagate unchanged: callers (#40's "Not enough tokens", etc.) need
 * the typed `ProgressStoreError` codes.
 */
function wrapStore(
  store: ProgressStore,
  registry: ProgressSessionRegistry,
  initialPlayer: Player,
): ProgressStore {
  let currentPlayer = initialPlayer;

  function currentSnapshot(): ProgressSnapshot | undefined {
    return registry.get(PROGRESS_KEY) as ProgressSnapshot | undefined;
  }

  function setSnapshot(snapshot: ProgressSnapshot): void {
    registry.set(PROGRESS_KEY, snapshot);
  }

  async function saveLook(look: PenguinLook): Promise<void> {
    await store.saveLook(look);
    currentPlayer = { ...currentPlayer, look };
    bindPlayer(registry, currentPlayer);
    const previous = currentSnapshot();
    if (previous) {
      setSnapshot({
        ...previous,
        look,
        profileCreatedAt: previous.profileCreatedAt ?? new Date().toISOString(),
      });
    }
  }

  async function recordRound<K extends MinigameId>(
    minigameId: K,
    score: number,
    stats: MinigameStatsMap[K],
  ): Promise<RoundResult> {
    const result = await store.recordRound(minigameId, score, stats);
    const previous = currentSnapshot();
    if (previous) {
      const rule = MINIGAME_RULES[minigameId];
      let badges = previous.badges;
      if (result.badgeEarned && !badges.includes(rule.badgeId)) {
        badges = [...badges, rule.badgeId];
      }
      let bests = previous.bests;
      if (result.newBest) {
        const rawBest = rule.rawBest(score, stats as unknown as Record<string, number>);
        bests = { ...previous.bests, [minigameId]: rawBest };
      }
      setSnapshot({ ...previous, tokens: result.balance, badges, bests });
    }
    return result;
  }

  async function purchase(itemId: string): Promise<PurchaseResult> {
    const result = await store.purchase(itemId);
    const previous = currentSnapshot();
    if (previous) {
      setSnapshot({
        ...previous,
        tokens: result.balance,
        ownedItems: [...previous.ownedItems, itemId],
      });
    }
    return result;
  }

  async function setSlot(slot: IglooSlot, itemId: string | null): Promise<void> {
    await store.setSlot(slot, itemId);
    const previous = currentSnapshot();
    if (previous) {
      const slots = { ...previous.slots };
      if (itemId === null) {
        slots[slot] = null;
      } else {
        for (const other of IGLOO_SLOTS) {
          if (slots[other] === itemId) {
            slots[other] = null;
          }
        }
        slots[slot] = itemId;
      }
      setSnapshot({ ...previous, slots });
    }
  }

  return {
    loadAll: () => store.loadAll(),
    saveLook,
    recordRound,
    purchase,
    setSlot,
  };
}

/**
 * Runs `store.loadAll()` on sign-in and keeps the registry current after
 * every write. Producer: #34. Consumer: `main.ts`.
 */
export function createProgressSession(options: CreateProgressSessionOptions): ProgressSession {
  const { registry, emitter } = options;
  let generation = 0;

  async function start(player: Player, store: ProgressStore): Promise<ProgressSnapshot | null> {
    generation += 1;
    const myGeneration = generation;

    let snapshot: ProgressSnapshot;
    try {
      snapshot = await store.loadAll();
    } catch {
      // The store already emitted `ui:toast`; never throw into Phaser.
      return null;
    }

    if (myGeneration !== generation) {
      // Superseded by `stop()` or a newer `start()` while this load was in
      // flight; drop it.
      return null;
    }

    const boundPlayer: Player = { ...player, look: snapshot.look };
    registry.set(PROGRESS_KEY, snapshot);
    registry.set(PROGRESS_STORE_KEY, wrapStore(store, registry, boundPlayer));
    bindPlayer(registry, boundPlayer);
    emitter.emit('tokens:changed', { balance: snapshot.tokens });
    return snapshot;
  }

  function stop(): void {
    generation += 1;
    registry.remove(PROGRESS_KEY);
    registry.remove(PROGRESS_STORE_KEY);
  }

  return { start, stop };
}
