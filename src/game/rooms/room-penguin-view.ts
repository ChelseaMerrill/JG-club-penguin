import { type Facing, type PenguinLook, type PresencePayload, type Tile } from '../../contracts';
import type { RemotePenguinView } from '../../realtime/room-channel';
import { maskName } from '../../ui/mask-names';
import { facingForStep } from '../movement/controller';
import { findPath, tilesEqual, type WalkableGrid } from '../movement/pathfinding';
import { TILE_STEP_MS } from '../movement/speed';
import { depthForTile, tileToScreen, type GridOrigin, type ScreenPoint } from './iso';

/** One Penguin placed on the rendering stage (a #31 `Penguin` in `RoomScene`). */
export interface PlacedPenguin {
  setLook(look: PenguinLook): void;
  setFacing(facing: Facing): void;
  /** Snaps directly to `point`/`depth`, cancelling any in-flight `step` (#43). */
  moveTo(point: ScreenPoint, depth: number): void;
  /** Plays the walk animation (#43). */
  walk(): void;
  /** Returns to the look's idle emote (#43). */
  idle(): void;
  /**
   * Animates one tile step to `point` over `durationMs` (#43): `depthAt(t)`
   * (`t` from 0 to 1) is called on every tween update for isometric depth
   * sorting mid-step, the same way the local walk keeps depth sorted.
   * Resolves once the step completes, or is cut short by `destroy`, another
   * `step`, or a `moveTo`.
   */
  step(point: ScreenPoint, durationMs: number, depthAt: (t: number) => number): Promise<void>;
  /** Shows a chat speech bubble above the Penguin, or clears it (`null`) (#44). */
  say(text: string | null): void;
  /** Draws or removes the transient #53 snow hat (never part of the Penguin look). */
  setSnowHat(on: boolean): void;
  /** Whether the snow hat is actually drawn right now (#53 debug hook's `rendered`). */
  hasSnowHat(): boolean;
  /** The Penguin's current feet point, mid-tween included (#53 D3 hit detection), not its whole-tile position. */
  point(): ScreenPoint;
  destroy(): void;
}

/** Places a new Penguin, feet at `point`, drawn at `depth`. */
export type PlacePenguin = (
  look: PenguinLook,
  point: ScreenPoint,
  depth: number,
  facing: Facing,
) => PlacedPenguin;

export interface RoomPenguinViewOptions {
  /** `location.search`, read for `?masknames`. Defaults to `window.location.search`. */
  search?: string;
  /** Clock for the Presence-vs-walk settle window (#43 D4). Defaults to `Date.now`. */
  now?: () => number;
  /**
   * Schedules the D4 settle-window recheck that fires `MOVE_SETTLE_MS`
   * after a walk ends, so a differing Presence tile wins even when no
   * further `upsert` arrives to trigger the check. Defaults to the real
   * `setTimeout`; unit tests inject a fake clock's own scheduler instead of
   * waiting out real time.
   */
  setTimeout?: (handler: () => void, ms: number) => number;
  /** Cancels a timer `setTimeout` returned. Defaults to the real `clearTimeout`. */
  clearTimeout?: (handle: number) => void;
}

interface Attachment {
  place: PlacePenguin;
  origin: GridOrigin;
  walkable: WalkableGrid;
}

/** One remote Penguin's in-flight walk (#43 D3), mirroring `RoomScene`'s own `queuedMove`. */
interface WalkState {
  /** The active path, current tile first. */
  path: Tile[];
  /** Index into `path` of the tile currently shown. */
  index: number;
  /** A `walkTo` that arrived mid-step; applied once the current step lands. */
  queuedTarget: Tile | null;
}

/** One remote Penguin's shown state, as `debugRemotePenguins()` reports it (#43 D6). */
export interface RemotePenguinDebugInfo {
  playerId: string;
  tile: Tile;
  moving: boolean;
  /**
   * The tile it was first placed at since the last `attach()` — e.g. from
   * Presence on a late join — distinct from `tile` so a test can tell them
   * apart without racing a `move` broadcast that arrives moments later.
   */
  placedTile: Tile;
  /**
   * `Date.now()` (this view's `now()`) when its current or last walk
   * started, absent when it has never walked (#43): an e2e latency
   * measurement reads this directly instead of paying a round trip and poll
   * interval as measurement noise.
   */
  walkStartedAt?: number;
}

