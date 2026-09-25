/**
 * Snowball mode's controller (#53): orchestrates the Room channel, ammo,
 * flight/hit timing and snow-hat lifetime behind a narrow `SnowballView` seam
 * that `RoomScene`/`RoomPenguinView` implement (D2). Mirrors the shape of
 * `src/chat/chat-controller.ts`: a narrow structural channel dependency, an
 * injectable clock and timers, and a generation counter bumped on Room
 * change and `stop()` so work outstanding from a superseded Room (or a
 * stopped controller) becomes inert.
 */
import type { Tile } from '../contracts';
import type { RoomChannel } from '../realtime/room-channel';
import { createSnowballAmmo, SNOWBALL_CAPACITY } from './snowball-ammo';
import {
  generateThrowId as defaultGenerateThrowId,
  pickHit,
  SNOW_HAT_MS,
  SNOWBALL_FLIGHT_MS,
  ThrowMemory,
  type HitCandidate,
  type ScreenPoint,
} from './snowball-rules';

/**
 * Where the controller reads Penguin screen positions and draws snowball
 * effects: the #16/#43 renderer, via `RoomScene`/`RoomPenguinView` (D2
 * implements this against Phaser). A narrow, structural seam so this module
 * never imports Phaser or the room package. Screen points are `{x, y}` in
 * Stage pixels, never Tile coordinates.
 */
export interface SnowballView {
  /** The local Penguin's current screen point. */
  localPoint(): ScreenPoint;
  /** A shown remote Player Penguin's current screen point by playerId, or `null` if it isn't currently shown. */
  remotePoint(playerId: string): ScreenPoint | null;
  /** The playerIds of every remote Player Penguin currently shown (never the local Penguin, never an NPC). */
  shownRemoteIds(): readonly string[];
  /** Converts a Tile to its screen point via the Room's iso projection. */
  tileToPoint(tile: Tile): ScreenPoint;
  /**
   * Draws (or replaces) the thrown arc identified by `throwId`, animating
   * from `from` to `to` over `durationMs`.
   */
  drawArc(throwId: string, from: ScreenPoint, to: ScreenPoint, durationMs: number): void;
  /** Cuts `throwId`'s arc (if still flying) to a splat at `point`, or simply shows one. */
  showSplat(throwId: string, point: ScreenPoint): void;
  /** Turns a remote Player's snow hat on or off. */
  setRemoteSnowHat(playerId: string, on: boolean): void;
  /** Turns the local Penguin's snow hat on or off. */
  setLocalSnowHat(on: boolean): void;
}

/** The narrow slice of `RoomChannel` the snowball controller depends on. */
export type SnowballRoomChannel = Pick<RoomChannel, 'send' | 'on' | 'onRoomChange'>;

/** A snow hat's lifetime, keyed by playerId (the local Player included) in `snowHats()`. */
export interface SnowHatEntry {
  /** Epoch ms (per the controller's clock) the hat was applied. */
  appliedAt: number;
  /** Epoch ms the hat expires: always `appliedAt + SNOW_HAT_MS`. */
  until: number;
}

export interface SnowballControllerOptions {
  channel: SnowballRoomChannel;
  view: SnowballView;
  /** The local Player's own id: never a hit candidate, and the key `snowHats()` uses for the local Penguin. */
  playerId: string;
  /** Clock for ammo, flight and snow-hat timing. Defaults to `Date.now`. */
  now?: () => number;
  /** Timer used for flight, snow-hat and ammo-refill scheduling. Defaults to the global `setTimeout`. */
  setTimeout?: typeof setTimeout;
  /** Timer used to cancel the above. Defaults to the global `clearTimeout`. */
  clearTimeout?: typeof clearTimeout;
  /** throwId generator, injectable for deterministic tests. Defaults to `generateThrowId` (`snowball-rules.ts`). */
  generateThrowId?: () => string;
}

