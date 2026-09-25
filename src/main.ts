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
import { gameEvents, type RoomId } from './contracts';
import { createHud } from './ui/hud/hud';
import { initDevHudHook } from './ui/hud/dev-hud-hook';
import { getRoomDefinition } from './game/rooms/registry';
import { createDebugOverlay, isDebugEnabled } from './ui/debug-overlay';
import {
  createRoomChannel,
  type PublicBroadcastEvent,
  type RemotePenguinView,
  type RoomChannel,
  type SendablePayload,
} from './realtime/room-channel';
import { toRealtimeClient } from './realtime/supabase-realtime';
import {
  createChatController,
  type ChatBubbleView,
  type ChatController,
} from './chat/chat-controller';
import { exposeChatDebug } from './chat/dev-chat-hook';
import { SPAWN_ROOM_ID, type EmoteId, type PenguinLook, type RoomBroadcastMap } from './contracts';
import {
  createEmoteController,
  type EmoteController,
  type EmoteRoomChannel,
  type EmotePenguinView,
} from './emotes/emote-controller';
import { EMOTE_TO_ANIM } from './emotes/emote-rules';
import { createInMemoryProgressStore } from './persistence/in-memory-progress-store';
import type { ProgressStore } from './persistence/progress-store';
import { createActiveProgressStore, createProgressSession } from './persistence/progress-session';
import {
  createSupabaseProgressStore,
  toProgressClient,
} from './persistence/supabase-progress-store';
import { createMinigameLauncher } from './minigames/minigame-launcher';
import { createDefaultMinigameRegistry } from './minigames/minigame-registry';
import { initDevMinigameHook } from './minigames/dev-minigame-hook';
import { MINIGAME_OVERLAY_ID } from './minigames/minigame-shell';
import { createPenguinCreator } from './ui/penguin-creator';
import { createPenguinEditor } from './penguin/penguin-editor';
import { initDevCreatorHook } from './penguin/dev-creator-hook';
import { createTrophyCase, TROPHY_CASE_OVERLAY_ID } from './ui/trophy-case';
import { wireBadgeToast } from './ui/badge-toast';

// Fail fast on a missing or malformed .env before anything boots.
loadEnv();

const game = startGame();
mountStage(game);
const client = getSupabaseClient();
const realtime = toRealtimeClient(client);
const rooms = createStubRoomDriver(gameEvents);
const uiLayer = getUiLayer();

/** The signed-in Player's Room channel, and the Player it belongs to. */
let roomChannel: RoomChannel | null = null;
let channelPlayerId: string | null = null;
/** The signed-in Player's chat controller (#44), recreated alongside `roomChannel` each session. */
let chatController: ChatController | null = null;

/**
 * A stable `EmoteRoomChannel` (#47), unlike `ChatRoomChannel`: an Emote must
 * play on the local Penguin even with no session/Room channel joined yet
 * (the local Penguin exists from boot, #14, independent of sign-in), so
 * `emoteController` below is built once at boot rather than recreated per
 * session like `ChatController`. `send` forwards to whichever `roomChannel`
 * is currently live (`false` with none, e.g. before sign-in); `on` and
 * `onRoomChange` are re-registered against each session's own fresh
 * `RoomChannel` from `startSession` below, and simply fan out to whatever
 * this shim's own callers subscribed with.
 */
const emoteBroadcastHandlers = new Set<(payload: RoomBroadcastMap['emote']) => void>();
const emoteRoomChangeHandlers = new Set<(roomId: RoomId | null) => void>();

const emoteChannel: EmoteRoomChannel = {
  async send<K extends PublicBroadcastEvent>(type: K, payload: SendablePayload<K>) {
    return roomChannel?.send(type, payload) ?? false;
  },
  on<K extends PublicBroadcastEvent>(type: K, handler: (payload: RoomBroadcastMap[K]) => void) {
    if (type !== 'emote') return () => {};
    const wrapped = handler as (payload: RoomBroadcastMap['emote']) => void;
    emoteBroadcastHandlers.add(wrapped);
    return () => emoteBroadcastHandlers.delete(wrapped);
  },
  onRoomChange(handler) {
    emoteRoomChangeHandlers.add(handler);
    return () => emoteRoomChangeHandlers.delete(handler);
  },
};

