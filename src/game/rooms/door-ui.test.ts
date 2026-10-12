import { describe, expect, it } from 'vitest';
import {
  doorFocusPoint,
  doorGlowPolygon,
  doorHoverText,
  doorTabOrder,
  isInSceneDoor,
  isLockedDoor,
  LOCKED_HINT_TEXT,
} from './door-ui';
import type { RoomDoor } from './room-definition';

const HOTSPOT = { x: 100, y: 200, width: 70, height: 165 };

function door(label: string, extra: Partial<RoomDoor> = {}): RoomDoor {
  return {
    label,
    hotspot: HOTSPOT,
    targetRoomId: 'dev-pit',
    entryTile: { col: 1, row: 1 },
    ...extra,
  };
}

describe('door-ui (#170)', () => {
  it('reads "CLICK TO ENTER · X", or "X · UNDER CONSTRUCTION" for a locked door (door-nav.js)', () => {
    expect(doorHoverText(door('KITCHEN'))).toBe('CLICK TO ENTER · KITCHEN');
    expect(doorHoverText(door('TEAM ROOM 5', { targetRoomId: null }))).toBe(
      'TEAM ROOM 5 · UNDER CONSTRUCTION',
    );
    expect(LOCKED_HINT_TEXT).toBe('UNDER CONSTRUCTION');
  });

  it('treats targetRoomId null as locked, and an unset kind as an in-scene door', () => {
    expect(isLockedDoor(door('A'))).toBe(false);
    expect(isLockedDoor(door('A', { targetRoomId: null }))).toBe(true);
    expect(isInSceneDoor(door('A'))).toBe(true);
    expect(isInSceneDoor(door('A', { kind: 'door' }))).toBe(true);
    expect(isInSceneDoor(door('A', { kind: 'pill' }))).toBe(false);
  });

  it('slants the glow along its wall, half a pixel down per pixel across, inside the hotspot', () => {
    expect(doorGlowPolygon(door('A'))).toBeNull();
    expect(doorGlowPolygon(door('A', { wall: 'right' }))).toEqual([
      { x: 100, y: 200 },
      { x: 170, y: 235 },
      { x: 170, y: 365 },
      { x: 100, y: 330 },
    ]);
    expect(doorGlowPolygon(door('A', { wall: 'left' }))).toEqual([
      { x: 100, y: 235 },
      { x: 170, y: 200 },
      { x: 170, y: 330 },
      { x: 100, y: 365 },
    ]);
  });

  it('never glows a pill, even a twin that kept the wall of its door', () => {
    expect(doorGlowPolygon(door('A', { wall: 'left', kind: 'pill' }))).toBeNull();
  });

  it("puts a focused door's pill at its hotspot's top centre", () => {
    expect(doorFocusPoint(HOTSPOT)).toEqual({ x: 135, y: 200 });
  });

  it('keeps doors order with one Tab stop per label: twins are skipped, a pill-only exit keeps its stop (RT170-12)', () => {
    const jgHq = door('JG HQ');
    const jgHqPill = door('JG HQ', { kind: 'pill' });
    const stairs = door('STAIRS');
    const pillOnly = door('THE MULLET', { kind: 'pill' });
    expect(doorTabOrder([jgHq, stairs, jgHqPill, pillOnly])).toEqual([
      { door: jgHq, tabbable: true },
      { door: stairs, tabbable: true },
      { door: jgHqPill, tabbable: false },
      { door: pillOnly, tabbable: true },
    ]);
  });
});
