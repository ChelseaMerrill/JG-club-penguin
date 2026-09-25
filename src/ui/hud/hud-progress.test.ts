// @vitest-environment jsdom
//
// The real HUD, the real `gameEvents` singleton, a real progress session and
// the real `createSupabaseProgressStore` (over a fake `ProgressClient`, the
// shared test double in `fake-progress-client.ts`) show the loaded Token
// balance on sign-in, then the balance after a finished Minigame round, then
// the balance after a Furniture purchase — with no fake HUD or fake store in
// between (#34).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gameEvents, DEFAULT_LOOK } from '../../contracts';
import type { Player } from '../../auth/player';
import {
  createProgressSession,
  PROGRESS_STORE_KEY,
  type ProgressSessionRegistry,
} from '../../persistence/progress-session';
import type { ProgressStore } from '../../persistence/progress-store';
import { createSupabaseProgressStore } from '../../persistence/supabase-progress-store';
import { defaultPlayerRow, makeFakeClient } from '../../persistence/testing/fake-progress-client';
import { createHud, type Hud } from './hud';

function createFakeRegistry(): ProgressSessionRegistry {
  const store = new Map<string, unknown>();
  return {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    remove: (key) => store.delete(key),
  };
}

let currentHud: Hud | undefined;

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  currentHud?.destroy();
  currentHud = undefined;
});

describe('HUD balance', () => {
  it('shows the loaded balance on sign-in, then after a finished round, then after a purchase', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const hud = createHud(root, {
      resolveRoomTitle: () => ({ title: '', subtitle: '' }),
      onIgloo: () => {},
      onReturnToTownCenter: () => {},
      onSignOut: () => {},
      onChatSend: () => Promise.resolve(true),
      initialBalance: 0,
    });
    currentHud = hud;
    hud.show();

    expect(root.querySelector('.hud__tokens-value')?.textContent).toBe('0');

    const registry = createFakeRegistry();
    const session = createProgressSession({ registry, emitter: gameEvents });
    const { client } = makeFakeClient({
      player: { data: defaultPlayerRow({ tokens: 250 }), error: null },
      recordRound: {
        data: { tokensAwarded: 52, balance: 302, newBest: true, badgeEarned: false },
        error: null,
      },
      purchaseItem: { data: { balance: 222 }, error: null },
    });
    const store = createSupabaseProgressStore({
      client,
      playerId: 'player-1',
      emitter: gameEvents,
    });
    const player: Player = { id: 'player-1', displayName: 'Chilly', look: DEFAULT_LOOK };

    await session.start(player, store);

    expect(root.querySelector('.hud__tokens-value')?.textContent).toBe('250');

    const wrapped = registry.get(PROGRESS_STORE_KEY) as ProgressStore;
    await wrapped.recordRound('bug-squash', 520, {
      score: 520,
      squashed: 520,
      bestCombo: 0,
      escaped: 0,
    });

    expect(root.querySelector('.hud__tokens-value')?.textContent).toBe('302');

    await wrapped.purchase('desk');

    expect(root.querySelector('.hud__tokens-value')?.textContent).toBe('222');
  });
});