export interface SnowballController {
  /**
   * Reserves one ammo and sends `snowball:throw` with a freshly generated
   * throwId. Resolves `false` immediately, sending nothing, if no ammo is
   * available (a second click while a first send is still pending finds no
   * ammo reserved for it). Refunds the reservation and resolves `false` if
   * the send is not acknowledged; only once it is does the controller draw
   * the arc and, `SNOWBALL_FLIGHT_MS` later, resolve the hit: among the
   * remote Player Penguins currently shown (never NPCs, never the thrower),
   * the nearest one inside the landing ellipse. On a hit, the snow hat is
   * applied locally and `snowball:hit` is sent; either way a splat replaces
   * the arc. A Room change or `stop()` before landing cancels the flight:
   * no hit, no hat, no further view calls.
   */
  throwAt(target: Tile): Promise<boolean>;
  /** The current ammo count and capacity. */
  ammo(): { count: number; capacity: number };
  /** Fires on every ammo change (a throw, a refund, or a refill tick). */
  onAmmoChange(listener: (ammo: { count: number; capacity: number }) => void): () => void;
  /** A snapshot of every active snow hat, keyed by playerId (the local Player included). */
  snowHats(): ReadonlyMap<string, SnowHatEntry>;
  /** Fires whenever a snow hat is applied or expires. */
  onSnowHatsChange(listener: (hats: ReadonlyMap<string, SnowHatEntry>) => void): () => void;
  /** Unsubscribes from the channel, cancels every timer, and clears all state. Call once, at session end. */
  stop(): void;
}

/**
 * Wires Snowball mode's ammo, throw/hit round trip and snow-hat lifetime to
 * a Room channel and a `SnowballView`. See issue #53 for the behavioral
 * contract (D1-D8, v4 refinements).
 */
