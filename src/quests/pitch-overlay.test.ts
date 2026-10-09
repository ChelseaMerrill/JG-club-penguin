// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressStoreError } from '../persistence/progress-store';
import { createOverlayManager, type OverlayManager } from '../ui/hud/overlay-manager';
import {
  createPitchOverlay,
  PITCH_FAST_LINE,
  PITCH_OVERLAY_ID,
  PITCH_SLOW_LINE,
  PITCH_TIMEOUT_LINE,
  type PitchOverlay,
} from './pitch-overlay';

let overlay: PitchOverlay | undefined;
let overlays: OverlayManager | undefined;

function setup(submitWith: (p: number, s: number, a: number) => Promise<{ seconds: number }>) {
  const root = document.createElement('div');
  document.body.append(root);
  overlays = createOverlayManager();
  const start = vi.fn(() => Promise.resolve());
  const submit = vi.fn(submitWith);
  overlay = createPitchOverlay(root, { overlays, start, submit });
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector(selector) as T;
  const button = (label: string) =>
    Array.from(root.querySelectorAll('button')).find((b) => b.textContent === label) as
      HTMLButtonElement | undefined;
  return { root, start, submit, q, button, overlays };
}

/** Picks the first choice in each of the three rows. */
function pickEveryRow(ctx: ReturnType<typeof setup>): void {
  const rows = ctx.root.querySelectorAll('.pitch-overlay__row');
  rows.forEach((row) => {
    row.querySelector<HTMLButtonElement>('.pitch-overlay__choice')!.click();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  overlay?.destroy();
  overlays?.destroy();
  overlay = undefined;
  overlays = undefined;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('createPitchOverlay', () => {
  it('opens in the overlay slot and starts a fresh attempt', async () => {
    const ctx = setup(() => Promise.resolve({ seconds: 5 }));

    overlay!.open();
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.q('.pitch-overlay').hidden).toBe(false);
    expect(ctx.overlays!.current()).toBe(PITCH_OVERLAY_ID);
    expect(ctx.start).toHaveBeenCalledTimes(1);
    expect(ctx.q('.pitch-overlay__countdown').textContent).toBe('01:00');
  });

  it('disables Submit until one choice per row is picked, then enables it', async () => {
    const ctx = setup(() => Promise.resolve({ seconds: 5 }));
    overlay!.open();
    await vi.advanceTimersByTimeAsync(0);

    const submitButton = ctx.button('SUBMIT')!;
    expect(submitButton.disabled).toBe(true);

    pickEveryRow(ctx);

    expect(submitButton.disabled).toBe(false);
  });

  it('counts down from 60 and shows the timeout reaction with Try again at 0:00', async () => {
    const ctx = setup(() => Promise.resolve({ seconds: 5 }));
    overlay!.open();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(ctx.q('.pitch-overlay__countdown').textContent).toBe('00:30');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(ctx.q('.pitch-overlay__result-line').textContent).toBe(PITCH_TIMEOUT_LINE);
    expect(ctx.button('TRY AGAIN')).not.toBeUndefined();

    ctx.button('TRY AGAIN')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.start).toHaveBeenCalledTimes(2);
    expect(ctx.q('.pitch-overlay__countdown').textContent).toBe('01:00');
  });

  it('a fast accepted pitch (under 20 s) shows "Closed. Sign here."', async () => {
    const ctx = setup(() => Promise.resolve({ seconds: 12 }));
    overlay!.open();
    await vi.advanceTimersByTimeAsync(0);
    pickEveryRow(ctx);

    ctx.button('SUBMIT')!.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.submit).toHaveBeenCalledWith(0, 0, 0);
    expect(ctx.q('.pitch-overlay__result-line').textContent).toBe(PITCH_FAST_LINE);
  });

  it('a slower accepted pitch (20 s or more) shows "Smile. It\'s working."', async () => {
    const ctx = setup(() => Promise.resolve({ seconds: 45 }));
    overlay!.open();
    await vi.advanceTimersByTimeAsync(0);
    pickEveryRow(ctx);

    ctx.button('SUBMIT')!.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.q('.pitch-overlay__result-line').textContent).toBe(PITCH_SLOW_LINE);
  });

  it('a server pitch_timeout on submit shows the same timeout reaction, with Try again', async () => {
    const ctx = setup(() => Promise.reject(new ProgressStoreError('pitch_timeout')));
    overlay!.open();
    await vi.advanceTimersByTimeAsync(0);
    pickEveryRow(ctx);

    ctx.button('SUBMIT')!.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.q('.pitch-overlay__result-line').textContent).toBe(PITCH_TIMEOUT_LINE);
    expect(ctx.button('TRY AGAIN')).not.toBeUndefined();
  });

  it('CANCEL and BACK TO THE ICEBOX close the overlay', async () => {
    const ctx = setup(() => Promise.resolve({ seconds: 5 }));
    overlay!.open();
    await vi.advanceTimersByTimeAsync(0);

    ctx.button('CANCEL')!.click();
    expect(ctx.q('.pitch-overlay').hidden).toBe(true);

    overlay!.open();
    await vi.advanceTimersByTimeAsync(0);
    pickEveryRow(ctx);
    ctx.button('SUBMIT')!.click();
    await vi.advanceTimersByTimeAsync(0);
    ctx.button('BACK TO THE ICEBOX')!.click();
    expect(ctx.q('.pitch-overlay').hidden).toBe(true);
  });
});
