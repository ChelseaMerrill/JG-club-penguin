/**
 * Snowball mode's pure rules (#53): the throw arc, hit selection, throwId
 * generation, the receiver's per-sender throw memory (D7), and the off-grid
 * reticle clamp (D8). No timers, no Phaser, no realtime imports — everything
 * here is a function of its explicit inputs, so `snowball-controller.ts` and
 * (later) `RoomScene` can each drive it deterministically.
 */
import type { Tile } from '../contracts';

/** Fixed flight time for a thrown snowball's arc, in ms (#53 D2). */
export const SNOWBALL_FLIGHT_MS = 600;

/** How long a snow hat stays on a hit Penguin, in ms, from the receiving client's own receipt (#53 D4). */
export const SNOW_HAT_MS = 10_000;

/** Hit ellipse half-extents, in Stage pixels, centred on the landing point (#53 D3: one Tile's iso half-extents). */
export const HIT_ELLIPSE_RX = 50;
export const HIT_ELLIPSE_RY = 25;

/** A point in Stage pixels (never Tile coordinates). */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * A point at `t` (0..1) along the thrown snowball's arc from `from` to `to`:
 * a quadratic Bezier whose control point sits at the midpoint, raised by
 * `max(80, 0.35 * distance)` px (#53 D2, matching the design's `Q` curve).
 */
export function arcPoint(from: ScreenPoint, to: ScreenPoint, t: number): ScreenPoint {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const lift = Math.max(80, 0.35 * distance);
  const control: ScreenPoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2 - lift,
  };
  const mt = 1 - t;
  return {
    x: mt * mt * from.x + 2 * mt * t * control.x + t * t * to.x,
    y: mt * mt * from.y + 2 * mt * t * control.y + t * t * to.y,
  };
}

/** A remote Player Penguin's current screen point, as a hit candidate (#53 D3: never the thrower, never an NPC). */
export interface HitCandidate {
  playerId: string;
  point: ScreenPoint;
}

/**
 * Picks the hit among `candidates` for a snowball landing at `landing`
 * (#53 D3): the one whose point lies inside the ellipse centred on `landing`
 * (half-extents `HIT_ELLIPSE_RX`/`HIT_ELLIPSE_RY`), nearest by normalised
 * ellipse distance. `null` when no candidate is inside the ellipse (or the
 * list is empty, e.g. no shown remote Penguins — #53 O3).
 */
export function pickHit(landing: ScreenPoint, candidates: readonly HitCandidate[]): string | null {
  let best: { playerId: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const nx = (candidate.point.x - landing.x) / HIT_ELLIPSE_RX;
    const ny = (candidate.point.y - landing.y) / HIT_ELLIPSE_RY;
    const distance = nx * nx + ny * ny;
    if (distance > 1) continue;
    if (best === null || distance < best.distance)
      best = { playerId: candidate.playerId, distance };
  }
  return best?.playerId ?? null;
}

const THROW_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const THROW_ID_LENGTH = 12;

/**
 * Generates a sender-unique throwId matching the wire contract's
 * `[A-Za-z0-9]{1,16}` (#53 D1). `random` is injectable for deterministic
 * tests; defaults to `Math.random`.
 */
export function generateThrowId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < THROW_ID_LENGTH; i++) {
    id += THROW_ID_ALPHABET[Math.floor(random() * THROW_ID_ALPHABET.length)];
  }
  return id;
}

/** At most this many remembered throws per sender (#53 v4 change 13). */
const THROW_MEMORY_CAP = 8;

/** A remembered throw expires this long after it was remembered (#53 D7). */
const THROW_MEMORY_EXPIRY_MS = 3000;

interface RememberedThrow {
  throwId: string;
  at: number;
  used: boolean;
}

/**
 * A receiver's per-sender memory of recently-seen `snowball:throw` ids
 * (#53 D7): at most the last `THROW_MEMORY_CAP` throws per sender, each
 * expiring `THROW_MEMORY_EXPIRY_MS` after it was remembered. A `snowball:hit`
 * is applied only if it names a remembered, unused, unexpired `throwId` from
 * the same sender — one hit per throw; an unknown or reused `throwId` is
 * dropped.
 */
export class ThrowMemory {
  private readonly bySender = new Map<string, RememberedThrow[]>();

  /** Remembers `throwId` from `sender`, seen at `now`. */
  remember(sender: string, throwId: string, now: number): void {
    this.prune(sender, now);
    const list = this.bySender.get(sender) ?? [];
    list.push({ throwId, at: now, used: false });
    if (list.length > THROW_MEMORY_CAP) list.splice(0, list.length - THROW_MEMORY_CAP);
    this.bySender.set(sender, list);
  }

  /**
   * Marks `throwId` used if it is a remembered, unused, unexpired throw from
   * `sender`, and returns whether it was (a `false` result means the hit
   * naming it should be dropped: unknown, reused, or expired).
   */
  consume(sender: string, throwId: string, now: number): boolean {
    this.prune(sender, now);
    const list = this.bySender.get(sender);
    if (!list) return false;
    const entry = list.find((e) => e.throwId === throwId);
    if (!entry || entry.used) return false;
    entry.used = true;
    return true;
  }

  /** Forgets everything (Room change or `stop()`). */
  clear(): void {
    this.bySender.clear();
  }

  private prune(sender: string, now: number): void {
    const list = this.bySender.get(sender);
    if (!list) return;
    const kept = list.filter((e) => now - e.at < THROW_MEMORY_EXPIRY_MS);
    if (kept.length === 0) this.bySender.delete(sender);
    else this.bySender.set(sender, kept);
  }
}

/** A Room grid's size, in Tiles (structurally matches `RoomGrid` in `src/game/rooms/room-definition.ts`). */
export interface TileGridSize {
  columns: number;
  rows: number;
}

/** The highest Tile coordinate the wire contract accepts (`isTile` in `src/realtime/room-channel.ts`). */
const MAX_WIRE_TILE = 255;

/**
 * Clamps `tile` to the nearest in-grid Tile: `0..min(255, columns-1)` /
 * `0..min(255, rows-1)` (#53 D8 N7). Walkability is not required; this is
 * only the reticle's off-grid clamp, not a movement check.
 */
export function clampTileToGrid(tile: Tile, grid: TileGridSize): Tile {
  const maxCol = Math.min(MAX_WIRE_TILE, grid.columns - 1);
  const maxRow = Math.min(MAX_WIRE_TILE, grid.rows - 1);
  return {
    col: Math.min(Math.max(tile.col, 0), Math.max(0, maxCol)),
    row: Math.min(Math.max(tile.row, 0), Math.max(0, maxRow)),
  };
}