const LOCAL_KEY = Symbol('local');
type PenguinKey = string | typeof LOCAL_KEY;

function isPlayerKey(key: PenguinKey): key is string {
  return typeof key === 'string';
}

/** How long after a remote Penguin arrives Presence still defers to its shown tile (#43 D4). */
const MOVE_SETTLE_MS = 1500;

/** The fractional tile at `t` (0..1) between `from` and `to`, for mid-step depth sorting. */
function lerpTile(from: Tile, to: Tile, t: number): Tile {
  return {
    col: from.col + (to.col - from.col) * t,
    row: from.row + (to.row - from.row) * t,
  };
}

/**
 * Renders the Room channel's Penguins (and the signed-in Player's own) in
 * `RoomScene` with the #31 renderer, at their tile's centre via #13's
 * `tileToScreen` and sorted with `depthForTile`.
 *
 * It remembers every Penguin it has been told to show, so it outlives the
 * scene it draws into: `RoomScene` calls `detach()` when it shuts down for a
 * Room change (Phaser tears the old Penguins down with the scene) and
 * `attach()` from its next `create()`, which re-places every remembered
 * Penguin against the entered Room's grid origin. Calls made in between are
 * remembered and drawn on the next `attach()`.
 *
 * A Penguin whose payload has an empty name is not drawn at all: an unnamed
 * Penguin is never shown in the World (#75), not even with a placeholder.
 * One that was already shown and goes nameless is removed the same way a
 * `remove()` would. Name tags otherwise show `look.name`, masked under
 * `?masknames`.
 *
 * #43: `walkTo(playerId, target)` walks a remote Penguin there tile by tile,
 * along the same path/pace #14's local walk uses, rather than snapping it
 * forward. While a Penguin walks, and for `MOVE_SETTLE_MS` after it arrives,
 * a Presence `upsert` updates only its look: Presence's own tile/facing are
 * deferred to so a lagging sync can never snap a walker back mid-stride
 * (#43 D4). Once that window elapses with no further `upsert`, a scheduled
 * recheck itself applies a still-differing Presence tile, rather than
 * waiting on the next `upsert` to notice. The tile actually shown
 * (`shownTile`/`shownFacing`) is tracked independently of the last Presence
 * payload for exactly this reason, and survives a `detach()`/`attach()` Room
 * switch so a Player who leaves and returns mid-walk still sees the
 * walker's last known tile.
 */
export class RoomPenguinView implements RemotePenguinView {
  private readonly search: string;
  private readonly now: () => number;
  private readonly scheduleTimeout: (handler: () => void, ms: number) => number;
  private readonly cancelTimeout: (handle: number) => void;
  private attachment: Attachment | null = null;
  private readonly payloads = new Map<PenguinKey, PresencePayload>();
  private readonly placed = new Map<PenguinKey, PlacedPenguin>();

  // Remote-only tracking (never keyed by `LOCAL_KEY`): the tile/facing
  // actually shown (which a walk in progress may differ from the last
  // Presence payload), the active walk, when each last arrived (the D4
  // settle window), a pending D4 settle-window recheck timer, the tile
  // first placed at since the last `attach()` (the e2e `placedTile` hook
  // field, #43 D6), and when its current or last walk started (the e2e
  // `walkStartedAt` latency hook field, #43).
  private readonly shownTile = new Map<string, Tile>();
  private readonly shownFacing = new Map<string, Facing>();
  private readonly walks = new Map<string, WalkState>();
  private readonly lastArrivedAt = new Map<string, number>();
  private readonly settleTimers = new Map<string, number>();
  private readonly firstPlacedTile = new Map<string, Tile>();
  private readonly walkStartedAt = new Map<string, number>();

  /**
   * Notified with the real playerId whenever a Penguin that might have been
   * showing a chat bubble is removed or re-placed *outside* `say`/`sayLocal`
   * (`remove`/`clear`/a Room-change `detach`) (#44 review fix F1). Fired
   * unconditionally on removal — harmless if that Penguin never had a bubble
   * showing, since callers treat it as an idempotent clear — so a debug
   * snapshot keyed off `say`/`sayLocal`'s own return value never lingers
   * stale for a Penguin that's since gone.
   */
  onBubbleChange: ((playerId: string, text: string | null) => void) | null = null;

