import './style.css';
import { loadEnv } from './env';
import { startGame } from './game/main';
import { getSupabaseClient } from './auth/supabase-client';
import { startAuth, toAuthClient } from './auth/auth-session';
import { bindPlayer, savePenguin } from './auth/player';
import { createPenguinEditor } from './penguin/penguin-editor';
import { createLoginOverlay } from './ui/login-overlay';
import { createPenguinCreator } from './ui/penguin-creator';
import { getUiLayer } from './ui/ui-layer';

// Fail fast on a missing or malformed .env before anything boots.
loadEnv();

const game = startGame();
const client = toAuthClient(getSupabaseClient());

const overlay = createLoginOverlay(getUiLayer(), {
  onSignIn: () => {
    void auth.signIn(new URL('./', window.location.href).href);
  },
  onSignOut: () => {
    void auth.signOut();
  },
  onEditPenguin: () => {
    penguinEditor.edit();
  },
});

const creator = createPenguinCreator(getUiLayer(), {
  onSubmit: (appearance) => {
    void penguinEditor.submit(appearance);
  },
  onCancel: () => {
    penguinEditor.cancel();
  },
});

const penguinEditor = createPenguinEditor({
  creator,
  save: (playerId, appearance) => savePenguin(client, playerId, appearance),
  onPlayerChanged: (player) => {
    bindPlayer(game.registry, player);
    overlay.showSignedIn(player);
  },
});

const auth = startAuth({
  client,
  onSignedIn: (player) => {
    bindPlayer(game.registry, player);
    overlay.showSignedIn(player);
    penguinEditor.playerSignedIn(player);
  },
  onSignedOut: () => {
    bindPlayer(game.registry, null);
    overlay.showSignedOut();
    penguinEditor.playerSignedOut();
  },
  onError: (message) => {
    overlay.showError(message);
  },
});
