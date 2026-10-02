import {
  compileCssAnimation,
  sampleCssAnimation,
  sampleCssOpacity,
  type CompiledCssAnimation,
} from '../npcs/css-keyframes';
import type { ScreenPoint } from './iso';

/**
 * The pet fish in Town Center's desk tank (owner request, 2026-10-02, Track
 * D: "a purple beta fish ... called ghostfish killa"), the Phaser-free half:
 * its look, its swim and its "feed me" bubble timing. `room-tank-fish.ts`
 * draws it. A Room decoration, not an NPC: it has no slot, dialog or click.
 *
 * Everything but the name and colours is `design/Room 01 Town
 * Center.dc.html`'s own betta (named Gil there): its fish markup, its `swim`
 * path round the tank (7 s), its "Gil · betta" nameplate and its `feedMe`
 * bubble (9 s), all verbatim.
 */
export interface TankFish {
  /** Shown on its nameplate, as "<name> · betta". */
  name: string;
  /** Body colour (the design's betta is `#00BDFF`). */
  body: string;
  /** Fin and tail colour (the design's are `#F4F4F4`). */
  fins: string;
}

/**
 * The design's `swim`, without its `skewY(26.57deg)` (which keeps the fish
 * flat against the tank's isometric front glass; the engine has no skew, so
 * the textures carry it, see `tankFishSvg`): Stage translates, and a
 * `scaleX` that turns him round at each end of the tank.
 */
const SWIM = compileCssAnimation({
  keyframes:
    '@keyframes swim { 0% { transform: translate(1195px,419.5px) scaleX(1);} 40% { transform: translate(1232px,432px) scaleX(1);} 50% { transform: translate(1236px,428px) scaleX(-1);} 90% { transform: translate(1178px,406px) scaleX(-1);} 100% { transform: translate(1195px,419.5px) scaleX(1);} }',
  animation: 'swim 7s ease-in-out infinite',
});

/** The design's `feedMe`: shown 60%-85% of 9 s, fading in from 55% and out by 90%. */
const FEED_ME: CompiledCssAnimation = compileCssAnimation({
  keyframes:
    '@keyframes feedMe { 0%,55% { opacity:0;} 60%,85% { opacity:1;} 90%,100% { opacity:0;} }',
  animation: 'feedMe 9s ease-in-out infinite',
});

/** The design's skew: the tank's front glass rises 1 px for every 2 across. */
const SKEW_DEG = 26.57;

/** Where the fish is, and which way it faces, `elapsedMs` into its swim. */
export interface TankFishPose {
  point: ScreenPoint;
  /** 1 facing right, -1 facing left, in between while it turns. */
  facing: number;
}

export function sampleTankFish(elapsedMs: number): TankFishPose {
  const m = sampleCssAnimation(SWIM, elapsedMs);
  // Only translate and scaleX: `a` is the signed horizontal scale.
  return { point: { x: m.e, y: m.f }, facing: m.a };
}

/** How visible the "feed me" bubble is, `elapsedMs` in (0-1). */
export function feedMeAlpha(elapsedMs: number): number {
  return sampleCssOpacity(FEED_ME, elapsedMs);
}

/** The design's nameplate under the tank: its centre, and its 16 px pill's top. */
export const TANK_FISH_NAMEPLATE = { x: 1192.5, y: 448.25, height: 16 } as const;

/** The design's "feed me" bubble: its two thought dots and its pill. */
export const TANK_FISH_FEED_ME = {
  dots: [
    { x: 1228, y: 372, r: 3 },
    { x: 1236, y: 362, r: 4.5 },
  ],
  pill: { x: 1236, y: 326, width: 64, height: 26, radius: 13 },
  text: 'feed me',
} as const;

/** Each texture's viewBox, centred on the fish's own origin (the swim's translate point). */
export const TANK_FISH_VIEWBOX = { size: 72 } as const;

/**
 * The design's betta markup, verbatim apart from `fish`'s colours, inside a
 * group carrying the design's skew and the given facing (`skewY(26.57deg)
 * scaleX(±1)`, the same order the design composes them in), in a square
 * viewBox centred on its origin.
 */
export function tankFishSvg(fish: TankFish, facing: 1 | -1): string {
  const half = TANK_FISH_VIEWBOX.size / 2;
  const scale = 2;
  const size = TANK_FISH_VIEWBOX.size * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${TANK_FISH_VIEWBOX.size} ${TANK_FISH_VIEWBOX.size}" width="${size}" height="${size}">` +
    `<g transform="skewY(${SKEW_DEG}) scale(${facing} 1)">` +
    `<path d="M-2 0 q-12 -16 -30 -10 q6 10 0 20 q18 6 30 -10 z" fill="${fish.fins}" opacity=".9"/>` +
    `<path d="M-4 -3 q-6 -14 -20 -14 q10 8 12 16 z" fill="${fish.fins}" opacity=".8"/>` +
    `<path d="M-4 3 q-6 14 -20 14 q10 -8 12 -16 z" fill="${fish.fins}" opacity=".8"/>` +
    `<ellipse cx="4" cy="0" rx="12" ry="6.5" fill="${fish.body}" stroke="#0C4B5F" stroke-width="1.5"/>` +
    '<circle cx="11" cy="-1.5" r="1.6" fill="#161719"/>' +
    '<path d="M2 -6 q4 -6 8 -2" stroke="#F4F4F4" stroke-width="2" fill="none"/>' +
    '</g></svg>'
  );
}