  constructor(options: RoomPenguinViewOptions = {}) {
    this.search = options.search ?? window.location.search;
    this.now = options.now ?? Date.now;
    this.scheduleTimeout =
      options.setTimeout ??
      ((handler, ms): number => {
        // `setTimeout`'s ambient global type resolves differently across
        // this project's Node- and DOM-typed compilations; going through
        // `unknown` keeps this default working under either.
        const handle = setTimeout(handler, ms) as unknown;
        // Never hold a test (or any other unattended caller) open on a
        // settle-window timer nobody is driving; a no-op in the browser,
        // where the returned handle is already a plain number.
        (handle as { unref?: () => void }).unref?.();
        return handle as number;
      });
    this.cancelTimeout =
      options.clearTimeout ??
      ((handle) => clearTimeout(handle as unknown as Parameters<typeof clearTimeout>[0]));
  }

  /** Draws into a (new) scene whose Room grid starts at `origin`, re-placing every remembered Penguin. */
  attach(place: PlacePenguin, origin: GridOrigin, walkable: WalkableGrid): void {
    this.attachment = { place, origin, walkable };
    this.placed.clear();
    this.firstPlacedTile.clear();
    for (const key of this.payloads.keys()) this.render(key);
  }

  /**
   * Forgets the current scene's Penguins without destroying them: the scene
   * is tearing them down itself. Any Penguin mid-walk drops its walk,
   * remembering its eventual destination as the tile it's shown at — a
   * pending re-route's `queuedTarget` when one is queued, else the active
   * path's last tile — so a later re-`attach()` (or a Presence upsert)
   * places it there rather than wherever the walk's tween happened to be
   * mid-step (#43 D3).
   */
  detach(): void {
    for (const [playerId, walk] of this.walks) {
      const finalTile = walk.queuedTarget ?? walk.path[walk.path.length - 1];
      this.shownTile.set(playerId, finalTile);
    }
    this.walks.clear();
    for (const playerId of [...this.settleTimers.keys()]) this.clearSettleTimer(playerId);
    this.attachment = null;
    for (const key of this.placed.keys()) this.notifyBubbleCleared(key);
    this.placed.clear();
    this.firstPlacedTile.clear();
  }

  /** Adds or, for an already-shown `playerId`, updates in place (never a second Penguin). */
  upsert(p: PresencePayload): void {
    const key = p.playerId;
    // An unnamed Penguin is never drawn (#75), exactly as `show()` rules.
    if (!p.look.name) {
      this.hide(key);
      return;
    }
    const known = this.payloads.has(key);
    this.payloads.set(key, p);
    if (!known) {
      this.shownTile.set(key, p.tile);
      this.shownFacing.set(key, p.facing);
      this.render(key);
      return;
    }

    // Mid-walk, or within the settle window after arriving: the look (and
    // the remembered payload, just set above) update, but the shown
    // tile/facing stay put (#43 D4).
    if (this.walks.has(key) || this.isSettling(key)) {
      this.render(key);
      return;
    }

    const shown = this.shownTile.get(key);
    if (!shown || !tilesEqual(shown, p.tile)) {
      this.shownTile.set(key, p.tile);
      this.shownFacing.set(key, p.facing);
    }
    this.render(key);
  }

  remove(playerId: string): void {
    this.hide(playerId);
  }

  /** Removes every remote Penguin and the local Penguin. */
  clear(): void {
    for (const key of [...this.payloads.keys()]) this.hide(key);
  }

  /** Shows (or moves and restyles) the signed-in Player's own Penguin; not part of the remote roster. */
  showLocal(p: PresencePayload): void {
    this.show(LOCAL_KEY, p);
  }

