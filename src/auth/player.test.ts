import { describe, expect, it, vi } from 'vitest';
import {
  bindPlayer,
  ensurePlayer,
  loadPlayer,
  type PlayerRegistry,
  type PlayersClient,
} from './player';

interface FakeRow {
  id: string;
  penguin_color: string;
}

function createFakeClient(options: {
  upsertError?: { message: string } | null;
  row?: FakeRow | null;
  selectError?: { message: string } | null;
}): { client: PlayersClient; upsert: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> } {
  const upsert = vi.fn().mockResolvedValue({ error: options.upsertError ?? null });
  const single = vi.fn().mockResolvedValue({
    data: options.row ?? null,
    error: options.selectError ?? null,
  });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const client: PlayersClient = {
    from: () => ({ upsert, select }) as never,
  };
  return { client, upsert, select };
}

describe('loadPlayer', () => {
  it('reads the stored row and prefers full_name over email for displayName', async () => {
    const { client } = createFakeClient({ row: { id: 'user-1', penguin_color: '#00bdff' } });

    const result = await loadPlayer(client, {
      id: 'user-1',
      email: 'ada@example.com',
      user_metadata: { full_name: 'Ada Lovelace' },
    });

    expect(result).toEqual({
      player: { id: 'user-1', displayName: 'Ada Lovelace', penguinColor: '#00bdff', penguin: null },
      error: null,
    });
  });

  it('falls back to email when full_name is absent', async () => {
    const { client } = createFakeClient({ row: { id: 'user-1', penguin_color: '#123456' } });

    const result = await loadPlayer(client, {
      id: 'user-1',
      email: 'ada@example.com',
      user_metadata: {},
    });

    expect(result.player).toEqual({
      id: 'user-1',
      displayName: 'ada@example.com',
      penguinColor: '#123456',
      penguin: null,
    });
  });

  it('reports an error when the row is missing', async () => {
    const { client } = createFakeClient({ row: null, selectError: { message: 'not found' } });

    const result = await loadPlayer(client, { id: 'user-1', email: 'ada@example.com' });

    expect(result).toEqual({ player: null, error: 'not found' });
  });
});

describe('ensurePlayer', () => {
  it('upserts with ignoreDuplicates and never sends a penguin_color, then loads the default color', async () => {
    const { client, upsert } = createFakeClient({
      row: { id: 'user-1', penguin_color: '#00bdff' },
    });

    const result = await ensurePlayer(client, { id: 'user-1', email: 'ada@example.com' });

    expect(upsert).toHaveBeenCalledWith(
      { id: 'user-1' },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    expect(result).toEqual({
      player: { id: 'user-1', displayName: 'ada@example.com', penguinColor: '#00bdff', penguin: null },
      error: null,
    });
  });

  it('surfaces an upsert error without attempting to load the row', async () => {
    const { client, select } = createFakeClient({ upsertError: { message: 'boom' } });

    const result = await ensurePlayer(client, { id: 'user-1', email: 'ada@example.com' });

    expect(result).toEqual({ player: null, error: 'boom' });
    expect(select).not.toHaveBeenCalled();
  });
});

describe('bindPlayer', () => {
  it('sets the player on the registry under the player key', () => {
    const registry: PlayerRegistry = { set: vi.fn(), remove: vi.fn() };
    const player = { id: 'user-1', displayName: 'Ada Lovelace', penguinColor: '#00bdff', penguin: null };

    bindPlayer(registry, player);

    expect(registry.set).toHaveBeenCalledWith('player', player);
    expect(registry.remove).not.toHaveBeenCalled();
  });

  it('removes the player from the registry when null', () => {
    const registry: PlayerRegistry = { set: vi.fn(), remove: vi.fn() };

    bindPlayer(registry, null);

    expect(registry.remove).toHaveBeenCalledWith('player');
    expect(registry.set).not.toHaveBeenCalled();
  });
});