/**
 * The Room scene and its Penguin view, once `RoomScene.create()` has first run.
 *
 * The local Penguin is drawn and driven by `RoomScene` itself (#14: spawn,
 * click-to-move, look from `registry.player`). `RoomPenguinView` (#28) shows
 * the Room channel's remote Penguins only, so there is exactly one local
 * Penguin on screen.
 */
let roomScene: RoomScene | null = null;
let penguins: RoomPenguinView | null = null;
/** Built once `sceneReady` resolves (below), so it's ready before any sign-in. */
let emoteController: EmoteController | null = null;
const sceneReady = whenSceneReady(game).then((scene) => {
  roomScene = scene;
  penguins = scene.penguins;
  emoteController = createEmoteController({
    channel: emoteChannel,
    view: composeEmoteView(scene.penguins),
  });
  return scene.penguins;
});
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
        if (channelPlayerId) rooms.enter(roomId, channelPlayerId);
      },
      onSetLook: (look) => {
        roomChannel?.setLook(look);
        // `RoomScene` restyles the local Penguin from `registry.player`.
        const player = game.registry.get('player') as Player | undefined;
        if (player) bindPlayer(game.registry, { ...player, look });
      },
    })
  : null;

// Shows the entered Room in `RoomScene` (a no-op for a Room with no
// `RoomDefinition` yet). The local Penguin spawns at the Room's `spawnTile`:
// the stub entry tile (`stub-rooms.ts`) is not checked against the Room's
// walkable mask, so it only feeds the Room channel's Presence payload.
gameEvents.on('room:enter', ({ roomId }) => {
  roomScene?.showRoom(roomId);
});

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

/**
 * Wraps `view` to also publish every bubble it *actually shows* (never merely
 * requests) to `window.__chatDebug` (#44), keyed by Player id (`getPlayerId()`
 * for the local Penguin's own bubble, since `RoomScene.sayLocal` has no
 * playerId to key by).
 *
 * `say`/`sayLocal` publish only off `view`'s own return value (#44 review fix
 * F1): a placed Penguin that never received the call (already gone, or not
 * yet placed) never gets a stale debug entry. A remote Penguin removed,
 * cleared, or re-placed on a Room-change `attach` outside `say`/`sayLocal`
 * altogether is instead covered by `view.onBubbleChange`, which the concrete
 * `RoomPenguinView` (`src/game/rooms/room-penguin-view.ts`) fires for exactly
 * those cases; wiring it here (rather than requiring it in `ChatBubbleView`)
 * keeps the chat controller's own seam narrow.
 */
function composeChatView(view: RoomPenguinView, getPlayerId: () => string | null): ChatBubbleView {
  const bubbles: Record<string, string> = {};

  function setBubble(playerId: string, text: string | null): void {
    if (text === null) delete bubbles[playerId];
    else bubbles[playerId] = text;
    exposeChatDebug({ ...bubbles });
  }

  view.onBubbleChange = (playerId, text) => setBubble(playerId, text);

  return {
    say(playerId, text) {
      const shown = view.say(playerId, text);
      if (shown) setBubble(playerId, text);
      return shown;
    },
    sayLocal(text) {
      const shown = roomScene?.sayLocal(text) ?? false;
      const playerId = getPlayerId();
      if (shown && playerId) setBubble(playerId, text);
      return shown;
    },
  };
}

/**
 * Wraps `view` (the #28 `RoomPenguinView`) and `roomScene` (the local
 * Penguin, #14) into one `EmotePenguinView` (#47): remote Emotes render
 * through `view.playEmote`, the local Emote through `RoomScene`'s own
 * `playEmoteLocal`/`clearEmoteLocal` (which decides whether clearing means
 * idle or `WALK`, per its own doc comment). `roomScene` is read lazily
 * (`() => roomScene`, not captured at composition time) since `main.ts`
 * assigns it only once `whenSceneReady` resolves, before any session starts.
 */
