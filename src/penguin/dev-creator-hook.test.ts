import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK } from '../contracts';
import { createInMemoryProgressStore } from '../persistence/in-memory-progress-store';
import { createLoadFailureStore } from './dev-creator-hook';

describe('createLoadFailureStore (#164)', () => {
  it('rejects loadAll for the first N calls, then passes through', async () => {
    const inner = createInMemoryProgressStore();
    const { store, counts } = createLoadFailureStore(inner, 2);

    await expect(store.loadAll()).rejects.toThrow('Injected load failure (test)');
    await expect(store.loadAll()).rejects.toThrow('Injected load failure (test)');
    await expect(store.loadAll()).resolves.toEqual(await inner.loadAll());

    expect(counts.loadAll).toBe(3);
  });

  it('passes saveLook through and counts it', async () => {
    const inner = createInMemoryProgressStore();
    const spy = vi.spyOn(inner, 'saveLook');
    const { store, counts } = createLoadFailureStore(inner, 1);
    const look = { ...DEFAULT_LOOK, name: 'Waddles' };

    await store.saveLook(look);

    expect(spy).toHaveBeenCalledWith(look);
    expect(counts.saveLook).toBe(1);
  });

  it('counts only calls made through the wrapper, never direct inner calls (RT B1)', async () => {
    const inner = createInMemoryProgressStore();
    const { counts } = createLoadFailureStore(inner, 1);

    await inner.saveLook({ ...DEFAULT_LOOK, name: 'Waddles' });
    await inner.loadAll();

    expect(counts).toEqual({ loadAll: 0, saveLook: 0 });
  });
});
