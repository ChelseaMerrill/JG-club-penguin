import './style.css';
import { loadEnv } from './env';
import { startGame, whenSceneReady } from './game/main';
import {
  LOCAL_PENGUIN_ARRIVED_EVENT,
  LOCAL_PENGUIN_MOVE_EVENT,
  SNOWBALL_THROW_EVENT,
  type LocalPenguinArrivedEvent,
  type LocalPenguinMoveEvent,
  type RoomScene,
  type SnowballThrowRequestEvent,
} from './game/rooms/RoomScene';
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
import { createWallText, type WallText } from './ui/wall-text/wall-text';
import {
  createCoreValuesCard,
  CORE_VALUES_OVERLAY_ID,
  type CoreValuesCard,
} from './ui/wall-text/core-values-card';
import { resolveRoomIdFromLocation } from './game/rooms/dev-room-hook';
import { CORE_VALUES_POSTER_HOTSPOT_ID } from './game/rooms/definitions/town-center';
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
import {
  createEmoteController,
  type EmoteController,
  type EmoteRoomChannel,
  type EmotePenguinView,
} from './emotes/emote-controller';
import { EMOTE_TO_ANIM } from './emotes/emote-rules';
import {
  createSnowballController,
  type SnowballController,
  type SnowballRoomChannel,
  type SnowballView,
} from './snowball/snowball-controller';
import {
  exposeSnowballDebug,
  type SnowballThrowLogEntry,
  type SnowHatDebugInfo,
} from './snowball/dev-snowball-hook';
import { DEFAULT_LOOK, type EmoteId, type PenguinLook, type RoomBroadcastMap } from './contracts';
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
import { devLeaderboardSeed } from './minigames/dev-leaderboard-seed';
import { MINIGAME_OVERLAY_ID } from './minigames/minigame-shell';
import { createPenguinCreator } from './ui/penguin-creator';
import { createPenguinEditor } from './penguin/penguin-editor';
import { initDevCreatorHook } from './penguin/dev-creator-hook';
import { createNpcDialog } from './ui/npc-dialog/npc-dialog';
import { recordNpcTalked, recordOpenStall } from './game/rooms/dev-room-hook';
import { createTrophyCase, TROPHY_CASE_OVERLAY_ID } from './ui/trophy-case';
import { createMapScreen } from './ui/map-screen';
import { createMarket, MARKET_OVERLAY_ID } from './ui/market';
import { wireBadgeToast } from './ui/badge-toast';
import { createQuestController } from './quests/quest-controller';
import { QUEST_DEFINITIONS, questsInBuild } from './quests/quest-definitions';
import { createQuestsPanel, QUESTS_OVERLAY_ID, type QuestsTab } from './ui/quests-panel';
import { createQuestWidget } from './ui/quest-widget';
import { createQuestBanner } from './ui/quest-banner';
import type { QuestsTestHandle } from './quests/quests-test-handle';
import type { MinigameId } from './contracts';

// Fail fast on a missing or malformed .env before anything boots.
loadEnv();

const game = startGame();
mountStage(game);
const client = getSupabaseClient();
const realtime = toRealtimeClient(client);
const uiLayer = getUiLayer();

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

// Assigned once `hud`/`creator` exist below (`coreValuesCard` needs
// `hud.overlays`; the guard needs `creator.isOpen()`); `tryOpenCoreValuesCard`
// only reads them when the button is actually clicked, well after boot
// finishes, the same forward-reference pattern `onSignOut`'s `auth`
// reference below relies on.
let coreValuesCard: CoreValuesCard | null = null;

/**
 * True only while a Room Session is running (set alongside `channelPlayerId`
 * in `startSession`/`endSession`) (#77 review round 1 fix 2): the condition
 * `tryOpenCoreValuesCard` and the poster button's own `tabIndex`/`inert`
 * gate on, so there's nothing to open (and nothing focusable/announced)
 * before a Session exists or after it ends.
 */
let sessionActive = false;

function setSessionActive(active: boolean): void {
  sessionActive = active;
  wallText.setSessionActive(active);
}

/**
 * Opens the Core Values card, unless there's no Session yet or the Penguin
 * Creator is open (#77 review round 1 fix 2) -- shared by the wall poster's
 * own DOM button (`onPosterClick` below) and `RoomScene`'s Phaser-side
 * hotspot hit-area for the same spot (the `hotspot:click` listener further
 * down, nit 5), so both paths gate the same way.
 */
