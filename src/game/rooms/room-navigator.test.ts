import { describe, expect, it, vi } from 'vitest';
import {
  createEmitter,
  SPAWN_ROOM_ID,
  type RoomEventMap,
  type RoomId,
  type Tile,
  type TypedEmitter,
} from '../../contracts';
import { direction, floorLabel, ROOM_FLOORS } from './floors';
import { getRoomDefinition } from './registry';
import type { RoomDoor } from './room-definition';
import type { FloorChoice } from './room-definition';
import {
  createRoomNavigator,
  type RoomFade,
  type RoomNavigator,
  type RoomNavigatorScene,
  type RoomTransitionScreen,
} from './room-navigator';

type LoggedEvent =
  { type: 'leave'; roomId: RoomId } | { type: 'enter'; roomId: RoomId; entryTile: Tile };

interface FakeScene extends RoomNavigatorScene {
  showRoomCalls: Array<{ roomId: RoomId; entryTile?: Tile; force?: boolean }>;
  lockedDoors: RoomDoor[];
  /** Labels Anthony guards: `redirectGuardedDoor` redirects these (#170 D7). */
  guardedLabels: Set<string>;
  /** Every door `redirectGuardedDoor` redirected, oldest first. */
  redirected: RoomDoor[];
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
  const lockedDoors: RoomDoor[] = [];
  const guardedLabels = new Set<string>();
  const redirected: RoomDoor[] = [];
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
    showLockedHint: vi.fn((door: RoomDoor) => {
      lockedDoors.push(door);
    }),
    redirectGuardedDoor: vi.fn((door: RoomDoor) => {
      if (!guardedLabels.has(door.label)) return false;
      redirected.push(door);
      return true;
    }),
    showRoomCalls,
    lockedDoors,
    guardedLabels,
    redirected,
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

  it('a locked door shows the UNDER CONSTRUCTION hint and does not change Room', async () => {
    const { navigator, scene, seen } = setup();
    await boot(scene, navigator);
    seen.length = 0;

    scene.triggerDoorReached(DISABLED_DOOR);
    await Promise.resolve();

    expect(scene.lockedDoors).toEqual([DISABLED_DOOR]);
    expect(navigator.currentRoomId()).toBe(SPAWN_ROOM_ID);
    expect(seen).toEqual([]);
  });