  /**
   * Walks the remote Penguin `playerId` to `target`, from its currently
   * shown tile, along `findPath` over the attached Room's walkable grid
   * (#43 D3). Ignored for an unknown `playerId`; a no-op when `target` is
   * already the shown tile and nothing is walking. A `walkTo` that arrives
   * mid-walk is queued and applied once the current step lands, so a
   * re-route follows the sender's own path rather than snapping ahead. An
   * unreachable target places the Penguin there directly, with no
   * animation.
   */
  walkTo(playerId: string, target: Tile): void {
    if (!this.attachment) return;

    const existingWalk = this.walks.get(playerId);
    if (existingWalk) {
      existingWalk.queuedTarget = target;
      return;
    }

    const payload = this.payloads.get(playerId);
    if (!payload) return;

    const from = this.shownTile.get(playerId) ?? payload.tile;
    if (tilesEqual(from, target)) return;

    this.startWalk(playerId, from, target);
  }

  private isSettling(playerId: string): boolean {
    const arrivedAt = this.lastArrivedAt.get(playerId);
    if (arrivedAt === undefined) return false;
    return this.now() - arrivedAt < MOVE_SETTLE_MS;
  }

  /** Schedules (replacing any prior) `MOVE_SETTLE_MS` recheck for `playerId` (#43 D4). */
  private scheduleSettleCheck(playerId: string): void {
    this.clearSettleTimer(playerId);
    const handle = this.scheduleTimeout(() => {
      this.settleTimers.delete(playerId);
      this.recheckSettle(playerId);
    }, MOVE_SETTLE_MS);
    this.settleTimers.set(playerId, handle);
  }

  private clearSettleTimer(playerId: string): void {
    const handle = this.settleTimers.get(playerId);
    if (handle === undefined) return;
    this.cancelTimeout(handle);
    this.settleTimers.delete(playerId);
  }

  /**
   * Fires once, `MOVE_SETTLE_MS` after a walk ended, when nothing since has
   * re-checked Presence against the shown tile (#43 D4): applies a still
   * differing Presence tile without waiting for another `upsert` to notice.
   * A no-op once the Penguin is no longer shown, is walking again, or
   * already agrees with Presence.
   */
  private recheckSettle(playerId: string): void {
    if (this.walks.has(playerId)) return;
    const payload = this.payloads.get(playerId);
    const shown = this.shownTile.get(playerId);
    if (!payload || !shown) return;
    if (tilesEqual(shown, payload.tile)) return;

    this.shownTile.set(playerId, payload.tile);
    this.shownFacing.set(playerId, payload.facing);
    this.render(playerId);
  }

  private startWalk(playerId: string, from: Tile, target: Tile): void {
    const attachment = this.attachment;
    const placed = this.placed.get(playerId);
    if (!attachment || !placed) return;

    this.clearSettleTimer(playerId);

    const path = findPath(attachment.walkable, from, target);
    if (!path || path.length <= 1) {
      this.placeImmediately(playerId, target, placed, attachment);
      return;
    }

    this.walks.set(playerId, { path, index: 0, queuedTarget: null });
    this.lastArrivedAt.delete(playerId);
    this.walkStartedAt.set(playerId, this.now());
    void this.runWalk(playerId);
  }

  /** Snaps straight to `target` (an unreachable `walkTo`), with no walk animation. */
  private placeImmediately(
    playerId: string,
    target: Tile,
    placed: PlacedPenguin,
    attachment: Attachment,
  ): void {
    placed.moveTo(tileToScreen(target, attachment.origin), depthForTile(target));
    placed.idle();
    this.shownTile.set(playerId, target);
    this.lastArrivedAt.set(playerId, this.now());
    this.scheduleSettleCheck(playerId);
  }

