/**
 * Static SVG art for the Landing page, ported from
 * `design/Club JenGuin Landing.dc.html`. Every string here is a fixed literal
 * (no Player data), so it is safe to assign through `innerHTML`.
 */

const OUTLINE = '#0C4B5F';

/** Accessory drawn on top of a crowd Penguin, in the 120x130 viewBox. */
export type LandingAccessory =
  | 'none'
  | 'glasses'
  | 'bug-badge'
  | 'snowball'
  | 'cane'
  | 'scarf'
  | 'headphones'
  | 'mug'
  | 'medal'
  | 'beach-ball'
  | 'chef-hat'
  | 'laptop'
  | 'ice-cream'
  | 'snorkel-hard-hat';

const ACCESSORIES: Record<LandingAccessory, string> = {
  none: '',
  glasses:
    '<rect x="41" y="27" width="17" height="13" rx="3" fill="none" stroke="#00BDFF" stroke-width="2.5"/><rect x="62" y="27" width="17" height="13" rx="3" fill="none" stroke="#00BDFF" stroke-width="2.5"/><line x1="58" y1="33" x2="62" y2="33" stroke="#00BDFF" stroke-width="2.5"/>',
  'bug-badge':
    '<polygon points="18,84 32,92 32,108 18,116 4,108 4,92" fill="#00BDFF" stroke="#0C4B5F" stroke-width="2.5"/><circle cx="13" cy="98" r="2" fill="#161719"/><circle cx="23" cy="98" r="2" fill="#161719"/>',
  snowball: '<circle cx="102" cy="76" r="12" fill="#F4F4F4" stroke="#BFE3F0" stroke-width="3"/>',
  cane: '<path d="M96 60 L112 118 L104 122 L108 122" fill="none" stroke="#C9A366" stroke-width="5" stroke-linecap="round"/>',
  scarf:
    '<path d="M34 56 C50 66 70 66 86 56 L86 64 C70 74 50 74 34 64 Z" fill="#00BDFF" stroke="#0C4B5F" stroke-width="2"/><path d="M74 62 L82 92 L70 90 Z" fill="#00BDFF" stroke="#0C4B5F" stroke-width="2"/>',
  headphones:
    '<path d="M30 34 C30 10 90 10 90 34" fill="none" stroke="#0C4B5F" stroke-width="5"/><rect x="24" y="28" width="10" height="16" rx="4" fill="#00BDFF" stroke="#0C4B5F" stroke-width="2"/><rect x="86" y="28" width="10" height="16" rx="4" fill="#00BDFF" stroke="#0C4B5F" stroke-width="2"/>',
  mug: '<rect x="82" y="84" width="20" height="20" rx="3" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="2"/><path d="M102 88 h6 v10 h-6" fill="none" stroke="#0C4B5F" stroke-width="2"/><path d="M88 80 q2 -5 0 -10 M95 80 q2 -5 0 -10" stroke="#B3B6C9" stroke-width="1.5" fill="none"/>',
  medal:
    '<polygon points="100,72 114,80 114,96 100,104 86,96 86,80" fill="#F2C12E" stroke="#0C4B5F" stroke-width="2.5"/><text x="100" y="93" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="14" fill="#161719">1</text>',
  'beach-ball':
    '<circle cx="18" cy="112" r="11" fill="#00BDFF" stroke="#F4F4F4" stroke-width="3"/><line x1="18" y1="101" x2="18" y2="123" stroke="#161719" stroke-width="2"/><line x1="7" y1="112" x2="29" y2="112" stroke="#161719" stroke-width="2"/>',
  'chef-hat':
    '<path d="M36 26 L36 14 C34 2 50 0 56 8 C62 -2 80 0 84 10 C90 4 92 18 84 22 L84 26 Z" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="2.5"/><rect x="34" y="22" width="52" height="8" rx="2" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="2.5"/>',
  laptop:
    '<rect x="70" y="88" width="34" height="22" rx="2" fill="#2f3338" stroke="#0C4B5F" stroke-width="2"/><rect x="73" y="91" width="28" height="16" fill="#0a3d4d"/><polygon points="84,96 90,99 84,102" fill="#00BDFF"/>',
  'ice-cream':
    '<path d="M6 122 L18 86 L30 122 Z" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="2"/><circle cx="18" cy="84" r="10" fill="#00BDFF" stroke="#0C4B5F" stroke-width="2"/>',
  'snorkel-hard-hat':
    '<rect x="38" y="26" width="44" height="16" rx="6" fill="none" stroke="#00BDFF" stroke-width="4"/><rect x="42" y="29" width="16" height="10" rx="2" fill="#BFE3F0" opacity=".8"/><rect x="62" y="29" width="16" height="10" rx="2" fill="#BFE3F0" opacity=".8"/><path d="M84 30 L92 30 L92 6" fill="none" stroke="#00BDFF" stroke-width="5" stroke-linecap="round"/><path d="M20 22 C30 6 90 6 100 22 L60 14 Z" fill="#F2C12E" stroke="#0C4B5F" stroke-width="3"/>',
};

