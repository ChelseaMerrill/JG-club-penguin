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
  showRoomCalls: Array<{ roomId: RoomId; entryTile?: Tile; force?: boolean }>;
  comingSoonDoors: RoomDoor[];
  triggerDoorReached: (door: RoomDoor) => void;
  /** Resolves every `whenNextReady()` call currently pending — mirrors one Phaser `CREATE` event notifying every listener registered so far, and no others. */
  fireCreate: () => void;
}

/**
 * A fully controllable fake `RoomNavigatorScene`: `whenNextReady()` only
 * resolves when the test calls `fireCreate()`, so overlapping-transition and
 * mid-transition-interruption tests can drive the exact interleaving they
 * need, the way real Phaser's deferred `Scenes.Events.CREATE` would.
 */
function createFakeScene(): FakeScene {
  const showRoomCalls: Array<{ roomId: RoomId; entryTile?: Tile; force?: boolean }> = [];
  const comingSoonDoors: RoomDoor[] = [];
  let doorHandler: ((door: RoomDoor) => void) | null = null;
  let pendingReady: Array<() => void> = [];

  return {
    showRoom: vi.fn((roomId: RoomId, entryTile?: Tile, force?: boolean) => {
      showRoomCalls.push({ roomId, entryTile, force });
      return true;
    }),
    whenNextReady: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          pendingReady.push(resolve);
        }),
    ),
    onDoorReached: vi.fn((handler: (door: RoomDoor) => void) => {
      doorHandler = handler;
    }),
    showComingSoonHint: vi.fn((door: RoomDoor) => {
      comingSoonDoors.push(door);
    }),
    showRoomCalls,
    comingSoonDoors,
    triggerDoorReached: (door) => doorHandler?.(door),
    fireCreate: () => {
      const resolvers = pendingReady;
      pendingReady = [];
      resolvers.forEach((resolve) => resolve());
    },
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

