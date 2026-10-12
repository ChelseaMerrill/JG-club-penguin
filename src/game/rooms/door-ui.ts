/**
 * The pure half of #170's door behaviour (D3, D4, D6), after
 * `design/door-nav.js`: the hover pill's text, the glow polygon a door on a
 * back wall lights up with, and the doors' Tab order. No Phaser, no DOM.
 */
import type { DoorHotspot, RoomDoor } from './room-definition';

/** The text a locked door or pill shows when used (#170 D4). */
export const LOCKED_HINT_TEXT = 'UNDER CONSTRUCTION';

/** Whether `door` leads nowhere yet (`targetRoomId: null`, #170 D4). */
export function isLockedDoor(door: Pick<RoomDoor, 'targetRoomId'>): boolean {
  return door.targetRoomId === null;
}

/** Whether `door` is drawn in the Room rather than baked as an exit pill (`kind` defaults to `'door'`). */
export function isInSceneDoor(door: Pick<RoomDoor, 'kind'>): boolean {
  return door.kind !== 'pill';
}

/**
 * The hover pill's text (door-nav.js): "CLICK TO ENTER · <label>", or
 * "<label> · UNDER CONSTRUCTION" for a locked door.
 */
export function doorHoverText(door: Pick<RoomDoor, 'label' | 'targetRoomId'>): string {
  return isLockedDoor(door)
    ? `${door.label} · ${LOCKED_HINT_TEXT}`
    : `CLICK TO ENTER · ${door.label}`;
}

/** A Stage-pixel point. */
export interface DoorPoint {
  x: number;
  y: number;
}

/**
 * The glow over a door on a back wall (the design's hover `clip-path`): the
 * hotspot slanted along its wall plane, half a pixel down per pixel across,
 * as the isometric walls are. A right-wall door drops to the right, a
 * left-wall door to the left. `null` for a door with no `wall`.
 */
export function doorGlowPolygon(door: Pick<RoomDoor, 'hotspot' | 'wall'>): DoorPoint[] | null {
  if (!door.wall) return null;
  const { x, y, width, height } = door.hotspot;
  const slant = width / 2;
  return door.wall === 'right'
    ? [
        { x, y },
        { x: x + width, y: y + slant },
        { x: x + width, y: y + height },
        { x, y: y + height - slant },
      ]
    : [
        { x, y: y + slant },
        { x: x + width, y },
        { x: x + width, y: y + height - slant },
        { x, y: y + height },
      ];
}

/** Where the hover pill sits for a door reached by keyboard: its hotspot's top centre. */
export function doorFocusPoint(hotspot: DoorHotspot): DoorPoint {
  return { x: hotspot.x + hotspot.width / 2, y: hotspot.y };
}

/** One exit in Tab order (#170 D6). */
export interface DoorTabStop {
  door: RoomDoor;
  /** `false` for a twin: a pill repeating an earlier door's label, reachable through that door's stop. */
  tabbable: boolean;
}

/**
 * Every exit in `doors` order, each label one Tab stop (RT170-12): a twin
 * (a later exit with an earlier one's label) is listed but not tabbable,
 * while a pill with a label of its own keeps its stop.
 */
export function doorTabOrder(doors: readonly RoomDoor[]): DoorTabStop[] {
  const seen = new Set<string>();
  return doors.map((door) => {
    const tabbable = !seen.has(door.label);
    seen.add(door.label);
    return { door, tabbable };
  });
}
