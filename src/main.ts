import './style.css';
import { loadEnv } from './env';
import { startGame, whenSceneReady } from './game/main';
import type { RoomPenguinView } from './game/rooms/room-penguin-view';
import { createRoomNavigator, type RoomNavigator } from './game/rooms/room-navigator';
import {
  HOOKS_ENABLED,
  registerRoomDebugNavigatorHooks,
  type RoomDebugEventLogEntry,
} from './game/rooms/dev-room-hook';
import { getSupabaseClient } from './auth/supabase-client';
import { startAuth, toAuthClient } from './auth/auth-session';
import { bindPlayer, type Player } from './auth/player';
import { createLoginOverlay } from './ui/login-overlay';
import { mountStage } from './ui/stage';
import { getUiLayer } from './ui/ui-layer';
import { gameEvents, type RoomId } from './contracts';
import { createHud } from './ui/hud/hud';
import { initDevHudHook } from './ui/hud/dev-hud-hook';
import { getRoomDefinition } from './game/rooms/registry';
import { createDebugOverlay, isDebugEnabled } from './ui/debug-overlay';
import {
  createRoomChannel,
  type RemotePenguinView,
  type RoomChannel,
} from './realtime/room-channel';
import { toRealtimeClient } from './realtime/supabase-realtime';
import { DEFAULT_LOOK, type PenguinLook } from './contracts';
import { createInMemoryProgressStore } from './persistence/in-memory-progress-store';
import { STARTING_TOKENS } from './persistence/minigame-rules';
import { createMinigameLauncher } from './minigames/minigame-launcher';
import { createDefaultMinigameRegistry } from './minigames/minigame-registry';
import { initDevMinigameHook } from './minigames/dev-minigame-hook';
import { MINIGAME_OVERLAY_ID } from './minigames/minigame-shell';
import { createPenguinCreator } from './ui/penguin-creator';
import { createPenguinEditor } from './penguin/penguin-editor';
import { initDevCreatorHook } from './penguin/dev-creator-hook';

// Fail fast on a missing or malformed .env before anything boots.
loadEnv();

const game = startGame();
mountStage(game);
const client = getSupabaseClient();
const realtime = toRealtimeClient(client);
const uiLayer = getUiLayer();

/**
 * The Room scene and its Penguin view, once `RoomScene.create()` has first run.
 *
 * The local Penguin is drawn and driven by `RoomScene` itself (#14: spawn,
 * click-to-move, look from `registry.player`). `RoomPenguinView` (#28) shows
 * the Room channel's remote Penguins only, so there is exactly one local
 * Penguin on screen.
 */
let penguins: RoomPenguinView | null = null;
/**
 * The one producer of `room:leave`/`room:enter` (#15 A1, replacing #28's
 * `stub-rooms.ts` wholesale). Built once the Scene exists, since it restarts
 * `RoomScene` directly; every caller below (`startSession`, `endSession`,
 * the debug overlay, the HUD) is only ever reachable once a Session has
 * started, which itself waits on `sceneReady` first, so `roomNavigator` is
 * always set by the time any of them runs.
 */
let roomNavigator: RoomNavigator | null = null;
const sceneReady = whenSceneReady(game).then((scene) => {
  penguins = scene.penguins;
  roomNavigator = createRoomNavigator({
    scene: {
      showRoom: (roomId, entryTile) => scene.showRoom(roomId, entryTile),
      whenNextReady: () => scene.whenNextReady(),
      onDoorReached: (handler) => scene.onDoorReached(handler),
      showComingSoonHint: (door) => scene.showComingSoonHint(door),
    },
    events: gameEvents,
    hasPlayer: () => Boolean(game.registry.get('player')),
  });

  // Test-only: `window.__roomDebug.changeRoom`/`roomEventLog` (#15 D6),
  // gated the same way `RoomScene`'s own debug hook is, so neither the
  // listeners nor the ever-growing log exist in a production build.
  if (HOOKS_ENABLED) {
    const roomEventLog: RoomDebugEventLogEntry[] = [];
    gameEvents.on('room:leave', ({ roomId }) => {
      roomEventLog.push({ type: 'room:leave', roomId });
    });
    gameEvents.on('room:enter', ({ roomId }) => {
      roomEventLog.push({ type: 'room:enter', roomId });
    });
    registerRoomDebugNavigatorHooks({
      changeRoom: (roomId) => {
        void roomNavigator?.changeRoom(roomId);
      },
      roomEventLog,
    });
  }

  return scene.penguins;
});