export function createSnowballController(options: SnowballControllerOptions): SnowballController {
  const { channel, view, playerId } = options;
  const now = options.now ?? Date.now;
  const scheduleTimer = options.setTimeout ?? setTimeout;
  const cancelTimer = options.clearTimeout ?? clearTimeout;
  const nextThrowId = options.generateThrowId ?? (() => defaultGenerateThrowId());

  const ammo = createSnowballAmmo(SNOWBALL_CAPACITY);
  const throwMemory = new ThrowMemory();
  const hats = new Map<string, SnowHatEntry>();
  const hatTimers = new Map<string, ReturnType<typeof scheduleTimer>>();
  const flightTimers = new Set<ReturnType<typeof scheduleTimer>>();
  const ammoListeners = new Set<(ammo: { count: number; capacity: number }) => void>();
  const snowHatsListeners = new Set<(hats: ReadonlyMap<string, SnowHatEntry>) => void>();

  let refillTimer: ReturnType<typeof scheduleTimer> | null = null;

  // Bumped on every Room change and on `stop()`, so a throw's send or
  // landing timer that resolves against a since-superseded Room (or a
  // stopped controller) is a no-op (#53 L1).
  let generation = 0;
  let stopped = false;

  function ammoSnapshot(): { count: number; capacity: number } {
    return { count: ammo.count(now()), capacity: ammo.capacity };
  }

  function notifyAmmoChange(): void {
    const snapshot = ammoSnapshot();
    for (const listener of Array.from(ammoListeners)) listener(snapshot);
  }

  function notifySnowHatsChange(): void {
    const snapshot: ReadonlyMap<string, SnowHatEntry> = new Map(hats);
    for (const listener of Array.from(snowHatsListeners)) listener(snapshot);
  }

  /** Re-arms the single timer that notifies ammo listeners of the next scheduled refill tick. */
  function scheduleRefillNotification(): void {
    if (refillTimer !== null) {
      cancelTimer(refillTimer);
      refillTimer = null;
    }
    const next = ammo.nextRefillAt(now());
    if (next === null) return;
    const delay = Math.max(0, next - now());
    refillTimer = scheduleTimer(() => {
      refillTimer = null;
      notifyAmmoChange();
      scheduleRefillNotification();
    }, delay);
  }

  function scheduleHatExpiry(targetId: string, isLocal: boolean, until: number): void {
    const existing = hatTimers.get(targetId);
    if (existing !== undefined) cancelTimer(existing);
    const delay = Math.max(0, until - now());
    const timer = scheduleTimer(() => {
      hatTimers.delete(targetId);
      hats.delete(targetId);
      if (isLocal) view.setLocalSnowHat(false);
      else view.setRemoteSnowHat(targetId, false);
      notifySnowHatsChange();
    }, delay);
    hatTimers.set(targetId, timer);
  }

  /** Applies (or restarts, on a re-hit) `targetId`'s snow hat for `SNOW_HAT_MS` from `at`. */
  function applyHat(targetId: string, isLocal: boolean, at: number): void {
    const until = at + SNOW_HAT_MS;
    hats.set(targetId, { appliedAt: at, until });
    if (isLocal) view.setLocalSnowHat(true);
    else view.setRemoteSnowHat(targetId, true);
    scheduleHatExpiry(targetId, isLocal, until);
    notifySnowHatsChange();
  }

  /** D3: among remote Players currently shown, resolves the hit (if any) for a snowball landing at `landingPoint`. */
  function resolveLanding(throwId: string, landingPoint: ScreenPoint): void {
    const candidates: HitCandidate[] = [];
    for (const id of view.shownRemoteIds()) {
      const point = view.remotePoint(id);
      if (point !== null) candidates.push({ playerId: id, point });
    }
    const hitId = pickHit(landingPoint, candidates);
    view.showSplat(throwId, landingPoint);
    if (hitId === null) return; // No hit (including O3: no shown remote Penguins) -> splat only.

    applyHat(hitId, false, now());
    // Best effort: a failed hit broadcast leaves the hat on the thrower's
    // screen only; swallow the rejection so it is not unhandled.
    void channel.send('snowball:hit', { throwId, targetId: hitId }).catch(() => undefined);
  }

  function handleIncomingThrow(payload: { playerId: string; throwId: string; target: Tile }): void {
    const sender = payload.playerId;
    throwMemory.remember(sender, payload.throwId, now());
    const from = view.remotePoint(sender);
    if (from === null) return; // Defensive: the channel only forwards throws from a shown sender.
    const to = view.tileToPoint(payload.target);
    view.drawArc(payload.throwId, from, to, SNOWBALL_FLIGHT_MS);
  }

  function handleIncomingHit(payload: {
    playerId: string;
    throwId: string;
    targetId: string;
  }): void {
    const sender = payload.playerId;
    if (!throwMemory.consume(sender, payload.throwId, now())) return; // Unknown or reused throwId (D7).

    const targetId = payload.targetId;
    const isLocal = targetId === playerId;
    if (!isLocal && !view.shownRemoteIds().includes(targetId)) return; // Unknown target (never an NPC key).

    applyHat(targetId, isLocal, now());
    const point = isLocal ? view.localPoint() : view.remotePoint(targetId);
    if (point !== null) view.showSplat(payload.throwId, point);
  }

  const unsubscribeThrow = channel.on('snowball:throw', handleIncomingThrow);
  const unsubscribeHit = channel.on('snowball:hit', handleIncomingHit);
  const unsubscribeRoomChange = channel.onRoomChange(() => {
    generation += 1;
    for (const timer of flightTimers) cancelTimer(timer);
    flightTimers.clear();
    for (const timer of hatTimers.values()) cancelTimer(timer);
    hatTimers.clear();
    const hadHats = hats.size > 0;
    hats.clear();
    throwMemory.clear();
    if (hadHats) notifySnowHatsChange();
  });

  return {
    async throwAt(target: Tile): Promise<boolean> {
      if (stopped) return false;
      if (!ammo.reserve(now())) return false;
      notifyAmmoChange();
      scheduleRefillNotification();

      const throwId = nextThrowId();
      const startGeneration = generation;
      const from = view.localPoint();
      const to = view.tileToPoint(target);

      // A rejected send (realtime-js can reject) counts as not sent, so the
      // reserved ammo is refunded rather than leaked.
      const ok = await channel.send('snowball:throw', { throwId, target }).catch(() => false);

      if (!ok) {
        ammo.refund(now());
        notifyAmmoChange();
        scheduleRefillNotification();
        return false;
      }

      // A Room change or stop() while the send was in flight: the throw was
      // sent, but this Player has left the Room it would land in.
      if (stopped || generation !== startGeneration) return true;

      view.drawArc(throwId, from, to, SNOWBALL_FLIGHT_MS);
      const timer = scheduleTimer(() => {
        flightTimers.delete(timer);
        if (stopped || generation !== startGeneration) return;
        resolveLanding(throwId, to);
      }, SNOWBALL_FLIGHT_MS);
      flightTimers.add(timer);

      return true;
    },
    ammo(): { count: number; capacity: number } {
      return ammoSnapshot();
    },
    onAmmoChange(listener): () => void {
      ammoListeners.add(listener);
      return () => {
        ammoListeners.delete(listener);
      };
    },
    snowHats(): ReadonlyMap<string, SnowHatEntry> {
      return new Map(hats);
    },
    onSnowHatsChange(listener): () => void {
      snowHatsListeners.add(listener);
      return () => {
        snowHatsListeners.delete(listener);
      };
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      generation += 1;
      unsubscribeThrow();
      unsubscribeHit();
      unsubscribeRoomChange();
      for (const timer of flightTimers) cancelTimer(timer);
      flightTimers.clear();
      for (const timer of hatTimers.values()) cancelTimer(timer);
      hatTimers.clear();
      hats.clear();
      throwMemory.clear();
      if (refillTimer !== null) {
        cancelTimer(refillTimer);
        refillTimer = null;
      }
      ammoListeners.clear();
      snowHatsListeners.clear();
    },
  };
}
