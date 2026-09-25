import {
  UNNAMED_PENGUIN,
  type Facing,
  type PenguinLook,
  type PresencePayload,
  type Tile,
} from '../../contracts';
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
 * Name tags show `look.name || UNNAMED_PENGUIN`, masked under `?masknames`.
 *
 * #43: `walkTo(playerId, target)` walks a remote Penguin there tile by tile,
 * along the same path/pace #14's local walk uses, rather than snapping it
 * forward. While a Penguin walks, and for `MOVE_SETTLE_MS` after it arrives,
 * a Presence `upsert` updates only its look: Presence's own tile/facing are
 * deferred to so a lagging sync can never snap a walker back mid-stride
 * (#43 D4). The tile actually shown (`shownTile`/`shownFacing`) is tracked
 * independently of the last Presence payload for exactly this reason, and
 * survives a `detach()`/`attach()` Room switch so a Player who leaves and
 * returns mid-walk still sees the walker's last known tile.
 */
export class RoomPenguinView implements RemotePenguinView {
  private readonly search: string;
  private readonly now: () => number;
  private attachment: Attachment | null = null;
  private readonly payloads = new Map<PenguinKey, PresencePayload>();
  private readonly placed = new Map<PenguinKey, PlacedPenguin>();

  // Remote-only tracking (never keyed by `LOCAL_KEY`): the tile/facing
  // actually shown (which a walk in progress may differ from the last
  // Presence payload), the active walk, when each last arrived (the D4
  // settle window), the tile first placed at since the last `attach()`
  // (the e2e `placedTile` hook field, #43 D6), and when its current or last
  // walk started (the e2e `walkStartedAt` latency hook field, fix F4).
  private readonly shownTile = new Map<string, Tile>();
  private readonly shownFacing = new Map<string, Facing>();
  private readonly walks = new Map<string, WalkState>();
  private readonly lastArrivedAt = new Map<string, number>();
  private readonly firstPlacedTile = new Map<string, Tile>();
  private readonly walkStartedAt = new Map<string, number>();

  constructor(options: RoomPenguinViewOptions = {}) {
    this.search = options.search ?? window.location.search;
    this.now = options.now ?? Date.now;
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
   * remembering the walk's final target as the tile it's shown at, so a
   * later re-`attach()` (or a Presence upsert) places it there rather than
   * wherever the walk's tween happened to be mid-step (#43 D3).
   */
  detach(): void {
    for (const [playerId, walk] of this.walks) {
      const finalTile = walk.path[walk.path.length - 1];
      this.shownTile.set(playerId, finalTile);
    }
    this.walks.clear();
    this.attachment = null;
    this.placed.clear();
    this.firstPlacedTile.clear();
  }

  /** Adds or, for an already-shown `playerId`, updates in place (never a second Penguin). */
  upsert(p: PresencePayload): void {
    const key = p.playerId;
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
    if (!this.payloads.has(playerId)) return;
    if (!this.attachment) return;

    const existingWalk = this.walks.get(playerId);
    if (existingWalk) {
      existingWalk.queuedTarget = target;
      return;
    }

    const payload = this.payloads.get(playerId)!;
    const from = this.shownTile.get(playerId) ?? payload.tile;
    if (tilesEqual(from, target)) return;

    this.startWalk(playerId, from, target);
  }

  private isSettling(playerId: string): boolean {
    const arrivedAt = this.lastArrivedAt.get(playerId);
    if (arrivedAt === undefined) return false;
    return this.now() - arrivedAt < MOVE_SETTLE_MS;
  }

  private startWalk(playerId: string, from: Tile, target: Tile): void {
    const attachment = this.attachment;
    const placed = this.placed.get(playerId);
    if (!attachment || !placed) return;

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
  }

  private async runWalk(playerId: string): Promise<void> {
    const placed = this.placed.get(playerId);
    const attachment = this.attachment;
    if (!placed || !attachment) {
      this.walks.delete(playerId);
      return;
    }

    placed.walk();

    for (;;) {
      const walk = this.walks.get(playerId);
      if (!walk) return; // cancelled: remove/clear/detach
      if (walk.index >= walk.path.length - 1) break;

      const from = walk.path[walk.index];
      const to = walk.path[walk.index + 1];
      const facing = facingForStep(from, to);
      placed.setFacing(facing);
      this.shownFacing.set(playerId, facing);

      await placed.step(tileToScreen(to, attachment.origin), TILE_STEP_MS, (t) =>
        depthForTile(lerpTile(from, to, t)),
      );

      const stillWalking = this.walks.get(playerId);
      if (!stillWalking) return; // cancelled mid-step
      stillWalking.index += 1;
      this.shownTile.set(playerId, to);

      // A `walkTo` that arrived mid-step re-paths right here, from the tile
      // this step just landed on, rather than waiting for the rest of the
      // old path to play out (#43 D3 fix): `placed.walk()` is never called
      // again, so the walk animation carries on across the re-route with no
      // restart/flicker.
      const queuedTarget = stillWalking.queuedTarget;
      if (queuedTarget) {
        stillWalking.queuedTarget = null;
        const finished = this.applyQueuedTarget(playerId, to, queuedTarget, placed, attachment);
        if (finished) {
          this.walks.delete(playerId);
          return;
        }
      }
    }

    this.walks.delete(playerId);
    placed.idle();
    this.lastArrivedAt.set(playerId, this.now());
  }

  /**
   * Applies a `walkTo` that queued while `landed` was mid-step (#43 D3):
   * re-paths from `landed` toward `queuedTarget`. Returns `true` when the
   * walk is finished (either `landed` already is `queuedTarget`, or
   * `queuedTarget` is unreachable and the Penguin was placed there
   * directly) — `runWalk`'s loop should stop. Returns `false` to keep
   * walking the same `WalkState` object (now carrying the new path) without
   * restarting its animation.
   */
  private applyQueuedTarget(
    playerId: string,
    landed: Tile,
    queuedTarget: Tile,
    placed: PlacedPenguin,
    attachment: Attachment,
  ): boolean {
    if (tilesEqual(landed, queuedTarget)) {
      placed.idle();
      this.lastArrivedAt.set(playerId, this.now());
      return true;
    }

    const path = findPath(attachment.walkable, landed, queuedTarget);
    if (!path || path.length <= 1) {
      this.placeImmediately(playerId, queuedTarget, placed, attachment);
      return true;
    }

    const walk = this.walks.get(playerId);
    if (!walk) return true; // cancelled concurrently (remove/clear/detach)
    walk.path = path;
    walk.index = 0;
    return false;
  }

  private show(key: PenguinKey, p: PresencePayload): void {
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
      // Mid-walk, only the look updates (#43 D4/fix F1): `runWalk`'s own
      // `step` calls already drive facing and position tile by tile, so a
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

  /** #31's name tag shows `look.name || UNNAMED_PENGUIN`; mask at its input. */
  private tagged(look: PenguinLook): PenguinLook {
    return { ...look, name: maskName(look.name || UNNAMED_PENGUIN, this.search) };
  }

  private hide(key: PenguinKey): void {
    if (isPlayerKey(key)) {
      this.walks.delete(key);
      this.shownTile.delete(key);
      this.shownFacing.delete(key);
      this.lastArrivedAt.delete(key);
      this.firstPlacedTile.delete(key);
      this.walkStartedAt.delete(key);
    }
    this.placed.get(key)?.destroy();
    this.placed.delete(key);
    this.payloads.delete(key);
  }

  /**
   * e2e-only snapshot of every remote Penguin's shown state (#43 D6):
   * `placedTile` is the tile it was first placed at since the last
   * `attach()`, distinct from `tile` (its current, possibly re-routed,
   * shown tile) so a test can tell a late Room join placed it from Presence
   * without racing a `move` broadcast that arrives moments later.
   * `walkStartedAt` is `Date.now()` (this view's `now()`) when its current
   * or last walk started, absent when it has never walked (fix F4: an e2e
   * latency measurement reads this directly, rather than polling the whole
   * hook and paying the round trip/poll interval as measurement noise).
   */
  debugRemotePenguins(): Array<{
    playerId: string;
    tile: Tile;
    moving: boolean;
    placedTile: Tile;
    walkStartedAt?: number;
  }> {
    const result: Array<{
      playerId: string;
      tile: Tile;
      moving: boolean;
      placedTile: Tile;
      walkStartedAt?: number;
    }> = [];
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
}
