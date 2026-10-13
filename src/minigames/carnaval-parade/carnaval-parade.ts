import type { Minigame, MinigameContext, MinigameDoneSummary } from '../minigame';
import {
  createCarnavalParadeEngine,
  LANE_Y,
  paradeSpeed,
  TICK_MS,
  type CarnavalParadeEngine,
  type CarnavalParadeItem,
  type ItemKind,
  type Lane,
} from './carnaval-parade-engine';
import './carnaval-parade.css';

/** The design's own `DUR = 45000`. */
export const CARNAVAL_PARADE_DURATION_SEC = 45;

const TRACK_TOP_Y = LANE_Y[0];
const TRACK_BOTTOM_Y = LANE_Y[2];
const TRACK_HEIGHT = TRACK_BOTTOM_Y - TRACK_TOP_Y;

export interface CarnavalParadeOptions {
  /** Test-only: a pre-built engine instead of a fresh `createCarnavalParadeEngine()`. */
  engine?: CarnavalParadeEngine;
}

/** Test-only hooks `dev-minigame-hook.ts` drives from `window.__minigameTest`
 *  (`?minigame=carnaval-parade`), the same shape as the other games'. Not
 *  part of the `Minigame` interface. */
export interface CarnavalParadeTestHooks {
  /** Ends the round now, as if the shell's timer reached 0. */
  debugFinishNow(): void;
}

type ResultTier = 'passista' | 'foliao' | 'aprendiz';

/** The design's own result titles (score >= 400 / >= 200 / else). */
const RESULT_TITLES: Record<ResultTier, string> = {
  passista: 'PASSISTA',
  foliao: 'FOLIÃO',
  aprendiz: 'APRENDIZ',
};

/** Hector's result-screen lines, verbatim from the design's "Mestre de
 *  Bateria:" lines with his name in place of that title (owner decision). */
const RESULT_QUOTES: Record<ResultTier, string> = {
  passista: 'Hector: "Que desfile! The whole avenue is on its feet."',
  foliao: 'Hector: "Boa. You kept the rhythm. Go again for 400."',
  aprendiz: 'Hector: "Devagar. Watch the barriers and try again."',
};

