import './style.css';
import { loadEnv } from './env';
import { startGame } from './game/main';
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
import { createInMemoryProgressStore } from './persistence/in-memory-progress-store';
import { STARTING_TOKENS } from './persistence/minigame-rules';
import { createMinigameLauncher } from './minigames/minigame-launcher';
import { createDefaultMinigameRegistry } from './minigames/minigame-registry';
import { initDevMinigameHook } from './minigames/dev-minigame-hook';
import { MINIGAME_OVERLAY_ID } from './minigames/minigame-shell';
import { createPenguinCreator } from './ui/penguin-creator';
import { createPenguinEditor } from './penguin/penguin-editor';

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

// The signed-in Player, so a loaded or saved look can replace `player.look`
// in the registry without waiting for another auth event.
let currentPlayer: Player | null = null;

const creator = createPenguinCreator(getUiLayer(), {
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
  onLookChanged: (look) => {
    if (!currentPlayer) return;
    currentPlayer = { ...currentPlayer, look };
    bindPlayer(game.registry, currentPlayer);
  },
  onReady: () => {
    hud.show();
  },
  onError: (message) => {
    gameEvents.emit('ui:toast', { message });
  },
});

gameEvents.on('ui:open-creator', () => {
  penguinEditor.edit();
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
    currentPlayer = player;
    bindPlayer(game.registry, player);
    if (devHudActive || devMinigameActive) return;
    overlay.showSignedIn();
    // Shows the HUD once the Player has a Penguin: straight away for a
    // returning Player, after the first save for a new one.
    void penguinEditor.playerSignedIn();
  },
  onSignedOut: () => {
    currentPlayer = null;
    bindPlayer(game.registry, null);
    penguinEditor.playerSignedOut();
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
