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
import { gameEvents } from './contracts';
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
  createChatController,
  type ChatBubbleView,
  type ChatController,
} from './chat/chat-controller';
import { exposeChatDebug } from './chat/dev-chat-hook';
import { DEFAULT_FACING, SPAWN_ROOM_ID, type PenguinLook, type Tile } from './contracts';
import { createInMemoryProgressStore } from './persistence/in-memory-progress-store';
import { STARTING_TOKENS } from './persistence/minigame-rules';
import { createMinigameLauncher } from './minigames/minigame-launcher';
import { createDefaultMinigameRegistry } from './minigames/minigame-registry';
import { initDevMinigameHook } from './minigames/dev-minigame-hook';
import { MINIGAME_OVERLAY_ID } from './minigames/minigame-shell';

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
/** The signed-in Player's chat controller (#44), recreated alongside `roomChannel` each session. */
let chatController: ChatController | null = null;
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

/**
 * Wraps `view` to also publish every bubble it shows/clears to
 * `window.__chatDebug` (#44), keyed by Player id (`getPlayerId()` for the
 * local Penguin's own bubble, since `RoomPenguinView.sayLocal` has no
 * playerId to key by).
 */
function composeChatView(view: ChatBubbleView, getPlayerId: () => string | null): ChatBubbleView {
  const bubbles: Record<string, string> = {};

  function setBubble(playerId: string, text: string | null): void {
    if (text === null) delete bubbles[playerId];
    else bubbles[playerId] = text;
    exposeChatDebug({ ...bubbles });
  }

  return {
    say(playerId, text) {
      view.say(playerId, text);
      setBubble(playerId, text);
    },
    sayLocal(text) {
      view.sayLocal(text);
      const playerId = getPlayerId();
      if (playerId) setBubble(playerId, text);
    },
  };
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
  chatController?.stop();
  chatController = null;
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
  chatController = createChatController({
    channel,
    view: composeChatView(view, () => channelPlayerId),
  });
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
  // Seeded from the fake store's own starting balance until #34 loads the
  // real Token balance.
  initialBalance: STARTING_TOKENS,
  onChatSend: (text) => chatController?.send(text) ?? Promise.resolve(false),
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

const auth = startAuth({
  client: toAuthClient(client),
  onSignedIn: (player) => {
    const samePlayer = roomChannel !== null && channelPlayerId === player.id;
    // A different Player while a Room channel exists: leave it first.
    const previous = !samePlayer && roomChannel ? endSession() : null;
    // `room:enter` fires only after `registry.player` is set.
    bindPlayer(game.registry, player);
    if (!samePlayer) void startSession(player, previous);
    if (devHudActive || devMinigameActive) return;
    overlay.showSignedIn();
    hud.show();
  },
  onSignedOut: () => {
    // Per `src/contracts/rooms.ts`, `room:leave` comes before `bindPlayer(null)`.
    const channel = endSession();
    bindPlayer(game.registry, null);
    if (channel) void stopChannel(channel);
    if (devHudActive || devMinigameActive) return;
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
