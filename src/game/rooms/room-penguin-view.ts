import {
  UNNAMED_PENGUIN,
  type Facing,
  type PenguinLook,
  type PresencePayload,
} from '../../contracts';
import type { RemotePenguinView } from '../../realtime/room-channel';
import { maskName } from '../../ui/mask-names';
import type { PenguinAnim } from '../penguin';
import { depthForTile, tileToScreen, type GridOrigin, type ScreenPoint } from './iso';

/** One Penguin placed on the rendering stage (a #31 `Penguin` in `RoomScene`). */
export interface PlacedPenguin {
  setLook(look: PenguinLook): void;
  setFacing(facing: Facing): void;
  moveTo(point: ScreenPoint, depth: number): void;
  /** Shows a chat speech bubble above the Penguin, or clears it (`null`) (#44). */
  say(text: string | null): void;
  /** Plays `anim` immediately, e.g. a #47 Emote pose. */
  play(anim: PenguinAnim): void;
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
}

interface Attachment {
  place: PlacePenguin;
  origin: GridOrigin;
}

const LOCAL_KEY = Symbol('local');
type PenguinKey = string | typeof LOCAL_KEY;

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
 */
export class RoomPenguinView implements RemotePenguinView {
  private readonly search: string;
  private attachment: Attachment | null = null;
  private readonly payloads = new Map<PenguinKey, PresencePayload>();
  private readonly placed = new Map<PenguinKey, PlacedPenguin>();

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
  }

  /** Draws into a (new) scene whose Room grid starts at `origin`, re-placing every remembered Penguin. */
  attach(place: PlacePenguin, origin: GridOrigin): void {
    this.attachment = { place, origin };
    this.placed.clear();
    for (const key of this.payloads.keys()) this.render(key);
  }

  /** Forgets the current scene's Penguins without destroying them: the scene is tearing them down itself. */
  detach(): void {
    this.attachment = null;
    for (const key of this.placed.keys()) this.notifyBubbleCleared(key);
    this.placed.clear();
  }

  /** Adds or, for an already-shown `playerId`, updates in place (never a second Penguin). */
  upsert(p: PresencePayload): void {
    this.show(p.playerId, p);
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

  /**
   * Plays (or clears, given `null`) a #47 Emote pose on a remote Penguin.
   * Clearing returns it to its own look's idle emote: remote Penguins have
   * no local walk-anim state to prefer instead (unlike the local Penguin,
   * `RoomScene` owns that). No-op (returns `false`) for a Player not
   * currently shown.
   */
  playEmote(playerId: string, anim: PenguinAnim | null): boolean {
    return this.playEmoteAt(playerId, anim);
  }

  private sayAt(key: PenguinKey, text: string | null): boolean {
    const placed = this.placed.get(key);
    if (!placed) return false;
    placed.say(text);
    return true;
  }

  private playEmoteAt(key: PenguinKey, anim: PenguinAnim | null): boolean {
    const placed = this.placed.get(key);
    if (!placed) return false;
    if (anim !== null) {
      placed.play(anim);
      return true;
    }
    const payload = this.payloads.get(key);
    placed.play(payload ? payload.look.emote : 'WADDLE');
    return true;
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
    const point = tileToScreen(p.tile, origin);
    const depth = depthForTile(p.tile);
    const existing = this.placed.get(key);
    if (existing) {
      existing.setLook(look);
      existing.setFacing(p.facing);
      existing.moveTo(point, depth);
      return;
    }
    this.placed.set(key, place(look, point, depth, p.facing));
  }

  /** #31's name tag shows `look.name || UNNAMED_PENGUIN`; mask at its input. */
  private tagged(look: PenguinLook): PenguinLook {
    return { ...look, name: maskName(look.name || UNNAMED_PENGUIN, this.search) };
  }

  private hide(key: PenguinKey): void {
    this.notifyBubbleCleared(key);
    this.placed.get(key)?.destroy();
    this.placed.delete(key);
    this.payloads.delete(key);
  }

  /** Calls `onBubbleChange(playerId, null)` for `key`, if it has a real playerId and is currently placed. */
  private notifyBubbleCleared(key: PenguinKey): void {
    const playerId = this.payloads.get(key)?.playerId;
    if (playerId) this.onBubbleChange?.(playerId, null);
  }
}
