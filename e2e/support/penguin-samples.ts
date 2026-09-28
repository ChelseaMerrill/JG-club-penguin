/**
 * #162 V4: the own-Penguin frame sampler and the pure check behind assertion S.
 * The sampler runs in the page; `assertionSFailures` runs in Node on the
 * recorded samples and returns every failed rule (empty means S passed).
 */
import './room-debug-types';

export interface PenguinSample {
  t: number;
  visible: boolean;
  lookName: string;
  lookBody: string;
  textureKey?: string;
  /** Whether `#ui .landing` covers the Stage on this frame. */
  landingVisible: boolean;
}

declare global {
  interface Window {
    __penguinSamples?: PenguinSample[];
    __penguinSamplerInstalled?: boolean;
  }
}

/**
 * Records one sample per animation frame, only once the local Penguin exists.
 * Safe to run more than once per document (a window flag guards it), and
 * `window.__penguinSamples = []` clears it, because each frame looks the
 * array up afresh.
 */
export function penguinSampler(): void {
  if (window.__penguinSamplerInstalled) return;
  window.__penguinSamplerInstalled = true;
  window.__penguinSamples = [];
  const tick = (): void => {
    const own = window.__roomDebug?.localPenguin;
    if (own) {
      const landing = document.querySelector('#ui .landing');
      (window.__penguinSamples ??= []).push({
        t: performance.now(),
        visible: own.visible ?? true,
        lookName: own.lookName,
        lookBody: own.lookBody,
        textureKey: own.textureKey,
        landingVisible: landing !== null && landing.getClientRects().length > 0,
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export interface SampleLook {
  name: string;
  body: string;
}

export interface ExpectedLook extends SampleLook {
  /** `penguin:${penguinLookHash(look)}:` */
  texturePrefix: string;
}

/**
 * What is legitimately on screen between an in-page sign-in's broadcast and
 * `onSignedIn`'s hide: the signed-out Penguin under the Landing page (test 2),
 * or the previous Player's look while their Session is live (test 3).
 */
export type PriorState = { kind: 'landing' } | { kind: 'look'; look: SampleLook };

export interface AssertionSOptions {
  /** Set for an in-page sign-in: S's window starts at the first hidden sample. */
  prior?: PriorState;
  /** A look that must never be visible inside S's window. */
  forbidden?: SampleLook;
}

const sameLook = (s: PenguinSample, look: SampleLook): boolean =>
  s.lookName === look.name && s.lookBody === look.body;

/**
 * Assertion S. Without `prior`, the window is every sample. With it, the
 * window starts at the first `visible === false` sample, and every sample
 * before that must be the prior state. Inside the window: a hidden sample
 * before the first visible one, every visible sample is `expected` (look and
 * texture), at least five visible samples after the first, the final sample
 * visible, and `forbidden` never visible.
 */
export function assertionSFailures(
  samples: PenguinSample[],
  expected: ExpectedLook,
  options: AssertionSOptions = {},
): string[] {
  const failures: string[] = [];
  let span = samples;
  if (options.prior) {
    const start = samples.findIndex((s) => !s.visible);
    if (start === -1) return ['no hidden sample after the sign-in broadcast'];
    const before = samples.slice(0, start);
    if (before.length === 0) failures.push('no sample before the hide (sampler not running?)');
    const prior = options.prior;
    before.forEach((s, i) => {
      if (prior.kind === 'landing' && !s.landingVisible)
        failures.push(`prior sample ${i}: the Landing page doesn't cover the Stage`);
      if (prior.kind === 'look' && !sameLook(s, prior.look))
        failures.push(`prior sample ${i}: not the previous Player's look`);
    });
    span = samples.slice(start);
  }

  const firstVisible = span.findIndex((s) => s.visible);
  if (firstVisible === -1) return [...failures, 'no visible sample'];
  if (!span.slice(0, firstVisible).some((s) => !s.visible))
    failures.push('no hidden sample before the first visible one');
  const visible = span.filter((s) => s.visible);
  if (visible.length - 1 < 5)
    failures.push(`only ${visible.length - 1} visible samples after the first (need 5)`);
  if (!span[span.length - 1].visible) failures.push('the final sample is hidden');
  span.forEach((s, i) => {
    if (!s.visible) return;
    if (!sameLook(s, expected)) failures.push(`window sample ${i}: not the saved look`);
    const key = s.textureKey ?? '__DEFAULT';
    if (key !== '__DEFAULT' && !key.startsWith(expected.texturePrefix))
      failures.push(`window sample ${i}: texture ${key}`);
    if (options.forbidden && sameLook(s, options.forbidden))
      failures.push(`window sample ${i}: the forbidden look`);
  });
  if (failures.length <= 20) return failures;
  return [...failures.slice(0, 20), `...and ${failures.length - 20} more`];
}