/** Boots the navigator into `SPAWN_ROOM_ID`, resolving the fake scene's ready signal itself. */
async function boot(scene: FakeScene, navigator: RoomNavigator): Promise<void> {
  const p = navigator.enterSpawnRoom();
  scene.fireCreate();
  await p;
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
    const { navigator, scene, seen } = setup();
    await boot(scene, navigator);
    seen.length = 0;

    const p = navigator.changeRoom('dev-pit', { col: 1, row: 2 });
    scene.fireCreate();
    await p;

    expect(seen).toEqual([
      { type: 'leave', roomId: 'town-center' },
      { type: 'enter', roomId: 'dev-pit', entryTile: { col: 1, row: 2 } },
    ]);
    expect(navigator.currentRoomId()).toBe('dev-pit');
  });

  it('is a no-op when changing to the already-current Room', async () => {
    const { navigator, scene, seen } = setup();
    await boot(scene, navigator);
    seen.length = 0;
    const callsBefore = scene.showRoomCalls.length;

    await navigator.changeRoom(SPAWN_ROOM_ID);

    expect(seen).toEqual([]);
    expect(scene.showRoomCalls.length).toBe(callsBefore);
  });

  it('does nothing before a Session is active: changeRoom never restarts the scene or emits room:enter', async () => {
    const { navigator, scene, seen } = setup();

    await navigator.changeRoom('dev-pit', { col: 1, row: 2 });

    expect(seen).toEqual([]);
    expect(scene.showRoomCalls).toEqual([]);
    expect(navigator.currentRoomId()).toBeNull();
  });

  it('still suppresses room:enter if hasPlayer() goes false exactly as the transition completes (defensive, alongside active)', async () => {
    let playerPresent = true;
    const { navigator, scene, seen } = setup(() => playerPresent);
    await boot(scene, navigator);
    seen.length = 0;

    const p = navigator.changeRoom('dev-pit', { col: 1, row: 2 });
    playerPresent = false; // flips false mid-transition, without going through leaveForSignOut
    scene.fireCreate();
    await p;

    expect(seen).toEqual([{ type: 'leave', roomId: 'town-center' }]);
  });

  it('enterSpawnRoom enters SPAWN_ROOM_ID at its spawnTile with no preceding room:leave', async () => {
    const { navigator, scene, seen } = setup();

    await boot(scene, navigator);

    expect(seen).toEqual([
      {
        type: 'enter',
        roomId: SPAWN_ROOM_ID,
        entryTile: getRoomDefinition(SPAWN_ROOM_ID).spawnTile,
      },
    ]);
    expect(navigator.currentRoomId()).toBe(SPAWN_ROOM_ID);
  });

  it('enterSpawnRoom forces a restart even when Town Center is already shown, so entryTile is the true spawn', async () => {
    const { navigator, scene, seen } = setup();
    await boot(scene, navigator);
    seen.length = 0;
    scene.showRoomCalls.length = 0;

    await boot(scene, navigator);

    expect(scene.showRoomCalls).toEqual([
      { roomId: SPAWN_ROOM_ID, entryTile: undefined, force: true },
    ]);
    // `current` was already SPAWN_ROOM_ID (non-null), so the defensive leave
    // fires here too, even though the target is the same Room it leaves.
    expect(seen).toEqual([
      { type: 'leave', roomId: SPAWN_ROOM_ID },
      {
        type: 'enter',
        roomId: SPAWN_ROOM_ID,
        entryTile: getRoomDefinition(SPAWN_ROOM_ID).spawnTile,
      },
    ]);
  });

  it('enterSpawnRoom emits room:leave first when current is somehow already set (defensive)', async () => {
    const { navigator, scene, seen } = setup();
    await boot(scene, navigator);
    const changeP = navigator.changeRoom('dev-pit', { col: 1, row: 2 });
    scene.fireCreate();
    await changeP;
    seen.length = 0;

    await boot(scene, navigator);

    expect(seen).toEqual([
      { type: 'leave', roomId: 'dev-pit' },
      {
        type: 'enter',
        roomId: SPAWN_ROOM_ID,
        entryTile: getRoomDefinition(SPAWN_ROOM_ID).spawnTile,
      },
    ]);
  });

  it('leaveForSignOut emits room:leave for the current Room, forgets it, and deactivates the Session', async () => {
    const { navigator, scene, seen } = setup();
    await boot(scene, navigator);
    seen.length = 0;

    navigator.leaveForSignOut();

    expect(seen).toEqual([{ type: 'leave', roomId: SPAWN_ROOM_ID }]);
    expect(navigator.currentRoomId()).toBeNull();

    // Inactive again: a door reached after sign-out does nothing.
    scene.triggerDoorReached(DEV_PIT_DOOR);
    expect(seen).toEqual([{ type: 'leave', roomId: SPAWN_ROOM_ID }]);
  });

  it('leaveForSignOut is a no-op when no Room is current', () => {
    const { navigator, seen } = setup();

    navigator.leaveForSignOut();

    expect(seen).toEqual([]);
    expect(navigator.currentRoomId()).toBeNull();
  });

  it('an enabled door changes Room to its targetRoomId at its entryTile', async () => {
    const { navigator, scene, seen } = setup();
    await boot(scene, navigator);
    seen.length = 0;

    scene.triggerDoorReached(DEV_PIT_DOOR);
    scene.fireCreate();
    await Promise.resolve(); // let the door handler's fire-and-forget changeRoom settle

    expect(navigator.currentRoomId()).toBe('dev-pit');
    expect(seen).toEqual([
      { type: 'leave', roomId: SPAWN_ROOM_ID },
      { type: 'enter', roomId: 'dev-pit', entryTile: DEV_PIT_DOOR.entryTile },
    ]);
  });

  it('a disabled door shows the coming-soon hint and does not change Room', async () => {
    const { navigator, scene, seen } = setup();
    await boot(scene, navigator);
    seen.length = 0;

    scene.triggerDoorReached(DISABLED_DOOR);
    await Promise.resolve();

    expect(scene.comingSoonDoors).toEqual([DISABLED_DOOR]);
    expect(navigator.currentRoomId()).toBe(SPAWN_ROOM_ID);
    expect(seen).toEqual([]);
  });

  it('a door reached before a Session is active does nothing at all, not even the coming-soon hint', () => {
    const { scene } = setup();

    scene.triggerDoorReached(DEV_PIT_DOOR);
    scene.triggerDoorReached(DISABLED_DOOR);

    expect(scene.showRoomCalls).toEqual([]);
    expect(scene.comingSoonDoors).toEqual([]);
  });

  describe('overlapping transitions', () => {
    it('drops a second changeRoom while the first is still in flight; leave still precedes the surviving enter', async () => {
      const { navigator, scene, seen } = setup();
      await boot(scene, navigator);
      seen.length = 0;
      scene.showRoomCalls.length = 0;

      const p1 = navigator.changeRoom('dev-pit', { col: 1, row: 2 });
      // A second input arrives in the same frame (e.g. a door arrival and an
      // IGLOO click): dropped outright, not queued.
      const p2 = navigator.changeRoom('igloo');

      scene.fireCreate();
      await Promise.all([p1, p2]);

      expect(seen).toEqual([
        { type: 'leave', roomId: 'town-center' },
        { type: 'enter', roomId: 'dev-pit', entryTile: { col: 1, row: 2 } },
      ]);
      expect(navigator.currentRoomId()).toBe('dev-pit');
      expect(scene.showRoomCalls).toEqual([
        { roomId: 'dev-pit', entryTile: { col: 1, row: 2 }, force: false },
      ]);
    });

    it('a later enterSpawnRoom supersedes an in-flight changeRoom: the earlier transition never emits its own room:enter', async () => {
      const { navigator, scene, seen } = setup();
      await boot(scene, navigator);
      seen.length = 0;

      const changeP = navigator.changeRoom('dev-pit', { col: 1, row: 2 }); // subscribes its own whenNextReady; restart pending
      const spawnP = navigator.enterSpawnRoom(); // forces through even mid-transition, superseding it

      scene.fireCreate(); // satisfies both pending whenNextReady() waiters at once

      await Promise.all([changeP, spawnP]);

      expect(seen).toEqual([
        { type: 'leave', roomId: 'town-center' }, // changeRoom's own leave
        { type: 'leave', roomId: 'dev-pit' }, // enterSpawnRoom's defensive leave (current was optimistically 'dev-pit')
        {
          type: 'enter',
          roomId: SPAWN_ROOM_ID,
          entryTile: getRoomDefinition(SPAWN_ROOM_ID).spawnTile,
        },
      ]);
      expect(navigator.currentRoomId()).toBe(SPAWN_ROOM_ID);
    });

    it('sign-out mid-transition emits no room:enter for the interrupted transition', async () => {
      const { navigator, scene, seen } = setup();
      await boot(scene, navigator);
      seen.length = 0;

      const changeP = navigator.changeRoom('dev-pit', { col: 1, row: 2 });
      navigator.leaveForSignOut(); // interrupts before the restart's ready signal fires

      scene.fireCreate(); // the pending restart finally "completes"
      await changeP;

      expect(seen).toEqual([
        { type: 'leave', roomId: 'town-center' }, // changeRoom's own leave
        { type: 'leave', roomId: 'dev-pit' }, // leaveForSignOut's leave (current was optimistically 'dev-pit')
      ]);
      expect(navigator.currentRoomId()).toBeNull();
    });
  });
});
