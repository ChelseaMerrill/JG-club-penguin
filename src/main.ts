import './style.css';
import { loadEnv } from './env';
import { startGame } from './game/main';
import { getSupabaseClient } from './auth/supabase-client';
import { startAuth, toAuthClient } from './auth/auth-session';
import { bindPlayer } from './auth/player';
import { createLoginOverlay } from './ui/login-overlay';
import { mountStage } from './ui/stage';
import { getUiLayer } from './ui/ui-layer';
import { createHud } from './ui/hud/hud';
import { initDevHudHook } from './ui/hud/dev-hud-hook';
import { getRoomDefinition } from './game/rooms/registry';

// Fail fast on a missing or malformed .env before anything boots.
loadEnv();

const game = startGame();
mountStage(game);
const client = getSupabaseClient();

const overlay = createLoginOverlay(getUiLayer(), {
  onSignIn: () => {
    void auth.signIn(new URL('./', window.location.href).href);
  },
  onSignOut: () => {
    void auth.signOut();
  },
});

const hud = createHud(getUiLayer(), {
  // #13's `getRoomDefinition` replaces the standalone `room-titles.ts` map
  // (#16 D7): title/subtitle are just the registered Room's own fields.
  resolveRoomTitle: (roomId) => {
    const room = getRoomDefinition(roomId);
    return { title: room.title, subtitle: room.subtitle };
  },
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
    bindPlayer(game.registry, player);
    if (devHudActive) return;
    overlay.showSignedIn(player);
    hud.show();
  },
  onSignedOut: () => {
    bindPlayer(game.registry, null);
    if (devHudActive) return;
    overlay.showSignedOut();
    hud.hide();
  },
  onError: (message) => {
    overlay.showError(message);
  },
});