function resultTier(score: number): ResultTier {
  if (score >= 400) return 'passista';
  if (score >= 200) return 'foliao';
  return 'aprendiz';
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function topPercentForY(y: number): number {
  return ((y - TRACK_TOP_Y) / TRACK_HEIGHT) * 100;
}

function topPercentForLane(lane: Lane): number {
  return topPercentForY(LANE_Y[lane]);
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

// Pickup/barrier art, verbatim from `design/Minigame Carnaval Parade.dc.html`'s
// own `FEATHER`/`STAR`/`BAR`/`BARBS` path constants and the per-kind `d`/`f`/
// `q`/`b`/`h` fields its `renderVals()` builds from them.
const FEATHER_PATH = 'M0 -30 C20 -18 20 14 0 30 C-20 14 -20 -18 0 -30 Z';
const STAR_PATH = 'M0 -22 L6 -7 L22 -6 L10 4 L14 20 L0 11 L-14 20 L-10 4 L-22 -6 L-6 -7 Z';
const BARRIER_PATH =
  'M34.0 0.0 L15.7 6.5 L24.0 24.0 L6.5 15.7 L0.0 34.0 L-6.5 15.7 L-24.0 24.0 L-15.7 6.5 L-34.0 0.0 L-15.7 -6.5 L-24.0 -24.0 L-6.5 -15.7 L-0.0 -34.0 L6.5 -15.7 L24.0 -24.0 L15.7 -6.5 Z';
const FEATHER_BARBS_PATH =
  'M0 -20 L-6.8 -27 M0 -20 L6.8 -27 M0 -14 L-8.4 -21 M0 -14 L8.4 -21 M0 -8 L-9.9 -15 M0 -8 L9.9 -15 M0 -2 L-11.5 -9 M0 -2 L11.5 -9 M0 4 L-11 -3 M0 4 L11.0 -3 M0 10 L-9.4 3 M0 10 L9.4 3 M0 16 L-7.8 9 M0 16 L7.8 9 M0 22 L-6.3 15 M0 22 L6.3 15';
const FEATHER_SHAFT_PATH = 'M0 -26 V26';
const FEATHER_HIGHLIGHT_PATH = 'M0 -28 C9 -16 9 -4 0 4 C-3 -6 -3 -18 0 -28 Z';
const BARRIER_HOLE_PATH = 'M-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0';
const BARRIER_TICKS_PATH = 'M-14 -16 L-6 -22 M-18 -4 L-12 -10';

/** The design's own cosmetic feather palette (`renderVals`'s own array),
 *  picked by `Math.floor(i.id*6)%6` there -- a rendering concern the engine
 *  deliberately doesn't reproduce (see `carnaval-parade-engine.ts`'s header
 *  comment), so this picks by the engine's own stable item id instead. */
const FEATHER_COLORS = ['#00BDFF', '#FF3DA5', '#FFD23F', '#3DDC84', '#7B4DFF', '#FF7A1A'] as const;

/** One item's inner SVG (everything inside its `<g>`), by kind. */
function itemInnerSvg(kind: ItemKind, id: number): string {
  if (kind === 'star') {
    return `<path d="${STAR_PATH}" fill="#FFD23F" stroke="#161719" stroke-width="3" stroke-linejoin="round"></path>`;
  }
  if (kind === 'barrier') {
    return (
      `<path d="${BARRIER_PATH}" fill="#8A8F96" stroke="#161719" stroke-width="3" stroke-linejoin="round"></path>` +
      `<path d="${BARRIER_HOLE_PATH}" fill="none" stroke="#161719" stroke-width="1.6" stroke-linecap="round" opacity=".55"></path>` +
      `<path d="${BARRIER_TICKS_PATH}" fill="none" stroke="#F4F4F4" stroke-width="2.2" stroke-linecap="round" opacity=".85"></path>`
    );
  }
  const fill = FEATHER_COLORS[id % FEATHER_COLORS.length];
  return (
    `<path d="${FEATHER_PATH}" fill="${fill}" stroke="#161719" stroke-width="3" stroke-linejoin="round"></path>` +
    `<path d="${FEATHER_BARBS_PATH}" fill="none" stroke="#161719" stroke-width="1.6" stroke-linecap="round" opacity=".55"></path>` +
    `<path d="${FEATHER_SHAFT_PATH}" fill="none" stroke="#F4F4F4" stroke-width="2.2" stroke-linecap="round" opacity=".85"></path>` +
    `<path d="${FEATHER_HIGHLIGHT_PATH}" fill="#F4F4F4" opacity=".28"></path>`
  );
}

/** The design's own fixed tilt per kind (`rot`): 25° for a feather, 0 for a
 *  barrier, and a continuous spin for a star (`i.rot+(i.k==='s'?4:0)` per
 *  tick) -- cosmetic only, so the DOM layer tracks each star's own spin by
 *  its stable item id rather than the engine carrying a `rot` field. */
const FEATHER_TILT_DEG = 25;
const STAR_SPIN_DEG_PER_TICK = 4;

/**
 * The avenue backdrop (sky gradient, crowd, balloon arches, title lockup,
 * spotlights, disco balls, confetti, lane markings), ported from `design/
 * Minigame Carnaval Parade.dc.html`'s static SVG verbatim apart from two
 * deliberate simplifications, both purely decorative texture, not gameplay:
 * the crowd's ~240 individually-placed circles become one repeating
 * `<pattern>` tile of the same colours/opacities, and every SMIL animation
 * (the spotlights' sway, the glow pools' pulse, the disco balls' sparkle
 * bursts, the sky's own twinkling stars) is dropped in favour of each
 * element's own static mid-animation look. The two lane divider lines
 * (`.carnaval-parade__lane-line`) and the item/player groups are left for
 * `render()` to fill in and animate.
 */
const BALLOON_ARCHES: ReadonlyArray<{ x0: number; x1: number; color: string }> = [
  { x0: 20, x1: 150, color: '#FFD23F' },
  { x0: 190, x1: 320, color: '#00BDFF' },
  { x0: 360, x1: 490, color: '#E4572E' },
  { x0: 530, x1: 660, color: '#3DDC84' },
  { x0: 700, x1: 830, color: '#F4F4F4' },
  { x0: 870, x1: 1000, color: '#FF3DA5' },
  { x0: 1040, x1: 1170, color: '#FFD23F' },
  { x0: 1210, x1: 1340, color: '#00BDFF' },
  { x0: 1380, x1: 1510, color: '#E4572E' },
  { x0: 1550, x1: 1680, color: '#3DDC84' },
];

const CONFETTI_SPECKS: ReadonlyArray<{ x: number; y: number; rot: number; color: string }> = [
  { x: 0, y: 490, rot: 0, color: '#FFD23F' },
  { x: 137, y: 551, rot: 37, color: '#00BDFF' },
  { x: 274, y: 612, rot: 74, color: '#E4572E' },
  { x: 411, y: 673, rot: 111, color: '#3DDC84' },
  { x: 548, y: 734, rot: 148, color: '#F4F4F4' },
  { x: 685, y: 795, rot: 185, color: '#FF3DA5' },
  { x: 822, y: 856, rot: 222, color: '#FFD23F' },
  { x: 959, y: 517, rot: 259, color: '#00BDFF' },
  { x: 1096, y: 578, rot: 296, color: '#E4572E' },
  { x: 1233, y: 639, rot: 333, color: '#3DDC84' },
  { x: 1370, y: 700, rot: 10, color: '#F4F4F4' },
  { x: 1507, y: 761, rot: 47, color: '#FF3DA5' },
  { x: 44, y: 822, rot: 84, color: '#FFD23F' },
  { x: 181, y: 883, rot: 121, color: '#00BDFF' },
  { x: 318, y: 544, rot: 158, color: '#E4572E' },
  { x: 455, y: 605, rot: 195, color: '#3DDC84' },
  { x: 592, y: 666, rot: 232, color: '#F4F4F4' },
  { x: 729, y: 727, rot: 269, color: '#FF3DA5' },
  { x: 866, y: 788, rot: 306, color: '#FFD23F' },
  { x: 1003, y: 849, rot: 343, color: '#00BDFF' },
  { x: 1140, y: 510, rot: 20, color: '#E4572E' },
  { x: 1277, y: 571, rot: 57, color: '#3DDC84' },
  { x: 1414, y: 632, rot: 94, color: '#F4F4F4' },
  { x: 1551, y: 693, rot: 131, color: '#FF3DA5' },
  { x: 88, y: 754, rot: 168, color: '#FFD23F' },
  { x: 225, y: 815, rot: 205, color: '#00BDFF' },
  { x: 362, y: 876, rot: 242, color: '#E4572E' },
  { x: 499, y: 537, rot: 279, color: '#3DDC84' },
  { x: 636, y: 598, rot: 316, color: '#F4F4F4' },
  { x: 773, y: 659, rot: 353, color: '#FF3DA5' },
  { x: 910, y: 720, rot: 30, color: '#FFD23F' },
  { x: 1047, y: 781, rot: 67, color: '#00BDFF' },
  { x: 1184, y: 842, rot: 104, color: '#E4572E' },
  { x: 1321, y: 503, rot: 141, color: '#3DDC84' },
  { x: 1458, y: 564, rot: 178, color: '#F4F4F4' },
  { x: 1595, y: 625, rot: 215, color: '#FF3DA5' },
  { x: 132, y: 686, rot: 252, color: '#FFD23F' },
  { x: 269, y: 747, rot: 289, color: '#00BDFF' },
  { x: 406, y: 808, rot: 326, color: '#E4572E' },
  { x: 543, y: 869, rot: 3, color: '#3DDC84' },
];

/** The avenue's five sweeping spotlight cones, verbatim from the design's
 *  own trapezoid polygons (a light source dot at the apex, a cone down to
 *  the floor) apart from dropping their SMIL `animateTransform` sway --
 *  decorative only. */
const SPOTLIGHTS: ReadonlyArray<{ cx: number; color: string }> = [
  { cx: 200, color: '#00BDFF' },
  { cx: 520, color: '#FF3DA5' },
  { cx: 800, color: '#FFD23F' },
  { cx: 1080, color: '#7B4DFF' },
  { cx: 1400, color: '#3DDC84' },
];

/** The spotlights' own pooled-light glow on the avenue floor, verbatim
 *  positions/colours from the design, with its pulsing SMIL `animate`
 *  dropped (decorative only) in favour of one fixed mid-pulse opacity. */
const GLOW_POOLS: ReadonlyArray<{ cx: number; cy: number; color: string }> = [
  { cx: 260, cy: 650, color: '#FF3DA5' },
  { cx: 620, cy: 710, color: '#00BDFF' },
  { cx: 980, cy: 650, color: '#FFD23F' },
  { cx: 1340, cy: 710, color: '#7B4DFF' },
];

/** One hanging disco ball (wire, ball, crosshatch glints, a highlight),
 *  verbatim from the design apart from dropping its radiating sparkle-burst
 *  SMIL blink animation (decorative only). */
function discoBallSvg(cx: number): string {
  return (
    `<line x1="${cx}" y1="40" x2="${cx}" y2="120" stroke="#B3B6C9" stroke-width="2"></line>` +
    `<circle cx="${cx}" cy="150" r="32" fill="#B3B6C9" stroke="#0C4B5F" stroke-width="3"></circle>` +
    `<path d="M${cx - 30} 140 H${cx + 30} M${cx - 26} 160 H${cx + 26} M${cx - 14} 120 V180 M${cx + 14} 120 V180" stroke="#6b6f80" stroke-width="2" opacity=".7"></path>` +
    `<circle cx="${cx - 10}" cy="138" r="8" fill="#F4F4F4" opacity=".7"></circle>`
  );
}

/** The player's own figure, verbatim from the design's `playerT` group: a
 *  dancer's shadow, a crown of feather plumes (the design's main ring of 12,
 *  its shorter inner fringe and hip/tail plumes left out -- a deliberate
 *  trim for size, not fidelity, since the same plume path/colours repeat),
 *  and the design's standard figure body (legs, pink torso, head, collar
 *  sequins and necklace). Positioned by `render()`'s own outer `transform`. */
const PLAYER_FIGURE_SVG =
  '<ellipse cx="0" cy="4" rx="46" ry="11" fill="#000" opacity=".4"></ellipse>' +
  '<svg x="-112" y="-205" width="225" height="218" viewBox="-30 -44 180 174" style="overflow:visible">' +
  [
    [-84, '#00BDFF', '#3DDC84', 'short'],
    [-68, '#FF3DA5', '#7B4DFF', 'long'],
    [-52, '#FFD23F', '#FF7A1A', 'short'],
    [-36, '#3DDC84', '#00BDFF', 'long'],
    [-20, '#7B4DFF', '#FF3DA5', 'short'],
    [-6, '#FF7A1A', '#FFD23F', 'long'],
    [6, '#00BDFF', '#3DDC84', 'short'],
    [20, '#FF3DA5', '#7B4DFF', 'long'],
    [36, '#FFD23F', '#FF7A1A', 'short'],
    [52, '#3DDC84', '#00BDFF', 'long'],
    [68, '#7B4DFF', '#FF3DA5', 'short'],
    [84, '#FF7A1A', '#FFD23F', 'long'],
  ]
    .map(([rot, plume, tip, len]) => {
      const short = len === 'short';
      const plumeD = short
        ? 'M0 0 C-12 -23.4 -12 -62.4 0 -78 C12 -62.4 12 -23.4 0 0 Z'
        : 'M0 0 C-12 -26.4 -12 -70.4 0 -88 C12 -70.4 12 -26.4 0 0 Z';
      const shaftY = short ? -68.64 : -77.44;
      const tipY = short ? -60.84 : -68.64;
      return (
        `<g transform="translate(60 78) rotate(${rot})">` +
        `<path d="${plumeD}" fill="${plume}" stroke="#0C4B5F" stroke-width="1.6" stroke-linejoin="round"></path>` +
        `<path d="M0 -2 V${shaftY}" stroke="#F4F4F4" stroke-width=".9" opacity=".7"></path>` +
        `<circle cx="0" cy="${tipY}" r="5.04" fill="${tip}" stroke="#0C4B5F" stroke-width="1"></circle>` +
        '</g>'
      );
    })
    .join('') +
  '<rect x="46" y="104" width="12" height="18" rx="3" fill="#1d1f22" stroke="#0C4B5F" stroke-width="2"></rect>' +
  '<rect x="62" y="104" width="12" height="18" rx="3" fill="#1d1f22" stroke="#0C4B5F" stroke-width="2"></rect>' +
  '<rect x="43" y="118" width="17" height="7" rx="3.5" fill="#0f1012" stroke="#0C4B5F" stroke-width="2"></rect>' +
  '<rect x="60" y="118" width="17" height="7" rx="3.5" fill="#0f1012" stroke="#0C4B5F" stroke-width="2"></rect>' +
  '<rect x="34" y="66" width="52" height="44" rx="12" fill="#FF3DA5" stroke="#0C4B5F" stroke-width="2.5"></rect>' +
  '<rect x="24" y="70" width="12" height="30" rx="6" fill="#FF3DA5" stroke="#0C4B5F" stroke-width="2.5"></rect>' +
  '<rect x="84" y="70" width="12" height="30" rx="6" fill="#FF3DA5" stroke="#0C4B5F" stroke-width="2.5"></rect>' +
  '<circle cx="30" cy="101" r="5.5" fill="#E4B896" stroke="#0C4B5F" stroke-width="2"></circle>' +
  '<circle cx="90" cy="101" r="5.5" fill="#E4B896" stroke="#0C4B5F" stroke-width="2"></circle>' +
  '<path d="M50 66 Q60 74 70 66" fill="none" stroke="#0C4B5F" stroke-width="2"></path>' +
  '<rect x="54" y="58" width="12" height="12" fill="#E4B896"></rect>' +
  '<circle cx="60" cy="40" r="25" fill="#E4B896" stroke="#0C4B5F" stroke-width="2.5"></circle>' +
  '<circle cx="36" cy="42" r="4" fill="#E4B896" stroke="#0C4B5F" stroke-width="2"></circle>' +
  '<circle cx="84" cy="42" r="4" fill="#E4B896" stroke="#0C4B5F" stroke-width="2"></circle>' +
  '<path d="M35 36 C34 18 46 12 60 12 C74 12 86 18 85 36 C80 26 40 26 35 36 Z" fill="#2b2118" stroke="#0C4B5F" stroke-width="2.5"></path>' +
  '<path d="M46 34 L54 33 M66 33 L74 34" stroke="#0C4B5F" stroke-width="2" stroke-linecap="round"></path>' +
  '<circle cx="51" cy="41" r="2.4" fill="#161719"></circle>' +
  '<circle cx="69" cy="41" r="2.4" fill="#161719"></circle>' +
  '<path d="M52 53 Q62 58 68 52" fill="none" stroke="#0C4B5F" stroke-width="2.5" stroke-linecap="round"></path>' +
  '<circle cx="40" cy="80" r="2.1" fill="#F4F4F4" stroke="#0C4B5F" stroke-width=".8"></circle>' +
  '<circle cx="46.7" cy="83" r="2.1" fill="#FFD23F" stroke="#0C4B5F" stroke-width=".8"></circle>' +
  '<circle cx="53.4" cy="80" r="2.1" fill="#F4F4F4" stroke="#0C4B5F" stroke-width=".8"></circle>' +
  '<circle cx="60.1" cy="83" r="2.1" fill="#FFD23F" stroke="#0C4B5F" stroke-width=".8"></circle>' +
  '<circle cx="66.8" cy="80" r="2.1" fill="#F4F4F4" stroke="#0C4B5F" stroke-width=".8"></circle>' +
  '<circle cx="73.5" cy="83" r="2.1" fill="#FFD23F" stroke="#0C4B5F" stroke-width=".8"></circle>' +
  '<circle cx="80.2" cy="80" r="2.1" fill="#F4F4F4" stroke="#0C4B5F" stroke-width=".8"></circle>' +
  '<path d="M36 90 H84 M36 100 H84" stroke="#FFD23F" stroke-width="3" stroke-dasharray="2.5 3"></path>' +
  '<path d="M52 110 H68" stroke="#FFD23F" stroke-width="3"></path>' +
  '</svg>';

function carnavalSceneSvg(): string {
  const balloons = BALLOON_ARCHES.map(
    ({ x0, x1, color }) =>
      `<path d="M${x0} 300 V240 A65 65 0 0 1 ${x1} 240 V300" fill="none" stroke="${color}" stroke-width="5" opacity=".8"></path>`,
  ).join('');
  const confetti = CONFETTI_SPECKS.map(
    ({ x, y, rot, color }) =>
      `<rect x="${x}" y="${y}" width="8" height="4" fill="${color}" opacity=".5" transform="rotate(${rot} ${x} ${y})"></rect>`,
  ).join('');
  const spotlights = SPOTLIGHTS.map(
    ({ cx, color }) =>
      `<polygon points="${cx - 8},200 ${cx + 8},200 ${cx + 130},640 ${cx - 130},640" fill="${color}" opacity=".22"></polygon>` +
      `<circle cx="${cx}" cy="200" r="7" fill="${color}" stroke="#0C4B5F" stroke-width="2"></circle>`,
  ).join('');
  const glowPools = GLOW_POOLS.map(
    ({ cx, cy, color }) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="130" ry="46" fill="${color}" opacity=".15"></ellipse>`,
  ).join('');
  const discoBalls = discoBallSvg(360) + discoBallSvg(1240);
  return (
    '<svg class="carnaval-parade__scene" viewBox="0 150 1600 750" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
    '<defs>' +
    '<linearGradient id="cp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A0C0F"></stop><stop offset="1" stop-color="#2a1250"></stop></linearGradient>' +
    '<pattern id="cp-crowd" width="27" height="52" patternUnits="userSpaceOnUse">' +
    '<circle cx="0" cy="0" r="8" fill="#FFD23F" opacity=".5"></circle>' +
    '<circle cx="13.5" cy="13" r="8" fill="#3DDC84" opacity=".62"></circle>' +
    '<circle cx="0" cy="26" r="8" fill="#FFD23F" opacity=".74"></circle>' +
    '<circle cx="13.5" cy="39" r="8" fill="#3DDC84" opacity=".5"></circle>' +
    '</pattern>' +
    '</defs>' +
    '<rect width="1600" height="900" fill="url(#cp-sky)"></rect>' +
    '<rect x="0" y="40" width="1600" height="150" fill="#15191c"></rect>' +
    '<rect x="0" y="40" width="1600" height="150" fill="url(#cp-crowd)"></rect>' +
    '<rect x="0" y="190" width="1600" height="26" fill="#0C4B5F"></rect>' +
    balloons +
    '<text x="800" y="262" text-anchor="middle" font-family="Anton,sans-serif" font-size="72" letter-spacing="14" fill="#FF3DA5" opacity=".9">CARNAVAL</text>' +
    '<text x="800" y="312" text-anchor="middle" font-family="Anton,sans-serif" font-size="22" letter-spacing="10" fill="#00BDFF">DESFILE · SAMBÓDROMO LATAM</text>' +
    '<rect x="0" y="440" width="1600" height="460" fill="#1a1230"></rect>' +
    '<rect x="0" y="440" width="1600" height="14" fill="#0C4B5F"></rect>' +
    confetti +
    '<rect x="0" y="508" width="1600" height="300" fill="#231745"></rect>' +
    spotlights +
    glowPools +
    discoBalls +
    '<line class="carnaval-parade__lane-line" x1="0" y1="615" x2="1600" y2="615" stroke="#FFD23F" stroke-width="3" stroke-dasharray="26 22" opacity=".7"></line>' +
    '<line class="carnaval-parade__lane-line" x1="0" y1="725" x2="1600" y2="725" stroke="#FFD23F" stroke-width="3" stroke-dasharray="26 22" opacity=".7"></line>' +
    '<rect x="0" y="808" width="1600" height="12" fill="#0C4B5F"></rect>' +
    '<g class="carnaval-parade__items"></g>' +
    `<g class="carnaval-parade__player">${PLAYER_FIGURE_SVG}</g>` +
    '</svg>'
  );
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function createItemNode(kind: ItemKind, id: number): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  g.setAttribute('class', `carnaval-parade__item carnaval-parade__item--${kind}`);
  g.innerHTML = itemInnerSvg(kind, id);
  return g;
}

/**
 * Carnaval Parade: a solo, 45 s, three-lane parade runner, mirroring the
 * other Minigames' shape -- the pure `carnaval-parade-engine.ts` under a thin
 * DOM layer ported from `design/Minigame Carnaval Parade.dc.html`'s play
 * screen into the shell's play area (`createMinigameShell`'s `playAreaEl`).
 * The shell owns the how-to-play screen (with this game's `howToSubtitle`),
 * the round clock, PAUSE/P, QUIT and `recordRound`; its done screen shows
 * this game's own result title and Hector's line via `doneSummary()`.
 *
 * The play area's background, item sprites and the player's own figure are
 * one inline SVG (`carnavalSceneSvg()`) matching the design's 1600x900
 * coordinate space pixel for pixel, so an item's `x`/lane and the player's
 * `playerY` (the engine's own state) place their `<g>`s with no percentage
 * conversion. The lane dashed-line scroll and a star's spin are cosmetic
 * only (not reproduced by the engine, same reasoning its own header comment
 * gives for the feather colour pick) and are frozen under
 * `prefers-reduced-motion`; the pickups' and player's own travel is real
 * gameplay state and always renders.
 *
 * Not ported: the design's trigger screen (the "MESTRE DE BATERIA" card,
 * JOIN THE PARADE / JUST WATCHING) belongs to Hector's own NPC dialog
 * (`npcs.ts`'s `CARNAVAL_PARADE_DIALOG`), opened either by clicking him or by
 * the LATAM Disco Hall's `disco-turntable` Room hotspot -- the same split
 * Beystadium's Michael dialog makes.
 *
 * Producer: this game. Consumer: `createDefaultMinigameRegistry`
 * (`minigame-registry.ts`).
 */
export function createCarnavalParade(
  options: CarnavalParadeOptions = {},
): Minigame<'carnaval-parade'> & CarnavalParadeTestHooks {
  const engine = options.engine ?? createCarnavalParadeEngine();
  const reducedMotion = prefersReducedMotion();

  let context: MinigameContext<'carnaval-parade'> | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let keydownHandler: ((event: KeyboardEvent) => void) | undefined;
  let finished = false;
  let dashOffset = 0;
  let laneLineEls: SVGLineElement[] = [];

  const itemEls = new Map<number, SVGGElement>();
  const starSpinDeg = new Map<number, number>();
  const refs: Record<string, HTMLElement> = {};
  const svgRefs: Record<string, SVGElement> = {};

  function report(): void {
    const stats = engine.stats();
    context?.setScore(engine.view.score);
    context?.setStats(stats);
  }

  function stopTicking(): void {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  }

  function finishIfEnded(): void {
    if (engine.view.phase === 'done' && !finished) {
      finished = true;
      stopTicking();
      context?.finish();
    }
  }

  function startTicking(): void {
    stopTicking();
    intervalId = setInterval(() => {
      engine.tick();
      render();
      report();
      finishIfEnded();
    }, TICK_MS);
  }

  function renderItems(items: readonly CarnavalParadeItem[]): void {
    const seen = new Set<number>();
    for (const item of items) {
      seen.add(item.id);
      let node = itemEls.get(item.id);
      if (!node) {
        node = createItemNode(item.kind, item.id);
        itemEls.set(item.id, node);
        svgRefs.items.append(node);
      }
      let rotation = 0;
      if (item.kind === 'feather') {
        rotation = FEATHER_TILT_DEG;
      } else if (item.kind === 'star') {
        const spun = (starSpinDeg.get(item.id) ?? 0) + (reducedMotion ? 0 : STAR_SPIN_DEG_PER_TICK);
        starSpinDeg.set(item.id, spun);
        rotation = spun;
      }
      node.setAttribute(
        'transform',
        `translate(${item.x.toFixed(1)} ${(LANE_Y[item.lane] - 26).toFixed(1)}) rotate(${rotation})`,
      );
    }
    for (const [id, node] of itemEls) {
      if (!seen.has(id)) {
        node.remove();
        itemEls.delete(id);
        starSpinDeg.delete(id);
      }
    }
  }

  function render(): void {
    const view = engine.view;

    renderItems(view.items);

    svgRefs.player.setAttribute('transform', `translate(300 ${view.playerY.toFixed(1)})`);

    if (!reducedMotion) {
      const speed = paradeSpeed(view.elapsedMs);
      dashOffset = (dashOffset - speed * TICK_MS) % 48;
    }
    laneLineEls.forEach((line) => line.setAttribute('stroke-dashoffset', dashOffset.toFixed(1)));

    for (let n = 0; n < 3; n++) {
      refs[`life${n}`]?.classList.toggle('carnaval-parade__life--lit', n < view.lives);
    }
    refs.streakValue.textContent = String(view.streak);
    refs.multValue.textContent = `x${view.multiplier}`;

    if (view.toast) {
      refs.toast.hidden = false;
      refs.toast.textContent = view.toast.text;
      refs.toast.classList.toggle('carnaval-parade__toast--hit', view.toast.kind === 'hit');
      refs.toast.classList.toggle('carnaval-parade__toast--pickup', view.toast.kind === 'pickup');
      refs.toast.style.top = `${topPercentForLane(view.lane)}%`;
    } else {
      refs.toast.hidden = true;
    }
  }

  function moveAndRender(delta: -1 | 1): void {
    engine.moveLane(delta);
    render();
  }

  function handleKeydown(event: KeyboardEvent): void {
    const key = event.key;
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      event.preventDefault();
      if (!event.repeat) moveAndRender(-1);
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      event.preventDefault();
      if (!event.repeat) moveAndRender(1);
    }
  }

  function buildDom(container: HTMLElement): void {
    const root = el('div', 'carnaval-parade');

    const track = el('div', 'carnaval-parade__track');
    track.innerHTML = carnavalSceneSvg();
    const toast = el('div', 'carnaval-parade__toast');
    toast.hidden = true;
    track.append(toast);
    Object.assign(refs, { toast });
    Object.assign(svgRefs, {
      items: track.querySelector('.carnaval-parade__items')!,
      player: track.querySelector('.carnaval-parade__player')!,
    });
    laneLineEls = Array.from(track.querySelectorAll<SVGLineElement>('.carnaval-parade__lane-line'));
    itemEls.clear();
    starSpinDeg.clear();

    const hud = el('div', 'carnaval-parade__hud');
    const lives = el('div', 'carnaval-parade__lives');
    for (let n = 0; n < 3; n++) {
      const life = el('span', 'carnaval-parade__life carnaval-parade__life--lit');
      lives.append(life);
      refs[`life${n}`] = life;
    }
    const streak = el('div', 'carnaval-parade__streak');
    streak.append(el('span', 'carnaval-parade__hud-label', 'STREAK'));
    const streakValue = el('span', 'carnaval-parade__streak-value', '0');
    streak.append(streakValue);
    const mult = el('div', 'carnaval-parade__mult');
    mult.append(el('span', 'carnaval-parade__hud-label', 'MULTIPLIER'));
    const multValue = el('span', 'carnaval-parade__mult-value', 'x1');
    mult.append(multValue);
    hud.append(lives, streak, mult);
    Object.assign(refs, { streakValue, multValue });

    const laneButtons = el('div', 'carnaval-parade__lane-buttons');
    const laneUp = el(
      'button',
      'carnaval-parade__lane-button carnaval-parade__lane-button--up',
      '↑',
    );
    laneUp.type = 'button';
    laneUp.setAttribute('aria-label', 'Move up a lane');
    laneUp.addEventListener('click', () => moveAndRender(-1));
    const laneDown = el(
      'button',
      'carnaval-parade__lane-button carnaval-parade__lane-button--down',
      '↓',
    );
    laneDown.type = 'button';
    laneDown.setAttribute('aria-label', 'Move down a lane');
    laneDown.addEventListener('click', () => moveAndRender(1));
    laneButtons.append(laneUp, laneDown);

    root.append(track, hud, laneButtons);
    container.replaceChildren(root);
  }

  function doneSummary(): MinigameDoneSummary {
    const stats = engine.stats();
    const tier = resultTier(engine.view.score);
    return {
      kicker: engine.view.ended === 'lives' ? 'OUT OF LIVES' : 'FIM DO DESFILE',
      title: RESULT_TITLES[tier],
      rows: [{ key: 'bestStreak', label: 'BEST STREAK', value: String(stats.bestStreak) }],
      quote: RESULT_QUOTES[tier],
    };
  }

  return {
    id: 'carnaval-parade',
    title: 'CARNAVAL PARADE',
    durationSec: CARNAVAL_PARADE_DURATION_SEC,
    howToSubtitle: 'CARNAVAL PARADE · 45 SECONDS · SOLO',
    howToPlay: [
      'Press Up and Down (or W and S) to move between the three lanes of the parade avenue. The buttons at the bottom left work too.',
      'Pick up feathers for 10 points each. Every 5 in a row raises your multiplier up to x4. Gold stars are worth 25. Missing a feather breaks the streak.',
      'You have 3 lives. A barrier costs one life and resets your streak. The parade speeds up all the way to the finish.',
    ],
    statLabels: { feathers: 'FEATHERS', stars: 'STARS', barriersHit: 'BARRIERS' },

    start(container, ctx) {
      context = ctx;
      buildDom(container);
      report();
      render();
      keydownHandler = handleKeydown;
      window.addEventListener('keydown', keydownHandler);
      startTicking();
    },

    pause() {
      stopTicking();
    },

    resume() {
      if (!finished) startTicking();
    },

    end() {
      stopTicking();
      finished = true;
      if (keydownHandler) {
        window.removeEventListener('keydown', keydownHandler);
        keydownHandler = undefined;
      }
      return { score: engine.view.score, stats: engine.stats() };
    },

    doneSummary,

    debugFinishNow() {
      context?.finish();
    },
  };
}