function tryOpenCoreValuesCard(): void {
  if (!sessionActive || creator.isOpen()) return;
  coreValuesCard?.open();
}

// Mounted before the login overlay and HUD (#77 D3) so it always paints
// below them in `#ui`'s DOM-order stacking. The initial render matches
// whatever Room `RoomScene` itself boots into (#77 review round 1 fix 1):
// `RoomScene` reads `?room=` via this same `resolveRoomIdFromLocation`, not
// always `SPAWN_ROOM_ID`, so this overlay would otherwise show Town Center's
// poster text/button over a different Room in dev/e2e.
const wallText: WallText = createWallText(uiLayer, {
  resolve: (roomId) => getRoomDefinition(roomId).wallText ?? [],
  resolvePosterHotspot: (roomId) =>
    getRoomDefinition(roomId).hotspots?.find(
      (hotspot) => hotspot.id === CORE_VALUES_POSTER_HOTSPOT_ID,
    ),
  onPosterClick: () => tryOpenCoreValuesCard(),
  initialRoomId: resolveRoomIdFromLocation(window.location),
});

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
/**
 * The one producer of `room:leave`/`room:enter` (#15 A1, replacing #28's
 * `stub-rooms.ts` wholesale). Built once the Scene exists, since it restarts
 * `RoomScene` directly; every caller below (`startSession`, `endSession`,
 * the debug overlay, the HUD) is only ever reachable once a Session has
 * started, which itself waits on `sceneReady` first, so `roomNavigator` is
 * always set by the time any of them runs.
 */
