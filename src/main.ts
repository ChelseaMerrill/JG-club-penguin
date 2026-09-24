import './style.css';
import { loadEnv } from './env';
import { startGame } from './game/main';
import { getSupabaseClient } from './auth/supabase-client';
import { startAuth, toAuthClient } from './auth/auth-session';
import { bindPlayer } from './auth/player';
import { createLoginOverlay } from './ui/login-overlay';
import { mountStage } from './ui/stage';
import { getUiLayer } from './ui/ui-layer';
import { gameEvents } from './contracts';
import { createHud } from './ui/hud/hud';
import { resolveRoomTitle } from './ui/hud/room-titles';
import { initDevHudHook } from './ui/hud/dev-hud-hook';
import { createInMemoryProgressStore } from './persistence/in-memory-progress-store';
import { createMinigameLauncher } from './minigames/minigame-launcher';
import { createDefaultMinigameRegistry } from './minigames/minigame-registry';
import { initDevMinigameHook } from './minigames/dev-minigame-hook';

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
  initialBalance: 0, // until #34 loads the real Token balance
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
    bindPlayer(game.registry, player);
    if (devHudActive || devMinigameActive) return;
    overlay.showSignedIn(player);
    hud.show();
  },
  onSignedOut: () => {
    bindPlayer(game.registry, null);
    if (devHudActive || devMinigameActive) return;
    overlay.showSignedOut();
    hud.hide();
  },
  onError: (message) => {
    overlay.showError(message);
  },
});