  it('a door reached before a Session is active does nothing at all, not even the UNDER CONSTRUCTION hint', () => {
    const { scene } = setup();

    scene.triggerDoorReached(DEV_PIT_DOOR);
    scene.triggerDoorReached(DISABLED_DOOR);

    expect(scene.showRoomCalls).toEqual([]);
    expect(scene.lockedDoors).toEqual([]);
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

  describe('transitionScreen (#52)', () => {
    type TransitionCall =
      { type: 'begin'; from: RoomId; to: RoomId } | { type: 'ready' } | { type: 'cancel' };

    function createFakeTransitionScreen(): RoomTransitionScreen & { calls: TransitionCall[] } {
      const calls: TransitionCall[] = [];
      return {
        calls,
        begin: (from, to) => calls.push({ type: 'begin', from, to }),
        ready: () => calls.push({ type: 'ready' }),
        cancel: () => calls.push({ type: 'cancel' }),
      };
    }

    function beginCalls(calls: TransitionCall[]): TransitionCall[] {
      return calls.filter((call) => call.type === 'begin');
    }

    it('never calls begin for a same-floor changeRoom (town-center -> dev-pit, both floor 5)', async () => {
      const transitionScreen = createFakeTransitionScreen();
      const events = createEmitter<RoomEventMap>();
      const scene = createFakeScene();
      const navigator = createRoomNavigator({
        scene,
        events,
        hasPlayer: () => true,
        transitionScreen,
      });
      await boot(scene, navigator);

      const p = navigator.changeRoom('dev-pit', { col: 1, row: 2 });
      scene.fireCreate();
      await p;

      expect(beginCalls(transitionScreen.calls)).toEqual([]);
    });

    it('never calls begin toward or from a Room with no floor (the Igloo)', async () => {
      const transitionScreen = createFakeTransitionScreen();
      const events = createEmitter<RoomEventMap>();
      const scene = createFakeScene();
      const navigator = createRoomNavigator({
        scene,
        events,
        hasPlayer: () => true,
        transitionScreen,
      });
      await boot(scene, navigator);

      const p = navigator.changeRoom('igloo');
      scene.fireCreate();
      await p;

      expect(beginCalls(transitionScreen.calls)).toEqual([]);
    });

    it('never calls begin for enterSpawnRoom (no "from" floor to leave)', async () => {
      const transitionScreen = createFakeTransitionScreen();
      const events = createEmitter<RoomEventMap>();
      const scene = createFakeScene();
      const navigator = createRoomNavigator({
        scene,
        events,
        hasPlayer: () => true,
        transitionScreen,
      });

      await boot(scene, navigator);

      expect(beginCalls(transitionScreen.calls)).toEqual([]);
    });

    it('never calls begin for a dropped changeRoom (a transition already in flight)', async () => {
      const transitionScreen = createFakeTransitionScreen();
      const events = createEmitter<RoomEventMap>();
      const scene = createFakeScene();
      const navigator = createRoomNavigator({
        scene,
        events,
        hasPlayer: () => true,
        transitionScreen,
      });
      await boot(scene, navigator);

      const p1 = navigator.changeRoom('dev-pit', { col: 1, row: 2 });
      // Dropped outright (transitionInFlight): a real floor crossing that,
      // if it ran at all, would otherwise call begin.
      const p2 = navigator.changeRoom('roof-deck');
      scene.fireCreate();
      await Promise.all([p1, p2]);

      expect(beginCalls(transitionScreen.calls)).toEqual([]);
    });

    it('calls begin after room:leave and before showRoom for a floor-crossing changeRoom, then ready() once the restart resolves', async () => {
      const order: string[] = [];
      const events = createEmitter<RoomEventMap>();
      events.on('room:leave', () => order.push('room:leave'));
      events.on('room:enter', () => order.push('room:enter'));
      const scene = createFakeScene();
      const realShowRoom = scene.showRoom;
      scene.showRoom = vi.fn((roomId: RoomId, entryTile?: Tile, force?: boolean) => {
        order.push('showRoom');
        return realShowRoom(roomId, entryTile, force);
      });
      const transitionScreen: RoomTransitionScreen = {
        begin: (from, to) => order.push(`begin:${from}->${to}`),
        ready: () => order.push('ready'),
        cancel: () => order.push('cancel'),
      };
      const navigator = createRoomNavigator({
        scene,
        events,
        hasPlayer: () => true,
        transitionScreen,
      });
      await boot(scene, navigator);
      order.length = 0;

      const p = navigator.changeRoom('roof-deck');
      scene.fireCreate();
      await p;

      expect(order).toEqual([
        'room:leave',
        'begin:town-center->roof-deck',
        'showRoom',
        'ready',
        'room:enter',
      ]);
    });

    it('enterSpawnRoom calls cancel() first, so a stale transition can never leave the overlay stuck (#52 review MINOR)', async () => {
      const transitionScreen = createFakeTransitionScreen();
      const events = createEmitter<RoomEventMap>();
      const scene = createFakeScene();
      const navigator = createRoomNavigator({
        scene,
        events,
        hasPlayer: () => true,
        transitionScreen,
      });

      await boot(scene, navigator);

      expect(transitionScreen.calls[0]).toEqual({ type: 'cancel' });
    });

    it('when showRoom returns false, ready() fires immediately, before room:enter, without waiting for whenNextReady (#52 review)', async () => {
      const order: string[] = [];
      const events = createEmitter<RoomEventMap>();
      events.on('room:leave', () => order.push('room:leave'));
      events.on('room:enter', () => order.push('room:enter'));
      const transitionScreen: RoomTransitionScreen = {
        begin: (from, to) => order.push(`begin:${from}->${to}`),
        ready: () => order.push('ready'),
        cancel: () => order.push('cancel'),
      };
      const scene: RoomNavigatorScene = {
        showRoom: () => false,
        // Never resolves: proves `enterRoom` never awaits it when `showRoom`
        // reports `switched: false`.
        whenNextReady: () => new Promise<void>(() => {}),
        onDoorReached: () => {},
        showLockedHint: () => {},
        redirectGuardedDoor: () => false,
      };
      const navigator = createRoomNavigator({
        scene,
        events,
        hasPlayer: () => true,
        transitionScreen,
      });
      await navigator.enterSpawnRoom(); // showRoom() false here too, so this also resolves at once
      order.length = 0;

      await navigator.changeRoom('roof-deck');

      expect(order).toEqual(['room:leave', 'begin:town-center->roof-deck', 'ready', 'room:enter']);
    });

    it('leaveForSignOut calls cancel()', async () => {
      const transitionScreen = createFakeTransitionScreen();
      const events = createEmitter<RoomEventMap>();
      const scene = createFakeScene();
      const navigator = createRoomNavigator({
        scene,
        events,
        hasPlayer: () => true,
        transitionScreen,
      });
      await boot(scene, navigator);

      navigator.leaveForSignOut();

      expect(transitionScreen.calls).toContainEqual({ type: 'cancel' });
    });

    it('a stale token (sign-out mid-transition) skips ready()', async () => {
      const transitionScreen = createFakeTransitionScreen();
      const events = createEmitter<RoomEventMap>();
      const scene = createFakeScene();
      const navigator = createRoomNavigator({
        scene,
        events,
        hasPlayer: () => true,
        transitionScreen,
      });
      await boot(scene, navigator);
      transitionScreen.calls.length = 0;

      const p = navigator.changeRoom('roof-deck'); // begins the screen; restart still pending
      navigator.leaveForSignOut(); // interrupts before the restart's ready signal fires

      scene.fireCreate(); // the pending restart finally "completes"
      await p;

      expect(transitionScreen.calls).toEqual([
        { type: 'begin', from: 'town-center', to: 'roof-deck' },
        { type: 'cancel' },
      ]);
    });

    describe('the Stairwell (#51 slice 4, S4-D6)', () => {
      /** A navigator booted into Town Center, then walked through `rooms` in turn. */
      async function walk(rooms: RoomId[]): Promise<TransitionCall[]> {
        const transitionScreen = createFakeTransitionScreen();
        const scene = createFakeScene();
        const navigator = createRoomNavigator({
          scene,
          events: createEmitter<RoomEventMap>(),
          hasPlayer: () => true,
          transitionScreen,
        });
        await boot(scene, navigator);
        for (const roomId of rooms) {
          const p = navigator.changeRoom(roomId);
          scene.fireCreate();
          await p;
        }
        return beginCalls(transitionScreen.calls);
      }

      it('shows no Elevator between Stairwell floors, up or down, a floor or several at a time', async () => {
        expect(
          await walk([
            'stairwell-5',
            'stairwell-4',
            'stairwell-3',
            'stairwell-2',
            'stairwell-1',
            'stairwell-0',
            'stairwell-1',
            'stairwell-4',
          ]),
        ).toEqual([]);
      });

      it('shows no Elevator between floor 5 and the Roof Deck, either way', async () => {
        expect(await walk(['stairwell-5', 'roof-deck', 'stairwell-5'])).toEqual([]);
      });

      it('shows no Elevator from Town Center to floor 5, the same floor', async () => {
        expect(await walk(['stairwell-5', 'town-center'])).toEqual([]);
      });

      it('still shows it from Town Center to floor 0, heading "WADDLING DOWN TO FLOOR L"', async () => {
        const begins = await walk(['stairwell-0']);
        expect(begins).toEqual([{ type: 'begin', from: 'town-center', to: 'stairwell-0' }]);
        // The heading `elevator-screen.ts` builds from that begin() call.
        const from = ROOM_FLOORS['town-center']!;
        const to = ROOM_FLOORS['stairwell-0']!;
        expect(`WADDLING ${direction(from, to).toUpperCase()} TO ${floorLabel(to)}`).toBe(
          'WADDLING DOWN TO FLOOR L',
        );
      });

      it('still shows it for any other floor change, e.g. Town Center to floor 3, then to the Roof Deck', async () => {
        expect(await walk(['stairwell-3', 'roof-deck'])).toEqual([
          { type: 'begin', from: 'town-center', to: 'stairwell-3' },
          { type: 'begin', from: 'stairwell-3', to: 'roof-deck' },
        ]);
      });
    });
  });

  describe('useDoor (#51 slice 4, RT2-5)', () => {
    it('changes Room through an enabled door with no walk, exactly as reaching it does', async () => {
      const { navigator, scene, seen } = setup();
      await boot(scene, navigator);
      seen.length = 0;

      navigator.useDoor(DEV_PIT_DOOR);
      expect(navigator.isTransitioning()).toBe(true);
      scene.fireCreate();
      await Promise.resolve();
      await Promise.resolve();

      expect(navigator.isTransitioning()).toBe(false);
      expect(seen).toEqual([
        { type: 'leave', roomId: 'town-center' },
        { type: 'enter', roomId: 'dev-pit', entryTile: DEV_PIT_DOOR.entryTile },
      ]);
    });

    it("shows a locked door's UNDER CONSTRUCTION hint and stays put", async () => {
      const { navigator, scene, seen } = setup();
      await boot(scene, navigator);
      seen.length = 0;

      navigator.useDoor(DISABLED_DOOR);

      expect(scene.lockedDoors).toEqual([DISABLED_DOOR]);
      expect(seen).toEqual([]);
      expect(navigator.currentRoomId()).toBe('town-center');
    });

    it('does nothing before a Session is active', () => {
      const { navigator, scene, seen } = setup();

      navigator.useDoor(DEV_PIT_DOOR);
      navigator.useDoor(DISABLED_DOOR);

      expect(scene.showRoomCalls).toEqual([]);
      expect(scene.lockedDoors).toEqual([]);
      expect(seen).toEqual([]);
    });
  });

  describe('#170 door behaviour', () => {
    /** One ordered log of every scene, fade, Elevator and event call, as strings. */
    function setupLogged(
      options: { pickFloor?: (door: RoomDoor) => Promise<FloorChoice | null> } = {},
    ) {
      const log: string[] = [];
      const events = createEmitter<RoomEventMap>();
      events.on('room:leave', ({ roomId }) => log.push(`leave:${roomId}`));
      events.on('room:enter', ({ roomId }) => log.push(`enter:${roomId}`));
      const scene = createFakeScene();
      const realShowRoom = scene.showRoom;
      scene.showRoom = (roomId, entryTile, force) => {
        log.push(`showRoom:${roomId}`);
        return realShowRoom(roomId, entryTile, force);
      };
      let finishOut: (() => void) | null = null;
      const fade: RoomFade & { finishOut: () => void } = {
        out: () =>
          new Promise<void>((resolve) => {
            log.push('fade:out');
            finishOut = resolve;
          }),
        clear: () => log.push('fade:clear'),
        cancel: () => log.push('fade:cancel'),
        finishOut: () => finishOut?.(),
      };
      const transitionScreen: RoomTransitionScreen = {
        begin: (from, to) => log.push(`begin:${from}->${to}`),
        ready: () => log.push('ready'),
        cancel: () => log.push('elevator:cancel'),
      };
      const navigator = createRoomNavigator({
        scene,
        events,
        hasPlayer: () => true,
        transitionScreen,
        fade,
        pickFloor: options.pickFloor,
      });
      return { log, scene, fade, navigator };
    }

    async function flush(): Promise<void> {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    }

    const ROOF_DOOR: RoomDoor = {
      label: 'ELEVATOR · ROOF DECK',
      hotspot: { x: 0, y: 0, width: 10, height: 10 },
      targetRoomId: 'roof-deck',
      entryTile: { col: 4, row: 9 },
    };

    it('a door fades: leave, fade out, then the Elevator, the restart, ready and the fade clearing (D5)', async () => {
      const { log, scene, fade, navigator } = setupLogged();
      await boot(scene, navigator);
      log.length = 0;

      scene.triggerDoorReached(ROOF_DOOR);
      expect(log).toEqual(['leave:town-center', 'fade:out']);
      expect(navigator.isTransitioning()).toBe(true);
      expect(navigator.currentRoomId()).toBeNull();

      fade.finishOut();
      await flush();
      expect(log).toEqual([
        'leave:town-center',
        'fade:out',
        'begin:town-center->roof-deck',
        'fade:cancel',
        'showRoom:roof-deck',
      ]);
      expect(navigator.currentRoomId()).toBe('roof-deck');

      scene.fireCreate();
      await flush();
      expect(log.slice(5)).toEqual(['ready', 'fade:clear', 'enter:roof-deck']);
      expect(navigator.isTransitioning()).toBe(false);
    });

    it('a same-floor door clears the fade once the Room is ready', async () => {
      const { log, scene, fade, navigator } = setupLogged();
      await boot(scene, navigator);
      log.length = 0;

      scene.triggerDoorReached(DEV_PIT_DOOR);
      fade.finishOut();
      await flush();
      scene.fireCreate();
      await flush();

      expect(log).toEqual([
        'leave:town-center',
        'fade:out',
        'showRoom:dev-pit',
        'fade:clear',
        'enter:dev-pit',
      ]);
    });

    it('takes the token before the fade: a sign-out mid-fade emits exactly one room:leave, no restart, no Elevator (RT170-4)', async () => {
      const { log, scene, fade, navigator } = setupLogged();
      await boot(scene, navigator);
      log.length = 0;

      scene.triggerDoorReached(ROOF_DOOR);
      navigator.leaveForSignOut();
      fade.finishOut();
      scene.fireCreate();
      await flush();

      expect(log).toEqual(['leave:town-center', 'fade:out', 'elevator:cancel', 'fade:cancel']);
      expect(navigator.isTransitioning()).toBe(false);
      expect(navigator.currentRoomId()).toBeNull();
    });

    it('a fresh spawn after a sign-out mid-fade wins: the stale fade never restarts its Room (RT170-24)', async () => {
      const { log, scene, fade, navigator } = setupLogged();
      await boot(scene, navigator);
      log.length = 0;

      scene.triggerDoorReached(DEV_PIT_DOOR);
      navigator.leaveForSignOut();
      const spawn = navigator.enterSpawnRoom();
      fade.finishOut();
      scene.fireCreate();
      await spawn;
      await flush();

      expect(log.filter((entry) => entry.startsWith('showRoom'))).toEqual([
        `showRoom:${SPAWN_ROOM_ID}`,
      ]);
      expect(log).toContain('fade:cancel');
      expect(log.at(-1)).toBe(`enter:${SPAWN_ROOM_ID}`);
      expect(navigator.currentRoomId()).toBe(SPAWN_ROOM_ID);
      expect(navigator.isTransitioning()).toBe(false);
    });

    it('enterSpawnRoom and leaveForSignOut both cancel the fade layer (RT170-24)', async () => {
      const { log, scene, navigator } = setupLogged();
      await boot(scene, navigator);
      expect(log).toContain('fade:cancel');
      log.length = 0;
      navigator.leaveForSignOut();
      expect(log).toContain('fade:cancel');
    });

    it('drops every other change while fading: changeRoom, useDoor, a locked door and Anthony (RT170-10)', async () => {
      const { log, scene, fade, navigator } = setupLogged();
      await boot(scene, navigator);
      scene.guardedLabels.add('THE ICEBOX');
      log.length = 0;

      scene.triggerDoorReached(DEV_PIT_DOOR);
      await navigator.changeRoom('igloo');
      navigator.useDoor(ROOF_DOOR);
      navigator.useDoor(DISABLED_DOOR);
      scene.triggerDoorReached(DISABLED_DOOR);
      fade.finishOut();
      await flush();
      scene.fireCreate();
      await flush();

      expect(log.filter((entry) => entry.startsWith('leave') || entry.startsWith('enter'))).toEqual(
        ['leave:town-center', 'enter:dev-pit'],
      );
      expect(scene.lockedDoors).toEqual([]);
      expect(scene.redirected).toEqual([]);
    });

    it('the stair keys (useDoor with no options), the Map and the debug changeRoom never fade', async () => {
      const { log, scene, navigator } = setupLogged();
      await boot(scene, navigator);
      log.length = 0;

      navigator.useDoor(DEV_PIT_DOOR);
      scene.fireCreate();
      await flush();
      const p = navigator.changeRoom('town-center');
      scene.fireCreate();
      await p;

      expect(log).not.toContain('fade:out');
      expect(log.at(-1)).toBe('enter:town-center');
    });

    it("Anthony's guard comes first for every use of a door, the keys included (D7, n3)", async () => {
      const { log, scene, navigator } = setupLogged();
      await boot(scene, navigator);
      scene.guardedLabels.add('DEV PIT');
      log.length = 0;

      navigator.useDoor(DEV_PIT_DOOR);
      scene.triggerDoorReached(DEV_PIT_DOOR);

      expect(scene.redirected).toEqual([DEV_PIT_DOOR, DEV_PIT_DOOR]);
      expect(log).toEqual([]);
      expect(navigator.currentRoomId()).toBe(SPAWN_ROOM_ID);
    });

    it('a locked door shows its UNDER CONSTRUCTION hint, by keys or arrival alike', async () => {
      const { log, scene, navigator } = setupLogged();
      await boot(scene, navigator);
      log.length = 0;

      navigator.useDoor(DISABLED_DOOR);
      scene.triggerDoorReached(DISABLED_DOOR);

      expect(scene.lockedDoors).toEqual([DISABLED_DOOR, DISABLED_DOOR]);
      expect(log).toEqual([]);
    });

    describe('pickFloor (D9)', () => {
      const ROOF_CHOICE: FloorChoice = {
        floor: 'R',
        label: 'ROOF DECK',
        targetRoomId: 'roof-deck',
        entryTile: { col: 4, row: 9 },
      };
      const LOBBY_CHOICE: FloorChoice = {
        floor: 'L',
        label: 'LOBBY',
        targetRoomId: null,
        entryTile: { col: 0, row: 0 },
      };
      const PICKER_DOOR: RoomDoor = { ...ROOF_DOOR, floorChoices: [ROOF_CHOICE, LOBBY_CHOICE] };

      function deferredPick() {
        let resolvePick: (choice: FloorChoice | null) => void = () => {};
        const pickFloor = vi.fn<(door: RoomDoor) => Promise<FloorChoice | null>>(
          () =>
            new Promise<FloorChoice | null>((resolve) => {
              resolvePick = resolve;
            }),
        );
        return { pickFloor, choose: (choice: FloorChoice | null) => resolvePick(choice) };
      }

      it('asks for a floor after the door is reached, then fades to the choice', async () => {
        const pick = deferredPick();
        const { log, scene, fade, navigator } = setupLogged({ pickFloor: pick.pickFloor });
        await boot(scene, navigator);
        log.length = 0;

        scene.triggerDoorReached(PICKER_DOOR);
        expect(pick.pickFloor).toHaveBeenCalledWith(PICKER_DOOR);
        expect(log).toEqual([]);

        pick.choose(ROOF_CHOICE);
        await flush();
        expect(log).toEqual(['leave:town-center', 'fade:out']);
        fade.finishOut();
        await flush();
        scene.fireCreate();
        await flush();
        expect(log.at(-1)).toBe('enter:roof-deck');
      });

      it('a cancelled pick (null) or a locked choice changes nothing', async () => {
        const pick = deferredPick();
        const { log, scene, navigator } = setupLogged({ pickFloor: pick.pickFloor });
        await boot(scene, navigator);
        log.length = 0;

        scene.triggerDoorReached(PICKER_DOOR);
        pick.choose(null);
        await flush();
        scene.triggerDoorReached(PICKER_DOOR);
        pick.choose(LOBBY_CHOICE);
        await flush();

        expect(log).toEqual([]);
      });

      it('re-validates on choice: Anthony, a Room change or a sign-out in the meantime wins', async () => {
        const pick = deferredPick();
        const { log, scene, navigator } = setupLogged({ pickFloor: pick.pickFloor });
        await boot(scene, navigator);
        log.length = 0;

        // Anthony arrives at the door while the picker is open.
        scene.triggerDoorReached(PICKER_DOOR);
        scene.guardedLabels.add(PICKER_DOOR.label);
        pick.choose(ROOF_CHOICE);
        await flush();
        expect(scene.redirected).toEqual([PICKER_DOOR]);
        expect(log).toEqual([]);
        scene.guardedLabels.clear();

        // The Map moved the Player on while the picker was open.
        scene.triggerDoorReached(PICKER_DOOR);
        const moved = navigator.changeRoom('dev-pit');
        scene.fireCreate();
        await moved;
        log.length = 0;
        pick.choose(ROOF_CHOICE);
        await flush();
        expect(log).toEqual([]);

        // Signed out while the picker was open.
        scene.triggerDoorReached(PICKER_DOOR);
        navigator.leaveForSignOut();
        log.length = 0;
        pick.choose(ROOF_CHOICE);
        await flush();
        expect(log).toEqual([]);
      });
    });
  });
});
