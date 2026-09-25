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
  ProgressStoreError,
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
   * Registers a tracking wrapper of `store` under `PROGRESS_STORE_KEY`
   * straight away, then loads the Player's saved progress into
   * `PROGRESS_KEY`. A consumer calling the wrapper's `loadAll()` while this
   * initial load is in flight shares it rather than fetching twice. Never
   * rejects: a `loadAll` failure is swallowed (the store emits `ui:toast`)
   * and resolves to `null`, leaving the wrapper registered so a later
   * `loadAll()` can retry. A load that resolves after `stop()`, or after a
   * newer `start()`, is dropped and also resolves to `null`.
   */
  start(player: Player, store: ProgressStore): Promise<ProgressSnapshot | null>;
  /** Removes both registry keys and invalidates any in-flight `start()`. */
  stop(): void;
}

/**
 * Wraps `store` so every successful write keeps `PROGRESS_KEY` (and the
 * registry's `player.look`, for `saveLook`) current, without re-fetching.
 * Errors propagate unchanged: callers (#40's "Not enough tokens", etc.) need
 * the typed `ProgressStoreError` codes. Between writes, `bests` and
 * `profileCreatedAt` are client-side approximations kept current here (the
 * client computes `rawBest`/the timestamp itself) until the next `loadAll`
 * re-reads the server's own values.
 *
 * `isCurrent()` reports whether this wrapper's `start()` generation is still
 * the session's current one. A write whose store call resolves after `stop()`
 * (or after a newer `start()`) still resolves/rejects exactly as `store`
 * did, but skips every registry write below: the registry keys, and the
 * `player.look` `bindPlayer` sets, belong to whichever session is current now.
 */
function wrapStore(
  store: ProgressStore,
  registry: ProgressSessionRegistry,
  initialPlayer: Player,
  isCurrent: () => boolean,
  emitter: TypedEmitter<GameEventMap>,
): { wrapper: ProgressStore; loadInitial(): Promise<ProgressSnapshot> } {
  let currentPlayer = initialPlayer;
  let pendingLoad: Promise<ProgressSnapshot> | null = null;

  /** Puts a fresh snapshot in the registry, rebinds `player.look` and updates the HUD. */
  function applySnapshot(snapshot: ProgressSnapshot): void {
    if (!isCurrent()) return;
    currentPlayer = { ...currentPlayer, look: snapshot.look };
    registry.set(PROGRESS_KEY, snapshot);
    bindPlayer(registry, currentPlayer);
    emitter.emit('tokens:changed', { balance: snapshot.tokens });
  }

  /**
   * One network load at a time: a `loadAll()` while another is in flight
   * (the sign-in load, or the Penguin Creator's own load on sign-in) shares
   * that promise, so its rejection reaches every caller.
   */
  function loadAll(): Promise<ProgressSnapshot> {
    if (pendingLoad) return pendingLoad;
    const load = store.loadAll().then((snapshot) => {
      applySnapshot(snapshot);
      return snapshot;
    });
    pendingLoad = load;
    const clear = () => {
      if (pendingLoad === load) pendingLoad = null;
    };
    load.then(clear, clear);
    return load;
  }

  function currentSnapshot(): ProgressSnapshot | undefined {
    return registry.get(PROGRESS_KEY) as ProgressSnapshot | undefined;
  }

  function setSnapshot(snapshot: ProgressSnapshot): void {
    registry.set(PROGRESS_KEY, snapshot);
  }

  async function saveLook(look: PenguinLook): Promise<void> {
    await store.saveLook(look);
    if (!isCurrent()) return;
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
    if (!isCurrent()) return result;
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
    if (!isCurrent()) return result;
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
    if (!isCurrent()) return;
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
    wrapper: { loadAll, saveLook, recordRound, purchase, setSlot },
    loadInitial: loadAll,
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
    const isCurrent = () => generation === myGeneration;

    const { wrapper, loadInitial } = wrapStore(store, registry, player, isCurrent, emitter);
    registry.set(PROGRESS_STORE_KEY, wrapper);

    try {
      const snapshot = await loadInitial();
      // Superseded by `stop()` or a newer `start()` while this load was in
      // flight: the wrapper already skipped every registry write.
      return isCurrent() ? snapshot : null;
    } catch {
      // The store itself emits `ui:toast` when it was built with an emitter
      // (main.ts always passes `gameEvents`); never throw into Phaser.
      return null;
    }
  }

  function stop(): void {
    generation += 1;
    registry.remove(PROGRESS_KEY);
    registry.remove(PROGRESS_STORE_KEY);
    // So the HUD never keeps showing a signed-out or previous account's
    // balance until the next sign-in's own `tokens:changed` arrives.
    emitter.emit('tokens:changed', { balance: 0 });
  }

  return { start, stop };
}

/**
 * The one `ProgressStore` the app hands to long-lived consumers built at
 * boot (the Minigame launcher, the Penguin Creator editor). Every call
 * forwards to the signed-in Player's store under `PROGRESS_STORE_KEY`; with
 * nobody signed in it forwards to `fallback()` when that returns a store
 * (the dev/e2e hooks' in-memory fake), and otherwise rejects with
 * `not_authenticated`. Producer: #34. Consumer: `main.ts`.
 */
export function createActiveProgressStore(
  registry: Pick<ProgressSessionRegistry, 'get'>,
  fallback: () => ProgressStore | null = () => null,
): ProgressStore {
  function current(): ProgressStore {
    const store = (registry.get(PROGRESS_STORE_KEY) as ProgressStore | undefined) ?? fallback();
    if (!store) throw new ProgressStoreError('not_authenticated');
    return store;
  }

  return {
    loadAll: async () => current().loadAll(),
    saveLook: async (look) => current().saveLook(look),
    recordRound: async (minigameId, score, stats) =>
      current().recordRound(minigameId, score, stats),
    purchase: async (itemId) => current().purchase(itemId),
    setSlot: async (slot, itemId) => current().setSlot(slot, itemId),
  };
}
