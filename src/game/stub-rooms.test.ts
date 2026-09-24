import { describe, expect, it } from 'vitest';
import { createEmitter, type RoomEventMap, type TypedEmitter } from '../contracts';
import { createStubRoomDriver, entryTileFor } from './stub-rooms';

type Seen =
  | { type: 'leave'; event: RoomEventMap['room:leave'] }
  | { type: 'enter'; event: RoomEventMap['room:enter'] };

function setup(): { events: TypedEmitter<RoomEventMap>; seen: Seen[] } {
  const events = createEmitter<RoomEventMap>();
  const seen: Seen[] = [];
  events.on('room:leave', (event) => seen.push({ type: 'leave', event }));
  events.on('room:enter', (event) => seen.push({ type: 'enter', event }));
  return { events, seen };
}

const ALICE = '6f1c2a9e-0000-4000-8000-000000000001';
const BOB = '6f1c2a9e-0000-4000-8000-000000000002';

describe('entryTileFor', () => {
  it('always lands inside cols 3..8 and rows 3..8', () => {
    for (let i = 0; i < 200; i++) {
      const { col, row } = entryTileFor(`player-${i}`);
      expect(col).toBeGreaterThanOrEqual(3);
      expect(col).toBeLessThanOrEqual(8);
      expect(row).toBeGreaterThanOrEqual(3);
      expect(row).toBeLessThanOrEqual(8);
    }
  });

  it('is stable for one playerId and spreads two different Players onto different tiles', () => {
    expect(entryTileFor(ALICE)).toEqual(entryTileFor(ALICE));
    expect(entryTileFor(ALICE)).not.toEqual(entryTileFor(BOB));
  });
});

describe('createStubRoomDriver', () => {
  it("emits only room:enter, at the Player's entry tile, on the first enter", () => {
    const { events, seen } = setup();
    const driver = createStubRoomDriver(events);

    driver.enter('town-center', ALICE);

    expect(seen).toEqual([
      { type: 'enter', event: { roomId: 'town-center', entryTile: entryTileFor(ALICE) } },
    ]);
    expect(driver.currentRoom()).toBe('town-center');
  });

  it('emits room:leave for the current Room before room:enter for the next one', () => {
    const { events, seen } = setup();
    const driver = createStubRoomDriver(events);
    driver.enter('town-center', ALICE);
    seen.length = 0;

    driver.enter('dev-pit', ALICE);

    expect(seen).toEqual([
      { type: 'leave', event: { roomId: 'town-center' } },
      { type: 'enter', event: { roomId: 'dev-pit', entryTile: entryTileFor(ALICE) } },
    ]);
    expect(driver.currentRoom()).toBe('dev-pit');
  });

  it('is a no-op when entering the current Room again', () => {
    const { events, seen } = setup();
    const driver = createStubRoomDriver(events);
    driver.enter('town-center', ALICE);
    seen.length = 0;

    driver.enter('town-center', ALICE);

    expect(seen).toEqual([]);
  });

  it('reset() emits room:leave for the current Room, then forgets it', () => {
    const { events, seen } = setup();
    const driver = createStubRoomDriver(events);
    driver.enter('town-center', ALICE);
    seen.length = 0;

    driver.reset();

    expect(seen).toEqual([{ type: 'leave', event: { roomId: 'town-center' } }]);
    expect(driver.currentRoom()).toBeNull();
  });

  it('reset() emits nothing when no Room is current', () => {
    const { events, seen } = setup();
    const driver = createStubRoomDriver(events);

    driver.reset();

    expect(seen).toEqual([]);
  });
});
