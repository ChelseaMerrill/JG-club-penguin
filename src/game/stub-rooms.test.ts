import { describe, expect, it } from 'vitest';
import { createEmitter } from '../contracts/game-events';
import type { GameEventMap } from '../contracts/game-events';
import type { RoomEnterEvent, RoomLeaveEvent } from '../contracts/rooms';
import { createStubRoomDriver, ENTRY_TILE } from './stub-rooms';

type Seen = { type: 'leave'; event: RoomLeaveEvent } | { type: 'enter'; event: RoomEnterEvent };

function setup(): { events: ReturnType<typeof createEmitter<GameEventMap>>; seen: Seen[] } {
  const events = createEmitter<GameEventMap>();
  const seen: Seen[] = [];
  events.on('room:leave', (event) => seen.push({ type: 'leave', event }));
  events.on('room:enter', (event) => seen.push({ type: 'enter', event }));
  return { events, seen };
}

describe('createStubRoomDriver', () => {
  it('emits only room:enter, at the fixed entry tile, on the first enter', () => {
    const { events, seen } = setup();
    const driver = createStubRoomDriver(events);

    driver.enter('town-center');

    expect(seen).toEqual([
      { type: 'enter', event: { roomId: 'town-center', entryTile: ENTRY_TILE } },
    ]);
    expect(driver.currentRoom()).toBe('town-center');
  });

  it('emits room:leave for the current Room before room:enter for the next one', () => {
    const { events, seen } = setup();
    const driver = createStubRoomDriver(events);
    driver.enter('town-center');
    seen.length = 0;

    driver.enter('dev-pit');

    expect(seen).toEqual([
      { type: 'leave', event: { roomId: 'town-center' } },
      { type: 'enter', event: { roomId: 'dev-pit', entryTile: ENTRY_TILE } },
    ]);
    expect(driver.currentRoom()).toBe('dev-pit');
  });

  it('is a no-op when entering the current Room again', () => {
    const { events, seen } = setup();
    const driver = createStubRoomDriver(events);
    driver.enter('town-center');
    seen.length = 0;

    driver.enter('town-center');

    expect(seen).toEqual([]);
  });

  it('reset() forgets the current Room without emitting anything', () => {
    const { events, seen } = setup();
    const driver = createStubRoomDriver(events);
    driver.enter('town-center');
    seen.length = 0;

    driver.reset();

    expect(seen).toEqual([]);
    expect(driver.currentRoom()).toBeNull();
  });
});