/** The signed-in Player's Room channel, and the Player it belongs to. */
let roomChannel: RoomChannel | null = null;
let channelPlayerId: string | null = null;
// Bumped on every sign-in and sign-out, so an in-flight sign-in that loses a
// race with a later sign-out (or a newer sign-in) never creates a stray
// Room channel.
let signInGeneration = 0;
/** The signed-in Player; a loaded or saved look replaces its `look`. */
let currentPlayer: Player | null = null;
/**
 * A previous Player's Room channel, still to stop when the next Session
 * starts. A Session starts only once the Player has a Penguin, which for a
 * new Player is after the Penguin Creator's first save.
 */
let pendingPrevious: RoomChannel | null = null;

const debugOverlay = isDebugEnabled()
  ? createDebugOverlay(uiLayer, {
      onEnterRoom: (roomId) => {
        // Only works during a Session (#15 A5): before one starts,
        // `channelPlayerId` is unset and there is nothing to navigate.
        if (channelPlayerId) void roomNavigator?.changeRoom(roomId);
      },
      onSetLook: (look) => {
        roomChannel?.setLook(look);
        // `RoomScene` restyles the local Penguin from `registry.player`.
        const player = game.registry.get('player') as Player | undefined;
        if (player) bindPlayer(game.registry, { ...player, look });
      },
    })
  : null;

/**
 * Applies a look loaded from or saved through the Penguin Creator everywhere
 * at once: `registry.player` (which `RoomScene` restyles the local Penguin
 * from) and the Room channel's Presence payload, so a mid-session save needs
 * no reload.
 */
function applyLocalLook(look: PenguinLook): void {
  if (!currentPlayer) return;
  currentPlayer = { ...currentPlayer, look };
  bindPlayer(game.registry, currentPlayer);
  if (!channelPlayerId) return;
  roomChannel?.setLook(look);
  debugOverlay?.setOwnLook(look);
}

function composeView(view: RemotePenguinView): RemotePenguinView {
  if (!debugOverlay) return view;
  return {
    upsert(p) {
      view.upsert(p);
      debugOverlay.upsert(p);
    },
    remove(playerId) {
      view.remove(playerId);
      debugOverlay.remove(playerId);
    },
    clear() {
      view.clear();
      debugOverlay.clear();
    },
  };
}

async function stopChannel(channel: RoomChannel): Promise<void> {
  try {
    await channel.stop();
  } catch (err) {
    console.error('[main] Room channel stop failed', err);
  }
}

/**
 * The synchronous half of leaving a Session (sign-out, or a sign-in as a
 * different Player): emits `room:leave` via `leaveForSignOut()` and clears
 * every remote Penguin view. Returns the Room channel still to stop.
 */
function endSession(): RoomChannel | null {
  signInGeneration += 1;
  const channel = roomChannel;
  roomNavigator?.leaveForSignOut();
  roomChannel = null;
  channelPlayerId = null;
  penguins?.clear();
  debugOverlay?.clear();
  debugOverlay?.setCurrentRoom(null);
  debugOverlay?.setSubscribed(false);
  return channel;
}

async function startSession(player: Player, previous: RoomChannel | null): Promise<void> {
  const generation = ++signInGeneration;
  if (previous) {
    await stopChannel(previous);
    if (generation !== signInGeneration) return;
  }

  const view = await sceneReady;
  if (generation !== signInGeneration) return;

  channelPlayerId = player.id;
  debugOverlay?.setOwnLook(player.look);

  const channel = createRoomChannel({
    client: realtime,
    events: gameEvents,
    playerId: player.id,
    look: player.look,
    view: composeView(view),
  });
  roomChannel = channel;
  channel.onRoomChange((roomId) => debugOverlay?.setCurrentRoom(roomId));
  channel.onSubscribedChange((subscribed) => debugOverlay?.setSubscribed(subscribed));

  // After the Room channel exists (#15 A2), so it sees the first `room:enter`
  // and joins Presence.
  void roomNavigator?.enterSpawnRoom();
}

/**
 * Test-only: with `?asPlayer` in the URL and either a dev server
 * (`import.meta.env.DEV`) or the Playwright preview server
 * (`VITE_E2E_HOOKS=true`), binds a fixture Player to the registry and enters
 * the spawn Room through the real navigator, with no auth and no Room
 * channel (#15 D6/A6): e2e specs that need `room:enter` gated on a
 * registered Player, without signing in through Google. Waits for
 * `sceneReady` first, since the navigator doesn't exist until then. Both env
 * checks are direct `import.meta.env.*` reads, so Vite strips this
 * function's body from a production build, matching the other dev hooks.
 */
function initDevAsPlayerHook(): boolean {
  const e2eHooksEnabled = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';
  if (!e2eHooksEnabled) return false;
  if (!new URLSearchParams(window.location.search).has('asPlayer')) return false;

  const fixturePlayer: Player = {
    id: 'e2e-fixture-player',
    displayName: 'E2E Fixture Player',
    look: DEFAULT_LOOK,
  };
  bindPlayer(game.registry, fixturePlayer);
  void sceneReady.then(() => {
    void roomNavigator?.enterSpawnRoom();
  });
  return true;
}

