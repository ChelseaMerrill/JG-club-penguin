import './style.css';
import { loadEnv } from './env';
import { gameEvents } from './contracts';
import { startGame } from './game/main';
import { getSupabaseClient } from './auth/supabase-client';
import { startAuth, toAuthClient } from './auth/auth-session';
import { bindPlayer } from './auth/player';
import { createLoginOverlay } from './ui/login-overlay';
import { mountStage } from './ui/stage';
import { getUiLayer } from './ui/ui-layer';
import { createHud } from './ui/hud/hud';
import { resolveRoomTitle } from './ui/hud/room-titles';
import { initDevHudHook } from './ui/hud/dev-hud-hook';
import { createProgressSession } from './persistence/progress-session';
import {
  createSupabaseProgressStore,
  toProgressClient,
} from './persistence/supabase-progress-store';

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
  resolveRoomTitle,
  onIgloo: () => {
    // #15 changeRoom('igloo'); a no-op until then.
  },
  onSignOut: () => {
    void auth.signOut();
  },
  initialBalance: 0, // the saved balance arrives via tokens:changed once #34's progress session loads
});

const progress = createProgressSession({ registry: game.registry, emitter: gameEvents });

// Must run before `startAuth`: Supabase's `onAuthStateChange` always fires
// asynchronously, so `devHudActive` needs to be settled before its first
// (later-tick) SIGNED_OUT/SIGNED_IN callback checks it below.
const devHudActive = initDevHudHook(hud);

const auth = startAuth({
  client: toAuthClient(client),
  onSignedIn: (player) => {
    bindPlayer(game.registry, player);
    void progress.start(
      player,
      createSupabaseProgressStore({
        client: toProgressClient(client),
        playerId: player.id,
        emitter: gameEvents,
      }),
    );
    if (devHudActive) return;
    overlay.showSignedIn(player);
    hud.show();
  },
  onSignedOut: () => {
    bindPlayer(game.registry, null);
    progress.stop();
    if (devHudActive) return;
    overlay.showSignedOut();
    hud.hide();
  },
  onError: (message) => {
    overlay.showError(message);
  },
});
