import { describe, expect, it } from 'vitest';
import {
  LOCAL_PENGUIN_VISIBLE_KEY,
  isLocalPenguinVisible,
  revealLocalPenguinAfter,
  setLocalPenguinVisible,
  stageAcceptsInput,
  type VisibilityRegistry,
} from './local-penguin-visibility';

function fakeRegistry(): VisibilityRegistry & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, value),
  };
}

describe('local Penguin visibility (#162)', () => {
  it('treats an absent key as visible, so the Stage accepts input', () => {
    const registry = fakeRegistry();
    expect(isLocalPenguinVisible(registry)).toBe(true);
    expect(stageAcceptsInput(registry)).toBe(true);
  });

  it('round-trips hidden and shown, and the input gate follows it', () => {
    const registry = fakeRegistry();
    setLocalPenguinVisible(registry, false);
    expect(registry.values.get(LOCAL_PENGUIN_VISIBLE_KEY)).toBe(false);
    expect(isLocalPenguinVisible(registry)).toBe(false);
    expect(stageAcceptsInput(registry)).toBe(false);

    setLocalPenguinVisible(registry, true);
    expect(isLocalPenguinVisible(registry)).toBe(true);
    expect(stageAcceptsInput(registry)).toBe(true);
  });

  describe('revealLocalPenguinAfter', () => {
    it('shows the Penguin once the entry resolves, while still current', async () => {
      const registry = fakeRegistry();
      setLocalPenguinVisible(registry, false);
      let finish!: () => void;
      const entered = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const reveal = revealLocalPenguinAfter(entered, () => true, registry);
      await Promise.resolve();
      expect(isLocalPenguinVisible(registry)).toBe(false);
      finish();
      await reveal;
      expect(isLocalPenguinVisible(registry)).toBe(true);
      expect(stageAcceptsInput(registry)).toBe(true);
    });

    it('stays hidden when a newer sign-in or a sign-out superseded it', async () => {
      const registry = fakeRegistry();
      setLocalPenguinVisible(registry, false);
      await revealLocalPenguinAfter(Promise.resolve(), () => false, registry);
      expect(isLocalPenguinVisible(registry)).toBe(false);
      expect(stageAcceptsInput(registry)).toBe(false);
    });

    it('still shows it on a rejection, and passes the rejection on', async () => {
      const registry = fakeRegistry();
      setLocalPenguinVisible(registry, false);
      const failure = new Error('enter failed');
      await expect(
        revealLocalPenguinAfter(Promise.reject(failure), () => true, registry),
      ).rejects.toBe(failure);
      expect(isLocalPenguinVisible(registry)).toBe(true);
    });

    it('shows it on the next microtask when there was no entry to wait for', async () => {
      const registry = fakeRegistry();
      setLocalPenguinVisible(registry, false);
      const reveal = revealLocalPenguinAfter(undefined, () => true, registry);
      expect(isLocalPenguinVisible(registry)).toBe(false);
      await reveal;
      expect(isLocalPenguinVisible(registry)).toBe(true);
    });
  });
});
