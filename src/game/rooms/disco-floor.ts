import type { HexColor } from '../../contracts';
import type { StagePoint } from './room-definition';

/**
 * One tile of a Room's animated dance floor (owner request, 2026-10-09: "the
 * dance-floor tiles cycle colours like the design"). Traced verbatim from a
 * design's own `<polygon points="..." fill="..." stroke="#0E1013"
 * stroke-width="1"><animate attributeName="fill" values="c0;c1;c2;c0"
 * dur="3.2s" begin="..."/></polygon>` (the LATAM Disco Hall's 48 tiles --
 * `scripts/latam-disco-floor.ts` generates
 * `definitions/latam-disco-hall-floor.ts` from these, never by hand):
 *
 * - `points`: the polygon's own corners, in Stage px. The design's SVG
 *   coordinates map 1:1 onto the 1600x900 Stage -- the same assumption
 *   `RoomScene.drawBackground` makes drawing the exported PNG at full size
 *   from `(0, 0)` -- so these need no conversion.
 * - `colours`: the design's own `values` list, verbatim (4 stops; SMIL loops
 *   a `fill` animation back to its first value, so the last always equals
 *   the first).
 * - `durationMs`/`beginMs`: the design's own `dur`/`begin`, in milliseconds
 *   (`begin` is usually negative: the design's own per-tile stagger, so every
 *   tile is already mid-cycle at `t = 0`).
 */
export interface DiscoFloorTile {
  points: readonly StagePoint[];
  colours: readonly [HexColor, HexColor, HexColor, HexColor];
  durationMs: number;
  beginMs: number;
}

/** Splits a `#rrggbb` colour (either case) into its 0-255 channels. */
function hexToChannels(hex: HexColor): [number, number, number] {
  const clean = hex.slice(1);
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

/** Encodes 0-255 channels (rounded, clamped) back to a lower-case `#rrggbb` colour. */
function channelsToHex(r: number, g: number, b: number): HexColor {
  const toByte = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}` as HexColor;
}

/** Linear RGB blend between two `#rrggbb` colours -- SMIL's own default `calcMode="linear"` for a `fill` `<animate>`. */
function lerpColour(from: HexColor, to: HexColor, t: number): HexColor {
  const [fr, fg, fb] = hexToChannels(from);
  const [tr, tg, tb] = hexToChannels(to);
  return channelsToHex(fr + (tr - fr) * t, fg + (tg - fg) * t, fb + (tb - fb) * t);
}

/**
 * `tile`'s own fill colour `elapsedMs` after the Room opened, replicating
 * SMIL's own semantics for an `<animate>` whose `values` list sets neither
 * `keyTimes` nor `calcMode` (the design sets neither, so the browser spaces
 * every stop evenly and interpolates linearly): `durationMs` splits into
 * `colours.length - 1` equal segments, looping forever from `beginMs`
 * (usually negative -- the design's own stagger), with the phase wrapped the
 * way SMIL's own clock wraps a negative `begin` (`((t - begin) mod dur + dur)
 * mod dur`, never negative).
 */
export function discoTileColourAt(tile: DiscoFloorTile, elapsedMs: number): HexColor {
  const { colours, durationMs, beginMs } = tile;
  const cycleMs = (((elapsedMs - beginMs) % durationMs) + durationMs) % durationMs;
  const phase = cycleMs / durationMs;
  const segments = colours.length - 1;
  const scaled = phase * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  const t = scaled - index;
  return lerpColour(colours[index], colours[index + 1], t);
}