export interface LandingPenguinArt {
  body: string;
  /** Beanie color; omitted for a bare head. */
  cap?: string;
  accessory: LandingAccessory;
}

/** One decorative Penguin as an SVG string in the design's 120x130 viewBox. */
export function landingPenguinSvg({ body, cap, accessory }: LandingPenguinArt): string {
  const capPath = cap ? `<path d="M34 22 C40 8 80 8 86 22 L60 18 Z" fill="${cap}"/>` : '';
  return (
    '<svg viewBox="0 0 120 130" aria-hidden="true" focusable="false">' +
    `<path d="M60 14 C30 14 22 50 22 82 C22 106 40 118 60 118 C80 118 98 106 98 82 C98 50 90 14 60 14 Z" fill="${body}" stroke="${OUTLINE}" stroke-width="6"/>` +
    '<path d="M60 40 C46 40 38 62 38 84 C38 102 48 112 60 112 C72 112 82 102 82 84 C82 62 74 40 60 40 Z" fill="#F4F4F4"/>' +
    '<circle cx="50" cy="34" r="4.5" fill="#F4F4F4"/><circle cx="70" cy="34" r="4.5" fill="#F4F4F4"/>' +
    '<circle cx="51" cy="34" r="2" fill="#161719"/><circle cx="71" cy="34" r="2" fill="#161719"/>' +
    '<path d="M50 44 L70 44 L60 54 Z" fill="#00BDFF"/>' +
    '<path d="M40 116 L26 124 L52 122 Z" fill="#00BDFF"/><path d="M80 116 L94 124 L68 122 Z" fill="#00BDFF"/>' +
    `<path d="M24 60 C10 78 12 96 26 100 Z" fill="${body}" stroke="${OUTLINE}" stroke-width="4"/>` +
    `<path d="M96 60 C110 78 108 96 94 100 Z" fill="${body}" stroke="${OUTLINE}" stroke-width="4"/>` +
    capPath +
    ACCESSORIES[accessory] +
    '</svg>'
  );
}

export interface CrowdPenguin extends LandingPenguinArt {
  /** Horizontal center, as a percentage of the Stage width. */
  leftPct: number;
  /** Top offset in Stage pixels from the top of the crowd band. */
  top: number;
  /** Rendered width in Stage pixels; height follows the 120:130 viewBox. */
  width: number;
  /** Bob animation duration and delay, in seconds. */
  bobSeconds: number;
  bobDelaySeconds: number;
}