const overlay = createLoginOverlay(uiLayer, {
  onSignIn: () => {
    void auth.signIn(new URL('./', window.location.href).href);
  },
  onSignOut: () => {
    void auth.signOut();
  },
});

// #13's `getRoomDefinition` replaces the standalone `room-titles.ts` map
// (#16 D7): title/subtitle are just the registered Room's own fields. The HUD
// and the mini-game launcher (#37) share this one resolver.
function resolveRoomTitle(roomId: RoomId): { title: string; subtitle: string } {
  const room = getRoomDefinition(roomId);
  return { title: room.title, subtitle: room.subtitle };
}

const hud = createHud(getUiLayer(), {
  resolveRoomTitle,
  onIgloo: () => {
    void roomNavigator?.changeRoom('igloo');
  },
  onReturnToTownCenter: () => {
    void roomNavigator?.changeRoom('town-center');
  },
  onSignOut: () => {
    void auth.signOut();
  },
  // Seeded from the fake store's own starting balance until #34 loads the
  // real Token balance.
  initialBalance: STARTING_TOKENS,
});

// In-memory fake until #34's real ProgressStore lands; the HUD's Token
// balance updates via `tokens:changed`, which this store emits on every
// `recordRound`.
const progressStore = createInMemoryProgressStore({ emitter: gameEvents });
const minigameLauncher = createMinigameLauncher({
  layer: getUiLayer(),
  store: progressStore,
  overlays: hud.overlays,
  resolveRoomTitle,
  registry: createDefaultMinigameRegistry(),
});

// Must run before `startAuth`: Supabase's `onAuthStateChange` always fires
// asynchronously, so `devHudActive`/`devMinigameActive` need to be settled
// before its first (later-tick) SIGNED_OUT/SIGNED_IN callback checks them
// below.
const devHudActive = initDevHudHook(hud);
const devMinigameActive = initDevMinigameHook(hud, minigameLauncher);

const creator = createPenguinCreator(uiLayer, {
  onSubmit: (look) => {
    void penguinEditor.submit(look);
  },
  onCancel: () => {
    penguinEditor.cancel();
  },
});

const penguinEditor = createPenguinEditor({
  creator,
  store: progressStore,
  overlays: hud.overlays,
  onLookChanged: applyLocalLook,
  onReady: () => {
    hud.show();
    if (!currentPlayer) return;
    const previous = pendingPrevious;
    pendingPrevious = null;
    void startSession(currentPlayer, previous);
  },
  onError: (message) => {
    gameEvents.emit('ui:toast', { message });
  },
});

// After `penguinEditor` exists; see the note on `devHudActive` above.
const devCreatorActive = initDevCreatorHook(penguinEditor);
const devAsPlayerActive = initDevAsPlayerHook();
const devHookActive = devHudActive || devMinigameActive || devCreatorActive || devAsPlayerActive;

gameEvents.on('ui:open-creator', () => {
  penguinEditor.edit();
});

const auth = startAuth({
  client: toAuthClient(client),
  onSignedIn: (player) => {
    // A repeat sign-in event for the same Player keeps the Session and the
    // look already loaded for it.
    if (currentPlayer?.id === player.id) return;
    // A different Player while a Session exists: leave it first.
    const previous = currentPlayer ? endSession() : null;
    currentPlayer = player;
    // `room:enter` fires only after `registry.player` is set.
    bindPlayer(game.registry, player);
    if (devHookActive) {
      void startSession(player, previous);
      return;
    }
    overlay.showSignedIn();
    // The HUD and the Session (Town Center, Presence) start in `onReady`:
    // straight away for a returning Player, after the Penguin Creator's
    // first save for a new one.
    if (pendingPrevious) void stopChannel(pendingPrevious);
    pendingPrevious = previous;
    void penguinEditor.playerSignedIn();
  },
  onSignedOut: () => {
    currentPlayer = null;
    // A dev hook (including #15's `?asPlayer`) owns `registry.player` and any
    // Session itself; the real, always-eventually-fired signed-out signal
    // (there's no real browser session in a dev/e2e run) must not clobber
    // either one out from under it.
    if (devHookActive) return;
    // Per `src/contracts/rooms.ts`, `room:leave` comes before `bindPlayer(null)`.
    const channel = endSession();
    bindPlayer(game.registry, null);
    if (channel) void stopChannel(channel);
    if (pendingPrevious) void stopChannel(pendingPrevious);
    pendingPrevious = null;
    penguinEditor.playerSignedOut();
    // Quits any in-progress round (no `recordRound`) rather than leaving it
    // open behind a signed-out session.
    hud.overlays.close(MINIGAME_OVERLAY_ID);
    overlay.showSignedOut();
    hud.hide();
  },
  onError: (message) => {
    overlay.showError(message);
  },
});
