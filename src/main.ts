import './style.css';
import { loadEnv } from './env';
import { startGame, whenSceneReady } from './game/main';
import { getSupabaseClient } from './auth/supabase-client';
import { startAuth, toAuthClient } from './auth/auth-session';
import { bindPlayer } from './auth/player';
import type { Player } from './auth/player';
import { createLoginOverlay } from './ui/login-overlay';
import { getUiLayer } from './ui/ui-layer';
import { createDebugOverlay, isDebugEnabled } from './ui/debug-overlay';
import { createRoomChannel } from './realtime/room-channel';
import type { RemotePenguinView, RoomChannel } from './realtime/room-channel';
import { toRealtimeClient } from './realtime/supabase-realtime';
import { lookFromPlayer } from './realtime/look';
import { gameEvents } from './game/events';
import { createStubRoomDriver, ENTRY_TILE } from './game/stub-rooms';
import { SPAWN_ROOM } from './contracts/rooms';

// Fail fast on a missing or malformed .env before anything boots.
loadEnv();

const game = startGame();
const client = getSupabaseClient();
const rooms = createStubRoomDriver(gameEvents);
const sceneReady = whenSceneReady(game);
const uiLayer = getUiLayer();

const debugOverlay = isDebugEnabled()
  ? createDebugOverlay(uiLayer, {
      onEnterRoom: (roomId) => rooms.enter(roomId),
      onSetLook: (look) => roomChannel?.setLook(look),
    })
  : null;

gameEvents.on('room:enter', ({ roomId }) => debugOverlay?.setCurrentRoom(roomId));
gameEvents.on('room:leave', () => debugOverlay?.setCurrentRoom(null));

function composeView(penguins: RemotePenguinView): RemotePenguinView {
  if (!debugOverlay) return penguins;
  return {
    upsert(p) {
      penguins.upsert(p);
      debugOverlay.upsert(p);
    },
    remove(playerId) {
      penguins.remove(playerId);
      debugOverlay.remove(playerId);
    },
    clear() {
      penguins.clear();
      debugOverlay.clear();
    },
  };
}

let roomChannel: RoomChannel | null = null;
// Bumped on every sign-in/out so an in-flight sign-in that loses a race with
// a later sign-out (or a duplicate sign-in) never creates a stray channel.
let signInToken = 0;

async function handleSignedIn(player: Player): Promise<void> {
  if (roomChannel) return;
  const token = ++signInToken;

  const penguins = await sceneReady;
  if (roomChannel || token !== signInToken) return;

  const look = lookFromPlayer(player);
  penguins.showLocal({ playerId: player.id, look, tile: ENTRY_TILE, facing: 's' });
  debugOverlay?.setOwnLook(look);

  roomChannel = createRoomChannel({
    client: toRealtimeClient(client),
    events: gameEvents,
    playerId: player.id,
    look,
    view: composeView(penguins),
  });
  rooms.enter(SPAWN_ROOM);
}

async function handleSignedOut(): Promise<void> {
  signInToken += 1;
  const channel = roomChannel;
  roomChannel = null;
  if (channel) {
    await channel.stop();
  }

  const penguins = await sceneReady;
  penguins.clear();
  debugOverlay?.clear();
  debugOverlay?.setCurrentRoom(null);
  rooms.reset();
}

const overlay = createLoginOverlay(uiLayer, {
  onSignIn: () => {
    void auth.signIn(new URL('./', window.location.href).href);
  },
  onSignOut: () => {
    void auth.signOut();
  },
});

const auth = startAuth({
  client: toAuthClient(client),
  onSignedIn: (player) => {
    bindPlayer(game.registry, player);
    overlay.showSignedIn(player);
    void handleSignedIn(player);
  },
  onSignedOut: () => {
    bindPlayer(game.registry, null);
    overlay.showSignedOut();
    void handleSignedOut();
  },
  onError: (message) => {
    overlay.showError(message);
  },
});