function composeEmoteView(view: RoomPenguinView): EmotePenguinView {
  return {
    play(playerId, emoteId) {
      return view.playEmote(playerId, emoteId === null ? null : EMOTE_TO_ANIM[emoteId]);
    },
    playLocal(emoteId) {
      if (emoteId === null) return roomScene?.clearEmoteLocal() ?? false;
      return roomScene?.playEmoteLocal(EMOTE_TO_ANIM[emoteId]) ?? false;
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
 * remote Penguin view. Returns the Room channel still to stop.
 */
function endSession(): RoomChannel | null {
  signInGeneration += 1;
  const channel = roomChannel;
  rooms.reset();
  roomChannel = null;
  channelPlayerId = null;
  chatController?.stop();
  chatController = null;
  // `emoteController` (#47) is a boot-time singleton (see its declaration
  // above), never stopped: its `onRoomChange` forwarding above already
  // clears every active Emote once the real Room channel reports the leave.
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
  chatController = createChatController({
    channel,
    view: composeChatView(view, () => channelPlayerId),
  });
  // Forwards this session's real Room channel into the boot-time
  // `emoteController`'s stable `emoteChannel` shim (#47; see its own doc
  // comment above for why the Emote controller itself isn't recreated here
  // like `chatController`).
  channel.on('emote', (payload) => {
    for (const handler of emoteBroadcastHandlers) handler(payload);
  });
  channel.onRoomChange((roomId) => {
    for (const handler of emoteRoomChangeHandlers) handler(roomId);
  });
  channel.onRoomChange((roomId) => debugOverlay?.setCurrentRoom(roomId));
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
    // #15 changeRoom('igloo'); a no-op until then.
  },
  onSignOut: () => {
    void auth.signOut();
  },
  // The saved balance arrives via `tokens:changed` once the progress
  // session's sign-in load finishes (#34).
  initialBalance: 0,
  onChatSend: (text) => chatController?.send(text) ?? Promise.resolve(false),
  onEmotePick: (emoteId: EmoteId) => {
    void emoteController?.send(emoteId);
  },
});

const progress = createProgressSession({ registry: game.registry, emitter: gameEvents });

// The dev/e2e hooks (below) run without signing in, and the Creator hook
// loads through the store while it initialises, so the in-memory fake is
// decided up front from the same build-time flag the hooks read. Vite
// replaces it with a literal `false` in a production build, so a real
// deployment never falls back to the fake: signed out, the store rejects
// with `not_authenticated`.
const e2eHooksEnabled = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';
const devFallbackStore: ProgressStore | null = e2eHooksEnabled
  ? createInMemoryProgressStore({ emitter: gameEvents })
  : null;

// Built once at boot for the long-lived consumers below; every call forwards
// to the signed-in Player's Supabase store (#34), or to the dev fallback.
const progressStore = createActiveProgressStore(game.registry, () => devFallbackStore);
const minigameLauncher = createMinigameLauncher({
  layer: getUiLayer(),
  store: progressStore,
  overlays: hud.overlays,
  resolveRoomTitle,
  registry: createDefaultMinigameRegistry(),
});

// The Igloo's Trophy Case (#42): reloads `store.loadAll()` on every open
// (no live update, no persistence -- #34), registered with `hud.overlays` so
// Escape closes it and it closes any other open overlay first.
const trophyCase = createTrophyCase(uiLayer, {
  store: progressStore,
  onClose: () => hud.overlays.close(TROPHY_CASE_OVERLAY_ID),
});

gameEvents.on('hotspot:click', ({ hotspotId }) => {
  if (hotspotId !== 'trophy-case') return;
  hud.overlays.open(TROPHY_CASE_OVERLAY_ID, () => trophyCase.close());
  void trophyCase.open();
});

// A toast "wherever the Player is" for every earned Badge (#42), not just
// while the Trophy Case happens to be open.
wireBadgeToast();

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
const devHookActive = devHudActive || devMinigameActive || devCreatorActive;

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
    // Registers this Player's store before the Penguin Creator loads through
    // it, so that load shares the session's sign-in load (#34).
    void progress.start(
      player,
      createSupabaseProgressStore({
        client: toProgressClient(client),
        playerId: player.id,
        emitter: gameEvents,
      }),
    );
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
    // Per `src/contracts/rooms.ts`, `room:leave` comes before `bindPlayer(null)`.
    const channel = endSession();
    bindPlayer(game.registry, null);
    progress.stop();
    if (channel) void stopChannel(channel);
    if (pendingPrevious) void stopChannel(pendingPrevious);
    pendingPrevious = null;
    if (devHookActive) return;
    penguinEditor.playerSignedOut();
    // Quits any in-progress round (no `recordRound`) rather than leaving it
    // open behind a signed-out session.
    hud.overlays.close(MINIGAME_OVERLAY_ID);
    hud.overlays.close(TROPHY_CASE_OVERLAY_ID);
    overlay.showSignedOut();
    hud.hide();
  },
  onError: (message) => {
    overlay.showError(message);
  },
});
