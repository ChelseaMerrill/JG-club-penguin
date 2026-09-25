import { describe, expect, it, vi } from 'vitest';
import {
  createEmitter,
  SPAWN_ROOM_ID,
  type RoomEventMap,
  type RoomId,
  type Tile,
  type TypedEmitter,
} from '../../contracts';
import { getRoomDefinition } from './registry';
import type { RoomDoor } from './room-definition';
import { createRoomNavigator, type RoomNavigator, type RoomNavigatorScene } from './room-navigator';

type LoggedEvent =
  { type: 'leave'; roomId: RoomId } | { type: 'enter'; roomId: RoomId; entryTile: Tile };

interface FakeScene extends RoomNavigatorScene {
  showRoomCalls: Array<{ roomId: RoomId; entryTile?: Tile }>;
  comingSoonDoors: RoomDoor[];
  triggerDoorReached: (door: RoomDoor) => void;
}

/** A fake `RoomNavigatorScene`: `whenNextReady()` resolves immediately, so
 *  tests can just `await` the navigator's own methods. */
function createFakeScene(): FakeScene {
  const showRoomCalls: Array<{ roomId: RoomId; entryTile?: Tile }> = [];
  const comingSoonDoors: RoomDoor[] = [];
  let doorHandler: ((door: RoomDoor) => void) | null = null;

  return {
    showRoom: vi.fn((roomId: RoomId, entryTile?: Tile) => {
      showRoomCalls.push({ roomId, entryTile });
      return true;
    }),
    whenNextReady: vi.fn(() => Promise.resolve()),
    onDoorReached: vi.fn((handler: (door: RoomDoor) => void) => {
      doorHandler = handler;
    }),
    showComingSoonHint: vi.fn((door: RoomDoor) => {
      comingSoonDoors.push(door);
    }),
    showRoomCalls,
    comingSoonDoors,
    triggerDoorReached: (door) => doorHandler?.(door),
  };
}

function setup(hasPlayer: () => boolean = () => true): {
  navigator: RoomNavigator;
  scene: FakeScene;
  events: TypedEmitter<RoomEventMap>;
  seen: LoggedEvent[];
} {
  const events = createEmitter<RoomEventMap>();
  const seen: LoggedEvent[] = [];
  events.on('room:leave', ({ roomId }) => seen.push({ type: 'leave', roomId }));
  events.on('room:enter', ({ roomId, entryTile }) =>
    seen.push({ type: 'enter', roomId, entryTile }),
  );
  const scene = createFakeScene();
  const navigator = createRoomNavigator({ scene, events, hasPlayer });
  return { navigator, scene, events, seen };
}

/** Flushes past `changeRoom`'s internal `await`s (a macrotask tick is always after any pending microtask chain). */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const DEV_PIT_DOOR: RoomDoor = {
  label: 'DEV PIT',
  hotspot: { x: 0, y: 0, width: 10, height: 10 },
  targetRoomId: 'dev-pit',
  entryTile: { col: 1, row: 2 },
};

const DISABLED_DOOR: RoomDoor = {
  label: 'THE ICEBOX',
  hotspot: { x: 0, y: 0, width: 10, height: 10 },
  targetRoomId: null,
  entryTile: { col: 0, row: 0 },
};

describe('createRoomNavigator', () => {
  it('changeRoom emits room:leave for the current Room before room:enter for the target', async () => {
    const { navigator, seen } = setup();
    await navigator.enterSpawnRoom();
    seen.length = 0;

    await navigator.changeRoom('dev-pit', { col: 1, row: 2 });

    expect(seen).toEqual([
      { type: 'leave', roomId: 'town-center' },
      { type: 'enter', roomId: 'dev-pit', entryTile: { col: 1, row: 2 } },
    ]);
    expect(navigator.currentRoomId()).toBe('dev-pit');
  });

  it('is a no-op when changing to the already-current Room', async () => {
    const { navigator, scene, seen } = setup();
    await navigator.enterSpawnRoom();
    seen.length = 0;
    const callsBefore = scene.showRoomCalls.length;

    await navigator.changeRoom(SPAWN_ROOM_ID);

    expect(seen).toEqual([]);
    expect(scene.showRoomCalls.length).toBe(callsBefore);
  });

  it('never restarts the scene or emits room:enter while no Player is registered', async () => {
    const { navigator, scene, seen } = setup(() => false);

    await navigator.changeRoom('dev-pit', { col: 1, row: 2 });

    expect(seen).toEqual([]);
    expect(scene.showRoomCalls).toEqual([]);
    expect(navigator.currentRoomId()).toBeNull();
  });

  it('enterSpawnRoom enters SPAWN_ROOM_ID at its spawnTile with no preceding room:leave', async () => {
    const { navigator, seen } = setup();

    await navigator.enterSpawnRoom();

    expect(seen).toEqual([
      {
        type: 'enter',
        roomId: SPAWN_ROOM_ID,
        entryTile: getRoomDefinition(SPAWN_ROOM_ID).spawnTile,
      },
    ]);
    expect(navigator.currentRoomId()).toBe(SPAWN_ROOM_ID);
  });

  it('leaveForSignOut emits room:leave for the current Room and forgets it', async () => {
    const { navigator, seen } = setup();
    await navigator.enterSpawnRoom();
    seen.length = 0;

    navigator.leaveForSignOut();

    expect(seen).toEqual([{ type: 'leave', roomId: SPAWN_ROOM_ID }]);
    expect(navigator.currentRoomId()).toBeNull();
  });

  it('leaveForSignOut is a no-op when no Room is current', () => {
    const { navigator, seen } = setup();

    navigator.leaveForSignOut();

    expect(seen).toEqual([]);
    expect(navigator.currentRoomId()).toBeNull();
  });

  it('an enabled door changes Room to its targetRoomId at its entryTile', async () => {
    const { navigator, scene, seen } = setup();
    await navigator.enterSpawnRoom();
    seen.length = 0;

    scene.triggerDoorReached(DEV_PIT_DOOR);
    await flush();

    expect(navigator.currentRoomId()).toBe('dev-pit');
    expect(seen).toEqual([
      { type: 'leave', roomId: SPAWN_ROOM_ID },
      { type: 'enter', roomId: 'dev-pit', entryTile: DEV_PIT_DOOR.entryTile },
    ]);
  });

  it('a disabled door shows the coming-soon hint and does not change Room', async () => {
    const { navigator, scene, seen } = setup();
    await navigator.enterSpawnRoom();
    seen.length = 0;

    scene.triggerDoorReached(DISABLED_DOOR);
    await flush();

    expect(scene.comingSoonDoors).toEqual([DISABLED_DOOR]);
    expect(navigator.currentRoomId()).toBe(SPAWN_ROOM_ID);
    expect(seen).toEqual([]);
  });
});