  private async runWalk(playerId: string): Promise<void> {
    const placed = this.placed.get(playerId);
    const attachment = this.attachment;
    const thatWalk = this.walks.get(playerId);
    if (!placed || !attachment || !thatWalk) {
      this.walks.delete(playerId);
      return;
    }

    placed.walk();

    for (;;) {
      // A remove/upsert/walkTo for the same `playerId` within one task can
      // replace this walk with a brand-new `WalkState` before this
      // continuation resumes (#43 D3): comparing identity against `thatWalk`
      // catches that, where a plain falsy check on `this.walks.get` would
      // not, since the map still holds *a* walk for this id — just not this
      // one.
      if (this.walks.get(playerId) !== thatWalk) return;
      if (thatWalk.index >= thatWalk.path.length - 1) break;

      const from = thatWalk.path[thatWalk.index];
      const to = thatWalk.path[thatWalk.index + 1];
      const facing = facingForStep(from, to);
      placed.setFacing(facing);
      this.shownFacing.set(playerId, facing);

      await placed.step(tileToScreen(to, attachment.origin), TILE_STEP_MS, (t) =>
        depthForTile(lerpTile(from, to, t)),
      );

      if (this.walks.get(playerId) !== thatWalk) return; // cancelled or replaced mid-step
      thatWalk.index += 1;
      this.shownTile.set(playerId, to);

      // A `walkTo` that arrived mid-step re-paths right here, from the tile
      // this step just landed on, rather than waiting for the rest of the
      // old path to play out (#43 D3): `placed.walk()` is never called
      // again, so the walk animation carries on across the re-route with no
      // restart/flicker.
      const queuedTarget = thatWalk.queuedTarget;
      if (queuedTarget) {
        thatWalk.queuedTarget = null;
        const finished = this.applyQueuedTarget(
          playerId,
          thatWalk,
          to,
          queuedTarget,
          placed,
          attachment,
        );
        if (finished) {
          if (this.walks.get(playerId) === thatWalk) this.walks.delete(playerId);
          return;
        }
      }
    }

    if (this.walks.get(playerId) === thatWalk) this.walks.delete(playerId);
    placed.idle();
    this.lastArrivedAt.set(playerId, this.now());
    this.scheduleSettleCheck(playerId);
  }

  /**
   * Applies a `walkTo` that queued while `landed` was mid-step (#43 D3):
   * re-paths from `landed` toward `queuedTarget`, mutating `walk` (the
   * exact `WalkState` `runWalk`'s loop is iterating) in place. Returns
   * `true` when the walk is finished (either `landed` already is
   * `queuedTarget`, or `queuedTarget` is unreachable and the Penguin was
   * placed there directly) — `runWalk`'s loop should stop. Returns `false`
   * to keep walking the same `WalkState` (now carrying the new path)
   * without restarting its animation.
   */
  private applyQueuedTarget(
    playerId: string,
    walk: WalkState,
    landed: Tile,
    queuedTarget: Tile,
    placed: PlacedPenguin,
    attachment: Attachment,
  ): boolean {
    if (tilesEqual(landed, queuedTarget)) {
      placed.idle();
      this.lastArrivedAt.set(playerId, this.now());
      this.scheduleSettleCheck(playerId);
      return true;
    }

    const path = findPath(attachment.walkable, landed, queuedTarget);
    if (!path || path.length <= 1) {
      this.placeImmediately(playerId, queuedTarget, placed, attachment);
      return true;
    }

    walk.path = path;
    walk.index = 0;
    return false;
  }

  /**
   * Shows (or clears, given `null`) a chat speech bubble above a remote
   * Penguin (#44). No-op for a Player not currently shown. Returns whether a
   * placed Penguin actually received the call (#44 review fix F1): the
   * source of truth for a debug snapshot of bubbles actually rendered,
   * rather than merely requested.
   */
  say(playerId: string, text: string | null): boolean {
    return this.sayAt(playerId, text);
  }

  /** Shows (or clears, given `null`) a chat speech bubble above the local Penguin (#44). No-op (returns `false`) while it isn't shown. */
  sayLocal(text: string | null): boolean {
    return this.sayAt(LOCAL_KEY, text);
  }

  private sayAt(key: PenguinKey, text: string | null): boolean {
    const placed = this.placed.get(key);
    if (!placed) return false;
    placed.say(text);
    return true;
  }

  /**
   * The playerIds of every remote Penguin currently placed (#53
   * `SnowballView.shownRemoteIds`): never the local Penguin, and empty while
   * detached. NPCs are `RoomScene` circles and never live in this view.
   */
  shownRemoteIds(): string[] {
    return [...this.placed.keys()].filter(isPlayerKey);
  }

  /**
   * A placed remote Penguin's current feet point, read from the Penguin
   * itself so a walker mid-step reports where it is drawn, not the tile it
   * is heading to (#53 D3). `null` for the local Penguin or anyone not placed.
   */
  pointOf(playerId: string): ScreenPoint | null {
    return this.placed.get(playerId)?.point() ?? null;
  }

