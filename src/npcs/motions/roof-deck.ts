import type { CssAnimationSource } from '../../game/npcs/css-keyframes';
import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Roof Deck's NPC motions (#113), copied verbatim from `design/Room 05
 * Roof Deck.dc.html`'s `<style>` block and each NPC's `animation:` style.
 *
 * Left out, because they don't belong to an NPC: `hop` (the Hexles
 * bouncing on Kevin's counter, and the Hexle pet following the design's
 * sample "You" Penguin), `mkYou` (that sample Player Penguin), `idle` (the
 * vendors' bob, which #36's own idle bob already covers), `say` (#36's
 * bubbles) and `blink` (the HUD/door arrow). Also left out: `mkTristin`,
 * since Tristin is a Penguin in the design and so isn't placed (#133: only
 * Players appear as Penguins), and `mkAnthony` with his casting rod: #146
 * took Anthony off the Roof Deck to stand still at the door he guards (his
 * figure keeps its static `fishingRod` prop). Brandon's gallop and Millie's
 * walk went with them: they left the Market (owner request, 2026-10-02,
 * Track D).
 *
 * Bich Dudla's and Eva Trimboli's walks are authored, not from a design
 * (owner request, 2026-10-02, Track D); each figure bobs at its Characters
 * card's own pace (`bob`, translateY(-5px) on the card's 176 px-wide render,
 * so 5 / (176 / 120) = 3.41 figure units here, as the Dev Pit's new people).
 */

/** One stop on a walk: Stage px from the NPC's slot point, and how long it stands there. */
export interface WalkStop {
  x: number;
  y: number;
  holdS?: number;
}

/** A walk's `path` animation, and the share of its loop (0-100) spent standing at each held stop. */
export interface Walk {
  path: CssAnimationSource;
  periodS: number;
  holds: readonly (readonly [number, number])[];
}

const pct = (value: number): string => `${+value.toFixed(2)}%`;
const px = (value: number): string => `${+value.toFixed(2)}px`;

/**
 * A walk from the slot point (stop 0, `{ x: 0, y: 0 }`) through `stops` and
 * back, at `speed` Stage px per second, standing `holdS` at each stop: its
 * `translate()` keyframes, timed by each leg's length.
 */
export function walk(name: string, stops: readonly WalkStop[], speed: number): Walk {
  const route = [...stops, stops[0]!];
  const marks: { at: number; leave: number; stop: WalkStop }[] = [];
  let t = 0;
  route.forEach((stop, index) => {
    if (index > 0) {
      const prev = route[index - 1]!;
      t += Math.hypot(stop.x - prev.x, stop.y - prev.y) / speed;
    }
    const last = index === route.length - 1;
    marks.push({ at: t, leave: last ? t : t + (stop.holdS ?? 0), stop });
    t = marks[marks.length - 1]!.leave;
  });
  const periodS = t;
  const frames = marks.map(({ at, leave, stop }) => {
    const times =
      leave > at ? `${pct((at / t) * 100)},${pct((leave / t) * 100)}` : pct((at / t) * 100);
    return `${times} { transform: translate(${px(stop.x)},${px(stop.y)});}`;
  });
  const holds = marks
    .filter(({ at, leave }) => leave > at)
    .map(({ at, leave }) => [(at / t) * 100, (leave / t) * 100] as const);
  return {
    path: {
      keyframes: `@keyframes ${name} { ${frames.join(' ')} }`,
      animation: `${name} ${+periodS.toFixed(2)}s ease-in-out infinite`,
    },
    periodS,
    holds,
  };
}

/**
 * A pose held only while the walker stands at a held stop, eased in and out
 * over `easeS` at each end: keyframes on the walk's own clock (`pathClock`).
 */
function heldPose(
  name: string,
  walked: Walk,
  easeS: number,
  rest: string,
  held: string,
): CssAnimationSource {
  const ease = (easeS / walked.periodS) * 100;
  const frames = [`0% { ${rest} }`];
  for (const [from, to] of walked.holds) {
    if (to - from < ease * 2) continue;
    frames.push(`${pct(from)} { ${rest} }`, `${pct(from + ease)},${pct(to - ease)} { ${held} }`);
    frames.push(`${pct(to)} { ${rest} }`);
  }
  frames.push(`100% { ${rest} }`);
  return {
    keyframes: `@keyframes ${name} { ${frames.join(' ')} }`,
    animation: `${name} ${+walked.periodS.toFixed(2)}s linear infinite`,
  };
}

/** Stage px between two tiles' points (`tileToScreen`, 100 x 50 tiles). */
const tileDelta = (dCol: number, dRow: number): { x: number; y: number } => ({
  x: (dCol - dRow) * 50,
  y: (dCol + dRow) * 25,
});

/**
 * Where Bich stands to water a plant, from that plant's own tile point: at
 * its right, level with it, so the can's raised spout (figure (5, 85), drawn
 * at 0.62) is right over its pot and the water falls into the soil. 34 px to
 * the right also sorts her in front of the plant.
 */
export const BICH_WATERING_OFFSET = { x: 34, y: 0 } as const;

/** Bich's home (her slot tile): her walk's every stop is relative to it. */
const BICH_HOME = { col: 2, row: 5 } as const;

/**
 * Bich's route, as tiles: the walkable tiles she turns at, and the four
 * left-hand plants she stops beside (`plant`), in order.
 */
export const BICH_ROUTE: readonly { col: number; row: number; plant?: true }[] = [
  BICH_HOME,
  { col: 2, row: 2 },
  { col: 1, row: 2 },
  { col: 0, row: 2, plant: true },
  { col: 3, row: 2 },
  { col: 3, row: 3, plant: true },
  { col: 4, row: 3 },
  { col: 4, row: 6 },
  { col: 2, row: 6 },
  { col: 2, row: 7 },
  { col: 1, row: 7, plant: true },
  { col: 3, row: 8 },
  { col: 3, row: 9, plant: true },
  { col: 3, row: 6 },
  { col: 2, row: 6 },
];

const BICH_WALK = walk(
  'bichRounds',
  BICH_ROUTE.map((tile) => {
    const point = tileDelta(tile.col - BICH_HOME.col, tile.row - BICH_HOME.row);
    return tile.plant
      ? { x: point.x + BICH_WATERING_OFFSET.x, y: point.y + BICH_WATERING_OFFSET.y, holdS: 4 }
      : point;
  }),
  40,
);

/** Eva's home (her slot tile). */
const EVA_HOME = { col: 6, row: 6 } as const;

/** Eva's loop round the middle and right of the deck, as the walkable tiles she turns at. */
export const EVA_ROUTE: readonly { col: number; row: number }[] = [
  EVA_HOME,
  { col: 10, row: 6 },
  { col: 10, row: 7 },
  { col: 8, row: 7 },
  { col: 8, row: 8 },
  { col: 5, row: 8 },
  { col: 5, row: 4 },
  { col: 6, row: 4 },
];

const EVA_WALK = walk(
  'evaLoop',
  EVA_ROUTE.map((tile) => ({
    ...tileDelta(tile.col - EVA_HOME.col, tile.row - EVA_HOME.row),
    holdS: 0.6,
  })),
  45,
);

/**
 * Bich's watering can, verbatim from her card (with the hand her card draws
 * over its handle). While she stands at a plant she lifts it and tips it
 * forward to pour, about her hand.
 */
const BICH_CAN =
  '<path d="M24 92 h16 v14 q-8 4 -16 0 Z" fill="#00BDFF" stroke="#0C4B5F" stroke-width="2"/><path d="M40 96 q7 0 6 8" fill="none" stroke="#0C4B5F" stroke-width="2.4"/><path d="M24 96 L12 86 L10 89 L22 100" fill="#00BDFF" stroke="#0C4B5F" stroke-width="2" stroke-linejoin="round"/><ellipse cx="11" cy="87.5" rx="2.5" ry="3.2" fill="#0C4B5F" transform="rotate(-40 11 87.5)"/><circle cx="30" cy="101" r="5.5" fill="#E4B896" stroke="#0C4B5F" stroke-width="2"/>';

/**
 * Her card's four water drops, placed under the spout as it pours (the
 * can's tipped, lifted pose puts the spout's tip at (5, 85)), each the same
 * distance from the tip as on the card.
 */
const BICH_DROPS =
  '<path d="M3 88 v3 M1 93 v3 M5 94 v3 M2 98 v2" stroke="#00BDFF" stroke-width="1.6" stroke-linecap="round"/>';

export const ROOF_DECK_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Bich Dudla ("I test the code. I water the plant. Both keep growing.")
  // walks round the Market's four left-hand potted plants, (0,2), (3,3),
  // (1,7) and (3,9), over walkable tiles (`BICH_ROUTE`), and waters each:
  // she stands at its right for 4 s, lifts her can and tips it, and its
  // water falls into the pot.
  'bich-dudla': {
    path: BICH_WALK.path,
    figure: {
      keyframes:
        '@keyframes bobBich { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3.41px);} }',
      animation: 'bobBich 2.3s ease-in-out infinite',
    },
    props: [
      {
        svg: BICH_CAN,
        pathClock: true,
        motion: {
          ...heldPose(
            'bichPour',
            BICH_WALK,
            0.4,
            'transform: translate(0,0) rotate(0deg);',
            'transform: translate(-2px,-12px) rotate(-25deg);',
          ),
          transformOrigin: '30px 101px',
        },
      },
      {
        svg: '',
        pathClock: true,
        motion: heldPose('bichWater', BICH_WALK, 0.6, 'opacity:0;', 'opacity:1;'),
        children: [
          {
            svg: BICH_DROPS,
            motion: {
              keyframes:
                '@keyframes bichDrip { 0% { opacity:1; transform: translateY(0);} 100% { opacity:.2; transform: translateY(4px);} }',
              animation: 'bichDrip .5s linear infinite',
            },
          },
        ],
      },
    ],
  },
  // Eva Trimboli ("It's not a bug until I say it's a bug.") walks a loop
  // round the middle and right of the deck (`EVA_ROUTE`), clear of the
  // counters, the plants and everyone's slot, pausing at each corner.
  'eva-trimboli': {
    path: EVA_WALK.path,
    figure: {
      keyframes:
        '@keyframes bobEva { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3.41px);} }',
      animation: 'bobEva 2.4s ease-in-out infinite',
    },
  },
};