/** The waddling crowd along the bottom of the Landing page, back row first. */
export const LANDING_CROWD: readonly CrowdPenguin[] = [
  {
    leftPct: 24,
    top: -14,
    width: 143,
    bobSeconds: 2.0,
    bobDelaySeconds: 0,
    body: '#3a4046',
    accessory: 'glasses',
  },
  {
    leftPct: 78,
    top: -4,
    width: 143,
    bobSeconds: 3.4,
    bobDelaySeconds: -0.37,
    body: '#494949',
    cap: '#F4F4F4',
    accessory: 'bug-badge',
  },
  {
    leftPct: 60,
    top: -7,
    width: 150,
    bobSeconds: 3.0,
    bobDelaySeconds: -0.74,
    body: '#F4F4F4',
    cap: '#00BDFF',
    accessory: 'snowball',
  },
  {
    leftPct: 94,
    top: -7,
    width: 150,
    bobSeconds: 2.6,
    bobDelaySeconds: -1.11,
    body: '#161719',
    accessory: 'cane',
  },
  {
    leftPct: 4,
    top: -2,
    width: 150,
    bobSeconds: 2.2,
    bobDelaySeconds: -1.48,
    body: '#0C4B5F',
    cap: '#F4F4F4',
    accessory: 'scarf',
  },
  {
    leftPct: 42,
    top: -10,
    width: 158,
    bobSeconds: 3.6,
    bobDelaySeconds: -1.85,
    body: '#161719',
    cap: '#F4F4F4',
    accessory: 'headphones',
  },
  {
    leftPct: 13,
    top: 14,
    width: 173,
    bobSeconds: 3.2,
    bobDelaySeconds: -0.22,
    body: '#161719',
    cap: '#00BDFF',
    accessory: 'mug',
  },
  {
    leftPct: 86,
    top: 14,
    width: 173,
    bobSeconds: 2.8,
    bobDelaySeconds: -0.59,
    body: '#0C4B5F',
    cap: '#00BDFF',
    accessory: 'medal',
  },
  {
    leftPct: 31,
    top: 7,
    width: 188,
    bobSeconds: 2.4,
    bobDelaySeconds: -0.96,
    body: '#00BDFF',
    cap: '#0C4B5F',
    accessory: 'beach-ball',
  },
  {
    leftPct: 69,
    top: 16,
    width: 180,
    bobSeconds: 2.0,
    bobDelaySeconds: -1.33,
    body: '#161719',
    cap: '#BFE3F0',
    accessory: 'chef-hat',
  },
  {
    leftPct: 50,
    top: 9,
    width: 195,
    bobSeconds: 3.4,
    bobDelaySeconds: -1.7,
    body: '#0a3d4d',
    cap: '#00BDFF',
    accessory: 'laptop',
  },
  {
    leftPct: 19,
    top: 98,
    width: 150,
    bobSeconds: 3.0,
    bobDelaySeconds: -0.07,
    body: '#3a4046',
    cap: '#00BDFF',
    accessory: 'ice-cream',
  },
  {
    leftPct: 83,
    top: 106,
    width: 143,
    bobSeconds: 2.6,
    bobDelaySeconds: -0.44,
    body: '#0a3d4d',
    cap: '#F4F4F4',
    accessory: 'headphones',
  },
  {
    leftPct: 63,
    top: 106,
    width: 150,
    bobSeconds: 2.2,
    bobDelaySeconds: -0.81,
    body: '#161719',
    cap: '#F4F4F4',
    accessory: 'snowball',
  },
  {
    leftPct: 37,
    top: 124,
    width: 135,
    bobSeconds: 3.6,
    bobDelaySeconds: -1.18,
    body: '#F4F4F4',
    cap: '#0C4B5F',
    accessory: 'glasses',
  },
];

/** The big mascot beside the logo. */
export const LANDING_HERO: LandingPenguinArt = {
  body: '#161719',
  cap: '#00BDFF',
  accessory: 'snorkel-hard-hat',
};

export interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
}

/**
 * Deterministic star field across the night-sky band (Stage pixels). A fixed
 * seed keeps the sky identical on every load and in screenshots.
 */
export function landingStars(count = 72, width = 1600, height = 340): Star[] {
  let seed = 0x5eed;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const opacities = [0.3, 0.44, 0.58, 0.72, 0.86];
  return Array.from({ length: count }, (_, i) => ({
    x: Math.floor(next() * width),
    y: Math.floor(next() * height),
    size: 2 + (i % 3),
    opacity: opacities[i % opacities.length],
  }));
}
