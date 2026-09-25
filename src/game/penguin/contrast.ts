import { ACCENT, EYE_PUPIL, EYE_WHITE, STROKE } from './palette';

/**
 * WCAG 1.4.11 non-text contrast threshold (#79 D1). Every rule in
 * `resolvePenguinColors` (`render-svg.ts`) fixes a part when its ratio
 * against the surface it sits on falls below this.
 */
export const MIN_CONTRAST = 3;

/** Splits a `#rrggbb` hex string (either case) into its 0-255 channels. */
function hexToChannels(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** Encodes 0-255 channels (rounded, clamped) back to a `#rrggbb` string. */
function channelsToHex(r: number, g: number, b: number): string {
  const toByte = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

/** WCAG 2.x sRGB -> linear-light channel transform, 0.03928 threshold. */
function linearize(channel8Bit: number): number {
  const c = channel8Bit / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG 2.x relative luminance of a `#rrggbb` colour, 0 (black) to 1 (white).
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToChannels(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG 2.x contrast ratio between two `#rrggbb` colours, from 1 (identical)
 * to 21 (black vs white). Symmetric: order doesn't matter.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Whether `color` reaches `MIN_CONTRAST` against every surface in
 * `surfaces`. The single helper every #79 rule (and `pickContrasting`
 * itself) uses to decide whether a part needs fixing -- exported so
 * `resolvePenguinColors` doesn't keep its own duplicate (#79 review round 1
 * nit 6).
 */
export function reachesMinContrast(color: string, surfaces: readonly string[]): boolean {
  return surfaces.every((surface) => contrastRatio(color, surface) >= MIN_CONTRAST);
}

/**
 * Returns `preferred` when it reaches `MIN_CONTRAST` against every surface
 * in `surfaces`. Otherwise returns the first `candidates` entry, in order,
 * that does. If none does, returns the candidate with the best worst-case
 * (highest minimum-across-surfaces) ratio (#79 D1).
 */
export function pickContrasting(
  preferred: string,
  surfaces: readonly string[],
  candidates: readonly string[] = [STROKE, ACCENT, EYE_WHITE, EYE_PUPIL],
): string {
  if (reachesMinContrast(preferred, surfaces)) return preferred;

  for (const candidate of candidates) {
    if (reachesMinContrast(candidate, surfaces)) return candidate;
  }

  const worstCase = (color: string): number =>
    Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));

  return candidates.reduce((best, candidate) =>
    worstCase(candidate) > worstCase(best) ? candidate : best,
  );
}

/**
 * Standard sRGB-space alpha compositing of `fg` over `bg` at `alpha`
 * (0-1) -- the same maths a browser uses to paint an SVG element with
 * `opacity` over whatever sits behind it. Used to check the *on-screen*
 * colour of a part painted at reduced opacity, not its raw attribute value
 * (#79 review round 1 nit 1: the HEX/STRIPES belly pattern is drawn at
 * `opacity=".55"`, so its drawn colour is this blend, not the ink itself).
 */
export function blend(fg: string, bg: string, alpha: number): string {
  const [fr, fg2, fb] = hexToChannels(fg);
  const [br, bg2, bb] = hexToChannels(bg);
  return channelsToHex(
    fr * alpha + br * (1 - alpha),
    fg2 * alpha + bg2 * (1 - alpha),
    fb * alpha + bb * (1 - alpha),
  );
}

/**
 * Like `pickContrasting`, but for a colour that will be painted at `alpha`
 * opacity over a single `surface`: the pass/fail check uses the *blended*,
 * on-screen colour (`blend(candidate, surface, alpha)`) against `surface`,
 * but the function returns the unblended candidate itself, so the caller
 * still paints the raw colour at `alpha` and lets the renderer's own
 * compositing reproduce the checked blend (#79 review round 1 nit 1).
 */
export function pickContrastingOverlay(
  preferred: string,
  surface: string,
  alpha: number,
  candidates: readonly string[] = [STROKE, ACCENT, EYE_WHITE, EYE_PUPIL],
): string {
  const passes = (color: string): boolean =>
    contrastRatio(blend(color, surface, alpha), surface) >= MIN_CONTRAST;

  if (passes(preferred)) return preferred;

  for (const candidate of candidates) {
    if (passes(candidate)) return candidate;
  }

  const worstCase = (color: string): number => contrastRatio(blend(color, surface, alpha), surface);

  return candidates.reduce((best, candidate) =>
    worstCase(candidate) > worstCase(best) ? candidate : best,
  );
}
