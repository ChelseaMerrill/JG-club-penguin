import './style.css';
import { loadEnv } from './env';
import { startGame, whenSceneReady } from './game/main';
import {
  LOCAL_PENGUIN_ARRIVED_EVENT,
  LOCAL_PENGUIN_MOVE_EVENT,
  type LocalPenguinArrivedEvent,
  type LocalPenguinMoveEvent,
  type RoomScene,
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
import { DEFAULT_LOOK, type PenguinLook } from './contracts';
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
import { createMarket, MARKET_OVERLAY_ID } from './ui/market';
import { wireBadgeToast } from './ui/badge-toast';

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
const sceneReady = whenSceneReady(game).then((scene) => {
  roomScene = scene;
  penguins = scene.penguins;
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
  return scene.penguins;
});

/** The signed-in Player's Room channel, and the Player it belongs to. */
let roomChannel: RoomChannel | null = null;
let channelPlayerId: string | null = null;
/** The signed-in Player's chat controller (#44), recreated alongside `roomChannel` each session. */
let chatController: ChatController | null = null;
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
  channel.onRoomChange((roomId) => debugOverlay?.setCurrentRoom(roomId));
  channel.onSubscribedChange((subscribed) => debugOverlay?.setSubscribed(subscribed));
  // #43: a remote Player's click-to-move walks their Penguin the same way
  // ours does, rather than snapping it forward.
  channel.on('move', ({ playerId, target }) => {
    view.walkTo(playerId, target);
  });

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
  // The saved balance arrives via `tokens:changed` once the progress
  // session's sign-in load finishes (#34).
  initialBalance: 0,
  onChatSend: (text) => chatController?.send(text) ?? Promise.resolve(false),
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

// The Roof Deck Market's Igloo Gear stall (#40): Casey's own NPC dialog
// (#36) isn't merged yet, so this hotspot opens the Market panel directly;
// `market.open()` is public so #36 can later open the same panel from
// Casey's dialog instead. Reloads `store.loadAll()` on every open, same as
// the Trophy Case.
const market = createMarket(uiLayer, {
  store: progressStore,
  onClose: () => hud.overlays.close(MARKET_OVERLAY_ID),
});

gameEvents.on('hotspot:click', ({ hotspotId }) => {
  if (hotspotId !== 'igloo-gear-stall') return;
  hud.overlays.open(MARKET_OVERLAY_ID, () => market.close());
  void market.open();
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
    overlay.showSignedOut();
    hud.hide();
  },
  onError: (message) => {
    overlay.showError(message);
  },
});
