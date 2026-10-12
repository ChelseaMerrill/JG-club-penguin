// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDoorFade,
  DOOR_FADE_FAILSAFE_MS,
  DOOR_FADE_MS,
  DOOR_FADE_OUT_WAIT_MS,
  type DoorFade,
} from './door-fade';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let root: HTMLElement;
let fade: DoorFade;

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('div');
  root.id = 'ui';
  document.body.append(root);
  fade = createDoorFade(root);
});

afterEach(() => {
  fade.destroy();
  root.remove();
  vi.useRealTimers();
});

function layer(): HTMLElement {
  return root.querySelector('.door-fade') as HTMLElement;
}

describe('createDoorFade (#170 D5)', () => {
  it('starts hidden and not blocking', () => {
    expect(fade.state()).toBe('hidden');
    expect(fade.isBlocking()).toBe(false);
    expect(layer().classList.contains('door-fade--on')).toBe(false);
  });

  it('out() covers the Stage at once, blocks pointer input, and resolves once opaque (260 ms)', async () => {
    const done = vi.fn();
    void fade.out().then(done);

    expect(layer().classList.contains('door-fade--on')).toBe(true);
    expect(fade.isBlocking()).toBe(true);
    expect(fade.state()).toBe('fading-out');
    await vi.advanceTimersByTimeAsync(DOOR_FADE_OUT_WAIT_MS - 1);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(fade.state()).toBe('opaque');
    expect(fade.isBlocking()).toBe(true);
  });

  it('takes pointer events only while up: the CSS gives door-fade--on pointer-events: auto (RT170-10)', () => {
    const css = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'door-ui.css'),
      'utf8',
    );
    const rules = new Map(
      Array.from(css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g), (m) => [
        m[1]!.trim(),
        m[2]!,
      ]),
    );
    const rule = (selector: string): string => rules.get(selector) ?? '';
    expect(rule('#ui > .door-fade')).toContain('pointer-events: none');
    expect(rule('#ui > .door-fade.door-fade--on')).toContain('pointer-events: auto');
    expect(rule('#ui > .door-fade.door-fade--on')).toContain('opacity: 1');
    expect(rule('.door-fade')).toContain('transition: opacity 250ms ease');
  });

  it('clear() stops blocking at once and fades back in over 250 ms', async () => {
    void fade.out();
    await vi.advanceTimersByTimeAsync(DOOR_FADE_OUT_WAIT_MS);
    fade.clear();
    expect(layer().classList.contains('door-fade--on')).toBe(false);
    expect(fade.isBlocking()).toBe(false);
    expect(fade.state()).toBe('fading-in');
    await vi.advanceTimersByTimeAsync(DOOR_FADE_MS);
    expect(fade.state()).toBe('hidden');
  });

  it('cancel() hides it at once, and the earlier out() still resolves without reviving it', async () => {
    const done = vi.fn();
    void fade.out().then(done);
    fade.cancel();
    expect(fade.state()).toBe('hidden');
    expect(fade.isBlocking()).toBe(false);
    await vi.advanceTimersByTimeAsync(DOOR_FADE_OUT_WAIT_MS);
    expect(done).toHaveBeenCalledTimes(1);
    expect(fade.state()).toBe('hidden');
  });

  it('takes itself down after the failsafe if nothing clears it (RT170-24)', async () => {
    void fade.out();
    await vi.advanceTimersByTimeAsync(DOOR_FADE_FAILSAFE_MS - 1);
    expect(fade.isBlocking()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(fade.state()).toBe('hidden');
  });

  it("an earlier fade's failsafe never takes down a later one", async () => {
    void fade.out();
    await vi.advanceTimersByTimeAsync(DOOR_FADE_FAILSAFE_MS / 2);
    fade.cancel();
    void fade.out();
    await vi.advanceTimersByTimeAsync(DOOR_FADE_FAILSAFE_MS / 2 + 10);
    expect(fade.isBlocking()).toBe(true);
  });

  it('clear() is a no-op while hidden', () => {
    fade.clear();
    expect(fade.state()).toBe('hidden');
  });
});
