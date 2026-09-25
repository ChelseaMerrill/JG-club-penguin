import { ACCENT, EYE_PUPIL, EYE_WHITE, STROKE } from './palette';

/**
 * WCAG 1.4.11 non-text contrast threshold (#79 D1). Every rule in
 * `resolvePenguinColors` (`colors.ts`) fixes a part when its ratio against
 * the surface it sits on falls below this.
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

function reachesMinContrastAgainstAll(color: string, surfaces: readonly string[]): boolean {
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
  if (reachesMinContrastAgainstAll(preferred, surfaces)) return preferred;

  for (const candidate of candidates) {
    if (reachesMinContrastAgainstAll(candidate, surfaces)) return candidate;
  }

  const worstCase = (color: string): number =>
    Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));

  return candidates.reduce((best, candidate) =>
    worstCase(candidate) > worstCase(best) ? candidate : best,
  );
}