let roomNavigator: RoomNavigator | null = null;
/** Built once `sceneReady` resolves (below), so it's ready before any sign-in (#47). */
let emoteController: EmoteController | null = null;
const sceneReady = whenSceneReady(game).then((scene) => {
  roomScene = scene;
  penguins = scene.penguins;
  emoteController = createEmoteController({
    channel: emoteChannel,
    view: composeEmoteView(scene.penguins),
  });
  roomNavigator = createRoomNavigator({
    scene: {
      showRoom: (roomId, entryTile, force) => scene.showRoom(roomId, entryTile, force),
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

  // #43: attached once (the same Scene instance and its `events` emitter are
  // reused across every `showRoom` restart). A local walk's start/re-route
  // broadcasts `move`; its arrival (never a queued re-route, never an
  // own-tile no-op) tracks the Presence tile once, not per step or frame.
  scene.events.on(LOCAL_PENGUIN_MOVE_EVENT, (event: LocalPenguinMoveEvent) => {
    roomChannel?.send('move', { target: event.target }).catch((err: unknown) => {
      console.error('[main] move broadcast failed', err);
    });
  });
  scene.events.on(LOCAL_PENGUIN_ARRIVED_EVENT, (event: LocalPenguinArrivedEvent) => {
    roomChannel?.setTile(event.tile, event.facing);
  });
  // #53: a click while aiming. A 0-ammo click resolves `false` and does
  // nothing at all (no throw, no move: the scene already suppressed it).
  scene.events.on(SNOWBALL_THROW_EVENT, ({ target }: SnowballThrowRequestEvent) => {
    const controller = snowballController;
    if (!controller || !snowballMode) return;
    void controller.throwAt(target).then((sent) => {
      if (sent && HOOKS_ENABLED) snowballThrowLog.push({ target, at: Date.now() });
    });
  });
  return scene.penguins;
});

/** The signed-in Player's Room channel, and the Player it belongs to. */
let roomChannel: RoomChannel | null = null;
let channelPlayerId: string | null = null;
/** The signed-in Player's chat controller (#44), recreated alongside `roomChannel` each session. */
let chatController: ChatController | null = null;
/** The signed-in Player's Snowball mode controller (#53), created and stopped alongside `chatController`. */
let snowballController: SnowballController | null = null;
/** Whether Snowball mode is on (#53 D6): only ever during a Session. */
let snowballMode = false;
/** Test-only (`__snowballDebug.throwLog`): every acknowledged throw, pushed only when `HOOKS_ENABLED`. */
const snowballThrowLog: SnowballThrowLogEntry[] = [];
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
 * Turns Snowball mode on or off everywhere at once (#53 D6): the scene's
 * aiming and the HUD's button and panel. Refused (stays off) outside a
 * Session. Exits on a Room change, sign-out, any HUD overlay opening,
 * Escape (via the HUD's own keydown handling, #109), and the throw that
 * takes ammo to 0 (via the controller's `onAmmoEmptied`, #109).
 */
function setSnowballMode(on: boolean): void {
  const next = on && snowballController !== null && roomScene !== null;
  snowballMode = next;
  roomScene?.setAiming(next);
  hud.setSnowballMode(next);
}

/**
 * Takes every snow hat graphic down (#53 D4): the controller clears its own
 * hat state on a Room change or `stop()` without calling back into the
 * view, so the render side is cleared here too, and no hat outlives the
 * Room or Session it was thrown in.
 */
function clearSnowHatGraphics(): void {
  roomScene?.snowball.setLocalSnowHat(false);
  penguins?.clearSnowHats();
}

/** `__snowballDebug.snowHats`: the controller's timing, with `rendered` read from the real Penguins. */
function debugSnowHats(): Record<string, SnowHatDebugInfo> {
  const result: Record<string, SnowHatDebugInfo> = {};
  const controller = snowballController;
  if (!controller) return result;
  for (const [playerId, hat] of controller.snowHats()) {
    const rendered =
      playerId === channelPlayerId
        ? (roomScene?.localHasSnowHat() ?? false)
        : (penguins?.hasSnowHat(playerId) ?? false);
    result[playerId] = { appliedAt: hat.appliedAt, until: hat.until, rendered };
  }
  return result;
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
  setSessionActive(false);
  chatController?.stop();
  chatController = null;
  // `emoteController` (#47) is a boot-time singleton (see its declaration
  // above), never stopped: its `onRoomChange` forwarding above already
  // clears every active Emote once the real Room channel reports the leave.
  setSnowballMode(false);
  snowballController?.stop();
  snowballController = null;
  clearSnowHatGraphics();
  penguins?.clear();
  debugOverlay?.clear();
  debugOverlay?.setCurrentRoom(null);
  debugOverlay?.setSubscribed(false);
  // #46: Quest tracking lives and dies with the Session.
  quests.stop();
  questWidget.render(null);
  hud.overlays.close(QUESTS_OVERLAY_ID);
  return channel;
}

/**
 * Creates a Snowball controller against `channel`/`view`/`playerId`, assigns
 * it to `snowballController`, and wires its ammo reporting into the HUD
 * (#109): the create → assign → `setSnowballAmmo` → `onAmmoChange` →
 * `onAmmoEmptied` sequence shared by `startSession`'s real controller and
 * `initDevAsPlayerHook`'s stub one.
 */
function wireSnowballController(
  channel: SnowballRoomChannel,
  view: SnowballView,
  playerId: string,
): SnowballController {
  const snowball = createSnowballController({ channel, view, playerId });
  snowballController = snowball;
  const ammo = snowball.ammo();
  hud.setSnowballAmmo(ammo.count, ammo.capacity);
  snowball.onAmmoChange(({ count, capacity }) => hud.setSnowballAmmo(count, capacity));
  // #109: the throw that takes ammo to 0 leaves the mode once it's sent.
  snowball.onAmmoEmptied(() => setSnowballMode(false));
  return snowball;
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
  setSessionActive(true);
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
  const scene = roomScene;
  if (scene) {
    wireSnowballController(channel, scene.snowball, player.id);
  }
  channel.onRoomChange((roomId) => debugOverlay?.setCurrentRoom(roomId));
  // #53: a Room change leaves Snowball mode and drops every snow hat graphic.
  channel.onRoomChange(() => {
    setSnowballMode(false);
    clearSnowHatGraphics();
  });
  channel.onSubscribedChange((subscribed) => debugOverlay?.setSubscribed(subscribed));
  // #43: a remote Player's click-to-move walks their Penguin the same way
  // ours does, rather than snapping it forward.
  channel.on('move', ({ playerId, target }) => {
    view.walkTo(playerId, target);
  });

  // After the Room channel exists (#15 A2), so it sees the first `room:enter`
  // and joins Presence.
  void roomNavigator?.enterSpawnRoom();
  // #46: loads Quest progress from saved data (steps already done aren't toasted).
  void quests.start();
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
 *
 * Also wires a Snowball controller (#109) against a local-only stub channel
 * (`send` resolves `true` at once; `on` is never called, and `onRoomChange`
 * is never called either since the stub is never told about a Room change
 * directly): an e2e spec can drive Snowball mode's real Escape/last-throw
 * exits under `?asPlayer&hud` without #15 D6/A6's "no Room channel"
 * changing: no Presence, no Postgres, no other Player ever observes this
 * fixture Player's throw. Because the stub's own `onRoomChange` never fires,
 * a Room change here is instead caught via `room:leave` (#109): without it,
 * the HUD could keep showing Snowball mode on after a `?asPlayer` Room
 * change even though `startSession`'s real controller always exits on one.
 */
function initDevAsPlayerHook(): boolean {
  if (!HOOKS_ENABLED) return false;
  if (!new URLSearchParams(window.location.search).has('asPlayer')) return false;

  const fixturePlayer: Player = {
    id: 'e2e-fixture-player',
    displayName: 'E2E Fixture Player',
    look: DEFAULT_LOOK,
  };
  bindPlayer(game.registry, fixturePlayer);
  void sceneReady.then(() => {
    void roomNavigator?.enterSpawnRoom();
    if (!roomScene) return;
    const stubChannel: SnowballRoomChannel = {
      send: () => Promise.resolve(true),
      on: () => () => {},
      onRoomChange: () => () => {},
    };
    wireSnowballController(stubChannel, roomScene.snowball, fixturePlayer.id);
    // #109: the stub channel can't tell the controller about a Room change
    // itself, so leave the mode directly off `room:leave`.
    gameEvents.on('room:leave', () => setSnowballMode(false));
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
  onSnowballToggle: (on) => setSnowballMode(on),
  // #46: toggles the Quests panel (defined further down, read on click).
  onQuests: () => toggleQuestsPanel(),
});

// #53 D8/N8: any HUD overlay opening (Creator, Minigame, Trophy Case,
// Market, MENU, the Map) leaves Snowball mode. Also clears the scene's
// aiming state (`roomScene?.setAiming`), which `hud.ts`'s own matching
// `overlays.onOpen` subscription (#109) can't reach directly; harmless and
// idempotent alongside that one since `setSnowballMode(false)` while
// already off is a no-op.
hud.overlays.onOpen(() => setSnowballMode(false));

exposeSnowballDebug(() => ({
  mode: snowballMode,
  ammo: snowballController?.ammo().count ?? 0,
  reticle: roomScene?.snowballReticle() ?? null,
  snowHats: debugSnowHats(),
  throwLog: [...snowballThrowLog],
}));

// The Map (#33): reproduces design/Club JenGuin Map.dc.html, self-wiring the
// HUD's MAP button (`ui:open-map`) and `hud.overlays` internally.
createMapScreen(uiLayer, {
  overlays: hud.overlays,
  changeRoom: (roomId) => {
    void roomNavigator?.changeRoom(roomId);
  },
  currentRoomId: () => roomNavigator?.currentRoomId() ?? null,
});

// #77 D7: registers with the same shared `OverlayManager` MENU uses, so
// opening one closes the other and Escape closes whichever is open.
coreValuesCard = createCoreValuesCard(getUiLayer(), hud.overlays);

const progress = createProgressSession({ registry: game.registry, emitter: gameEvents });

// The dev/e2e hooks (below) run without signing in, and the Creator hook
// loads through the store while it initialises, so the in-memory fake is
// decided up front from the same build-time flag the hooks read. Vite
// replaces it with a literal `false` in a production build, so a real
// deployment never falls back to the fake: signed out, the store rejects
// with `not_authenticated`.
const e2eHooksEnabled = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';
const devFallbackStore: ProgressStore | null = e2eHooksEnabled
  ? createInMemoryProgressStore({ emitter: gameEvents, ...devLeaderboardSeed() })
  : null;

declare global {
  interface Window {
    /** Test-only (#77 review round 1 fix 2); see the assignment below. */
    __wallTextTest?: { setSessionActive: (active: boolean) => void };
  }
}

// Test-only (#77 review round 1 fix 2): e2e can't complete a real Google
// sign-in, so this flips `sessionActive` directly, letting a spec exercise
// the poster button's real guarded click path (and produce its own
// screenshots) without a Session. Deliberately its own tiny hook, not folded
// into `?hud`/`?creator`/`?minigame` or #15's own upcoming `?asPlayer` hook,
// so the two stay conflict-free. Gated and named exactly like the existing
// hooks; Vite's static replacement strips this block from a production
// build the same way it does `initDevHudHook`'s own body.
if (e2eHooksEnabled) {
  window.__wallTextTest = { setSessionActive };
}

// Built once at boot for the long-lived consumers below; every call forwards
// to the signed-in Player's Supabase store (#34), or to the dev fallback.
const progressStore = createActiveProgressStore(game.registry, () => devFallbackStore);

/** `window.localStorage`, or `null` where reading it throws (private mode, sandboxed frames). */
function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// #46: the quest engine. Reads through the same store every consumer uses;
// `room:enter` (the Dev Pit visit) it hears itself, and a finished round or
// a purchase re-reads progress through `questAwareStore` below.
const quests = createQuestController({
  store: progressStore,
  quests: questsInBuild(QUEST_DEFINITIONS, createDefaultMinigameRegistry()),
  events: gameEvents,
  storage: safeLocalStorage(),
});

function refreshQuestsAfter<T>(pending: Promise<T>): Promise<T> {
  return pending.then((result) => {
    void quests.refresh();
    return result;
  });
}

/** `progressStore`, plus a Quest refresh after every successful round or purchase (#46). */
const questAwareStore: ProgressStore = {
  ...progressStore,
  recordRound: (minigameId, score, stats) =>
    refreshQuestsAfter(progressStore.recordRound(minigameId, score, stats)),
  purchase: (itemId) => refreshQuestsAfter(progressStore.purchase(itemId)),
};

const minigameLauncher = createMinigameLauncher({
  layer: getUiLayer(),
  store: questAwareStore,
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

// The Roof Deck Market's Igloo Gear stall (#40): this hotspot opens the
// Market panel directly, the same real panel Casey's own NPC dialog (#36,
// below) opens through `market.open()`. Reloads `store.loadAll()` on every
// open, same as the Trophy Case.
const market = createMarket(uiLayer, {
  store: questAwareStore,
  onClose: () => hud.overlays.close(MARKET_OVERLAY_ID),
});

gameEvents.on('hotspot:click', ({ hotspotId }) => {
  if (hotspotId !== 'igloo-gear-stall') return;
  hud.overlays.open(MARKET_OVERLAY_ID, () => market.close());
  void market.open();
});

// #46: the Quests panel (registered with `hud.overlays` like the Trophy
// Case and the Market), the HUD quest widget and the QUEST COMPLETE banner.
const questsPanel = createQuestsPanel(uiLayer, {
  onTrack: (questId) => quests.track(questId),
  onBadges: () => {
    hud.overlays.open(TROPHY_CASE_OVERLAY_ID, () => trophyCase.close());
    void trophyCase.open();
  },
  onClose: () => hud.overlays.close(QUESTS_OVERLAY_ID),
});
const questWidget = createQuestWidget(hud.questSlot, {
  onOpen: (tab) => openQuestsPanel(tab),
});
const questBanner = createQuestBanner(uiLayer);

function openQuestsPanel(tab: QuestsTab): void {
  hud.overlays.open(QUESTS_OVERLAY_ID, () => {
    questsPanel.close();
    questWidget.setSuppressed(false);
    hud.setQuestsActive(false);
  });
  questsPanel.open(tab);
  questWidget.setSuppressed(true);
  hud.setQuestsActive(true);
}

function toggleQuestsPanel(): void {
  if (hud.overlays.current() === QUESTS_OVERLAY_ID) {
    hud.overlays.close(QUESTS_OVERLAY_ID);
    return;
  }
  openQuestsPanel('active');
}

quests.onChange((view) => {
  questWidget.render(view);
  questsPanel.render(view);
});
quests.onQuestComplete((quest, tokensAwarded) => questBanner.show(quest.title, tokensAwarded));

declare global {
  interface Window {
    /** Test-only (#46); see `src/quests/quests-test-handle.ts`. */
    __questsTest?: QuestsTestHandle;
  }
}

// Test-only (#46), gated exactly like `__wallTextTest` above.
if (e2eHooksEnabled) {
  window.__questsTest = {
    async recordRound(minigameId, score, stats) {
      await questAwareStore.recordRound(minigameId as MinigameId, score, stats as never);
    },
    async purchase(itemId) {
      await questAwareStore.purchase(itemId);
    },
  };
}

// NPC dialog (#36). #37 is on `main`, so GRAB THE HAMMER/GRAB THE SPATULA
// open the real Minigame shell via `minigameLauncher.launch`. #40 is also on
// `main` now, so Casey's own stall button opens the same real Market panel
// the Roof Deck's `igloo-gear-stall` hotspot does, above. `npc:talked` and
// every `openStall` call are still recorded to `window.__roomDebug` for
// `e2e/npcs.spec.ts` (`dev-room-hook.ts`).
createNpcDialog(getUiLayer(), {
  overlays: hud.overlays,
  actions: {
    launchMinigame: (minigameId) => {
      minigameLauncher.launch(minigameId);
    },
    openStall: (stallId) => {
      recordOpenStall(stallId);
      hud.overlays.open(MARKET_OVERLAY_ID, () => market.close());
      void market.open();
    },
  },
});
gameEvents.on('npc:talked', ({ npcId }) => {
  recordNpcTalked(npcId);
});

// #77 review round 1 nit 5: RoomScene builds a Phaser-side hit-area for
// every `RoomDefinition.hotspots` entry, including this one, the same way it
// does for the Trophy Case and the Igloo Gear stall above -- without this
// listener that zone was dead (never reachable in practice, since the DOM
// `.wall-text__poster` button normally covers the same rect and wins every
// hit-test, but dead code left lying around all the same). Goes through the
// same `tryOpenCoreValuesCard` guard as the button itself.
gameEvents.on('hotspot:click', ({ hotspotId }) => {
  if (hotspotId !== CORE_VALUES_POSTER_HOTSPOT_ID) return;
  tryOpenCoreValuesCard();
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
const devCreatorActive = initDevCreatorHook(penguinEditor, progressStore);
const devAsPlayerActive = initDevAsPlayerHook();
const devHookActive = devHudActive || devMinigameActive || devCreatorActive || devAsPlayerActive;
// #46: the dev/e2e hooks never start a real Session, so Quest tracking
// starts here instead, against the in-memory fallback store.
if (devHookActive) void quests.start();

gameEvents.on('ui:open-creator', () => {
  penguinEditor.edit();
});

const auth = startAuth({
  client: toAuthClient(client),
  onSignedIn: (player) => {
    // A repeat sign-in event for the same Player keeps the Session and the
    // look already loaded for it.
    if (currentPlayer?.id === player.id) return;
    // A different Player while a Session exists: leave it first, and take
    // down the previous Player's HUD rather than leaving it showing over the
    // next Player's sign-in gate (#75 review round 1).
    const isAccountSwitch = currentPlayer !== null;
    const previous = isAccountSwitch ? endSession() : null;
    if (isAccountSwitch) {
      hud.overlays.close(MINIGAME_OVERLAY_ID);
      hud.hide();
    }
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
      // #75 review round 1: `player.look.name` is always '' here (a real
      // sign-in's look only ever gains a name later, once progress loads
      // through `penguinEditor`), so a Session can never legitimately start
      // on this path for a real sign-in. Hook mode (`?hud`, `?minigame`,
      // `?creator`) never exercises real auth in e2e, so this is a no-op in
      // practice; it's kept only so a real `SIGNED_IN` doesn't slip an
      // unnamed Player into a Session.
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
    // Only #15's `?asPlayer` owns `registry.player`/the Session itself
    // outside the normal auth flow; the real, always-eventually-fired
    // session-less signed-out signal must not clobber either one out from
    // under it. `?hud`/`?creator`/`?minigame` never touch `registry.player`
    // or start a real Session themselves, so this cleanup still runs for
    // them exactly as it did before #15 (review round 1 narrowed this from
    // the broader `devHookActive`, which incorrectly skipped it for them too).
    if (!devAsPlayerActive) {
      // Per `src/contracts/rooms.ts`, `room:leave` comes before `bindPlayer(null)`.
      const channel = endSession();
      bindPlayer(game.registry, null);
      progress.stop();
      if (channel) void stopChannel(channel);
      if (pendingPrevious) void stopChannel(pendingPrevious);
      pendingPrevious = null;
    }
    // Every dev hook (including `?asPlayer`) owns its own UI state; the real
    // signed-out signal must not reach back in and hide/reset it (`dev-hud-
    // hook.ts`'s own doc comment covers why: `hud.show()` already ran
    // synchronously, and this signal always arrives later).
    if (devHookActive) return;
    penguinEditor.playerSignedOut();
    // Quits any in-progress round (no `recordRound`) rather than leaving it
    // open behind a signed-out session.
    hud.overlays.close(MINIGAME_OVERLAY_ID);
    hud.overlays.close(TROPHY_CASE_OVERLAY_ID);
    hud.overlays.close(MARKET_OVERLAY_ID);
    hud.overlays.close(CORE_VALUES_OVERLAY_ID);
    hud.overlays.close(QUESTS_OVERLAY_ID);
    overlay.showSignedOut();
    hud.hide();
  },
  onError: (message) => {
    overlay.showError(message);
  },
});
