import './style.css';
import { loadEnv } from './env';
import { startGame, whenSceneReady } from './game/main';
import type { RoomScene } from './game/rooms/RoomScene';
import type { RoomPenguinView } from './game/rooms/room-penguin-view';
import { createStubRoomDriver } from './game/stub-rooms';
import { getSupabaseClient } from './auth/supabase-client';
import { startAuth, toAuthClient } from './auth/auth-session';
import { bindPlayer, type Player } from './auth/player';
import { createLoginOverlay } from './ui/login-overlay';
import { mountStage } from './ui/stage';
import { getUiLayer } from './ui/ui-layer';
import { createHud } from './ui/hud/hud';
import { resolveRoomTitle } from './ui/hud/room-titles';
import { initDevHudHook } from './ui/hud/dev-hud-hook';
import { createDebugOverlay, isDebugEnabled } from './ui/debug-overlay';
import {
  createRoomChannel,
  type RemotePenguinView,
  type RoomChannel,
} from './realtime/room-channel';
import { toRealtimeClient } from './realtime/supabase-realtime';
import {
  DEFAULT_FACING,
  gameEvents,
  SPAWN_ROOM_ID,
  type PenguinLook,
  type Tile,
} from './contracts';

// Fail fast on a missing or malformed .env before anything boots.
loadEnv();

const game = startGame();
mountStage(game);
const client = getSupabaseClient();
const realtime = toRealtimeClient(client);
const rooms = createStubRoomDriver(gameEvents);
const uiLayer = getUiLayer();

/** The Room scene and its Penguin view, once `RoomScene.create()` has first run. */
let roomScene: RoomScene | null = null;
let penguins: RoomPenguinView | null = null;
const sceneReady = whenSceneReady(game).then((scene) => {
  roomScene = scene;
  penguins = scene.penguins;
  return scene.penguins;
});

/** The signed-in Player's Room channel, and the Player it belongs to. */
let roomChannel: RoomChannel | null = null;
let channelPlayerId: string | null = null;
/** The local Penguin's look, and the tile it entered the current Room at. */
let localLook: PenguinLook | null = null;
let localTile: Tile | null = null;
// Bumped on every sign-in and sign-out, so an in-flight sign-in that loses a
// race with a later sign-out (or a newer sign-in) never creates a stray
// Room channel.
let signInGeneration = 0;

const debugOverlay = isDebugEnabled()
  ? createDebugOverlay(uiLayer, {
      onEnterRoom: (roomId) => {
        if (channelPlayerId) rooms.enter(roomId, channelPlayerId);
      },
      onSetLook: (look) => {
        localLook = look;
        roomChannel?.setLook(look);
        showLocalPenguin();
      },
    })
  : null;

// `room:enter` is emitted synchronously, before the Room channel's own
// (queued) `onRoomChange` for that Room, so the tile is known by then.
// It also shows the entered Room in `RoomScene` (a no-op for a Room with no
// `RoomDefinition` yet).
gameEvents.on('room:enter', ({ roomId, entryTile }) => {
  localTile = entryTile;
  roomScene?.showRoom(roomId);
});

/** Shows the local Penguin at its entry tile, only while signed in and in a Room. */
function showLocalPenguin(): void {
  if (!penguins || !channelPlayerId || !localLook || !localTile) return;
  if (!roomChannel?.currentRoom()) return;
  penguins.showLocal({
    playerId: channelPlayerId,
    look: localLook,
    tile: localTile,
    facing: DEFAULT_FACING,
  });
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
 * different Player): emits `room:leave` via `rooms.reset()` and clears every
 * view, including the local Penguin. Returns the Room channel still to stop.
 */
function endSession(): RoomChannel | null {
  signInGeneration += 1;
  const channel = roomChannel;
  rooms.reset();
  roomChannel = null;
  channelPlayerId = null;
  localLook = null;
  localTile = null;
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
  localLook = player.look;
  debugOverlay?.setOwnLook(player.look);

  const channel = createRoomChannel({
    client: realtime,
    events: gameEvents,
    playerId: player.id,
    look: player.look,
    view: composeView(view),
  });
  roomChannel = channel;
  channel.onRoomChange((roomId) => {
    debugOverlay?.setCurrentRoom(roomId);
    if (roomId) showLocalPenguin();
  });
  channel.onSubscribedChange((subscribed) => debugOverlay?.setSubscribed(subscribed));

  rooms.enter(SPAWN_ROOM_ID, player.id);
}

const overlay = createLoginOverlay(uiLayer, {
  onSignIn: () => {
    void auth.signIn(new URL('./', window.location.href).href);
  },
  onSignOut: () => {
    void auth.signOut();
  },
});

const hud = createHud(getUiLayer(), {
  resolveRoomTitle,
  onIgloo: () => {
    // #15 changeRoom('igloo'); a no-op until then.
  },
  onSignOut: () => {
    void auth.signOut();
  },
  initialBalance: 0, // until #34 loads the real Token balance
});

// Must run before `startAuth`: Supabase's `onAuthStateChange` always fires
// asynchronously, so `devHudActive` needs to be settled before its first
// (later-tick) SIGNED_OUT/SIGNED_IN callback checks it below.
const devHudActive = initDevHudHook(hud);

const auth = startAuth({
  client: toAuthClient(client),
  onSignedIn: (player) => {
    const samePlayer = roomChannel !== null && channelPlayerId === player.id;
    // A different Player while a Room channel exists: leave it first.
    const previous = !samePlayer && roomChannel ? endSession() : null;
    // `room:enter` fires only after `registry.player` is set.
    bindPlayer(game.registry, player);
    if (!samePlayer) void startSession(player, previous);
    if (devHudActive) return;
    overlay.showSignedIn(player);
    hud.show();
  },
  onSignedOut: () => {
    // Per `src/contracts/rooms.ts`, `room:leave` comes before `bindPlayer(null)`.
    const channel = endSession();
    bindPlayer(game.registry, null);
    if (channel) void stopChannel(channel);
    if (devHudActive) return;
    overlay.showSignedOut();
    hud.hide();
  },
  onError: (message) => {
    overlay.showError(message);
  },
});