  /**
   * Draws or removes a placed remote Penguin's snow hat (#53 D4). Returns
   * whether a placed Penguin received the call. The hat lives on the placed
   * Penguin only, so `remove`/`clear`/`detach` drop it with the Penguin and
   * a later re-placement never carries it over.
   */
  setSnowHat(playerId: string, on: boolean): boolean {
    const placed = this.placed.get(playerId);
    if (!placed) return false;
    placed.setSnowHat(on);
    return true;
  }

  /** Whether a placed remote Penguin is actually drawing its snow hat right now (#53). */
  hasSnowHat(playerId: string): boolean {
    return this.placed.get(playerId)?.hasSnowHat() ?? false;
  }

  /** Takes the snow hat off every placed remote Penguin (#53: a Room change or session end). */
  clearSnowHats(): void {
    for (const key of this.placed.keys()) {
      if (isPlayerKey(key)) this.placed.get(key)?.setSnowHat(false);
    }
  }

  /** The raw, unmasked name decides whether to draw at all (#75); masking only affects the tag text. */
  private show(key: PenguinKey, p: PresencePayload): void {
    if (!p.look.name) {
      this.hide(key);
      return;
    }
    this.payloads.set(key, p);
    this.render(key);
  }

  private render(key: PenguinKey): void {
    const p = this.payloads.get(key);
    if (!p || !this.attachment) return;
    const { place, origin } = this.attachment;
    const look = this.tagged(p.look);
    const tile = isPlayerKey(key) ? (this.shownTile.get(key) ?? p.tile) : p.tile;
    const facing = isPlayerKey(key) ? (this.shownFacing.get(key) ?? p.facing) : p.facing;
    const point = tileToScreen(tile, origin);
    const depth = depthForTile(tile);
    const existing = this.placed.get(key);
    if (existing) {
      existing.setLook(look);
      // Mid-walk, only the look updates (#43 D4): `runWalk`'s own `step`
      // calls already drive facing and position tile by tile, so a
      // `moveTo`/`setFacing` here would cut the in-flight step short
      // (`PlacePenguin.step`'s contract resolves early on either call),
      // snapping the Penguin back and skipping the next tile.
      if (isPlayerKey(key) && this.walks.has(key)) return;
      existing.setFacing(facing);
      existing.moveTo(point, depth);
      return;
    }
    this.placed.set(key, place(look, point, depth, facing));
    if (isPlayerKey(key) && !this.firstPlacedTile.has(key)) {
      this.firstPlacedTile.set(key, tile);
    }
  }

  /** #31's name tag shows `look.name` (never drawn empty; see `show()`); mask at its input. */
  private tagged(look: PenguinLook): PenguinLook {
    return { ...look, name: maskName(look.name, this.search) };
  }

  private hide(key: PenguinKey): void {
    this.notifyBubbleCleared(key);
    if (isPlayerKey(key)) {
      this.walks.delete(key);
      this.shownTile.delete(key);
      this.shownFacing.delete(key);
      this.lastArrivedAt.delete(key);
      this.firstPlacedTile.delete(key);
      this.walkStartedAt.delete(key);
      this.clearSettleTimer(key);
    }
    this.placed.get(key)?.destroy();
    this.placed.delete(key);
    this.payloads.delete(key);
  }

  /**
   * e2e-only snapshot of every remote Penguin's shown state (#43 D6). See
   * `RemotePenguinDebugInfo` for each field's meaning.
   */
  debugRemotePenguins(): RemotePenguinDebugInfo[] {
    const result: RemotePenguinDebugInfo[] = [];
    for (const [key, payload] of this.payloads) {
      if (!isPlayerKey(key)) continue;
      const tile = this.shownTile.get(key) ?? payload.tile;
      result.push({
        playerId: key,
        tile,
        moving: this.walks.has(key),
        placedTile: this.firstPlacedTile.get(key) ?? tile,
        walkStartedAt: this.walkStartedAt.get(key),
      });
    }
    return result;
  }

  /** Calls `onBubbleChange(playerId, null)` for `key`, if it has a real playerId and is currently placed. */
  private notifyBubbleCleared(key: PenguinKey): void {
    const playerId = this.payloads.get(key)?.playerId;
    if (playerId) this.onBubbleChange?.(playerId, null);
  }
}
