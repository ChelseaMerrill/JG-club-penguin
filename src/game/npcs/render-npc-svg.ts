import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_FRAME_WIDTH,
} from '../penguin/render-svg';
import { NPC_TEXT_PATHS } from './text-paths';

/**
 * A Human NPC's figure, ported from `design/build/humans.js`'s `spec`
 * argument to its `human(s, uid)` builder. Scoped to the options the NPC
 * roster (`src/npcs/npcs.ts`) actually uses, not every option `humans.js`
 * supports: #51 ported the `buzz` hairstyle, the `plaid` pattern and the
 * `camera` and `beyblade` props as its Rooms needed them, and #113 the
 * `survivor` hat/tee (Jory). The `curlyShort`/`slick` hairstyles, the
 * `henley` collar, the `yarn`/`basketball`/`survivor` props and the horse
 * `mount` composite are still never used by any Human NPC here, so they're
 * left unported; adding one later is a direct copy from `humans.js`.
 *
 * #113 also adds options that aren't in `humans.js` at all: the variations
 * a Room design draws for its own NPCs (Dev Pit's and Team Room 2's dotted
 * stubble for Ian, the Kitchen's apron for Tom and textured hair and toque
 * for Chelsea) and the static resting pose of each designed prop (Jon's
 * cards, the whiteboard markers, Anthony's fishing rod, Jethro's camera rig,
 * Nicole seated with a laptop). Each is copied verbatim from that Room
 * design's own figure markup; animating them is later work.
 */
export interface HumanFigureSpec {
  style?:
    | 'short'
    | 'spiky'
    | 'shortDark'
    | 'buzz'
    | 'sideSwept'
    | 'wavyLong'
    | 'curlyLong'
    | 'straightLong'
    | 'highBun'
    | 'bald'
    /** Chelsea's hair in the Kitchen design: wavy, textured and long. */
    | 'texturedLong';
  hair?: 'auburn' | 'ash' | 'caramel' | 'dark' | 'brown' | 'blond' | 'lblond' | 'sandy';
  skin?: 'light' | 'fair' | 'med';
  /** The torso/shirt colour. */
  top?: string;
  /** An open-front jacket/vest over the shirt, when given. */
  jacket?: string;
  pattern?: 'stripes' | 'plaid' | 'dots';
  pattern2?: string;
  sleeveless?: boolean;
  collar?: 'button' | 'polo' | 'zip' | 'crew' | 'shirtLight';
  necklace?: boolean;
  /** An earring colour; drawn only when given. */
  earrings?: string;
  mouth?: 'flat' | 'smirk' | 'sip';
  teeth?: boolean;
  /** `dotStubble`: Dev Pit's and Team Room 2's light dotted stubble for Ian. */
  beard?: 'full' | 'stubble' | 'dotStubble';
  beardColor?: string;
  greys?: boolean;
  glasses?: 'rect' | 'thin' | 'sun' | 'roundBrown';
  /** `toque`: Chelsea's tall pleated toque in the Kitchen design. */
  hat?: 'chef' | 'headphones' | 'toque' | 'survivor';
  tee?: 'survivor';
  /** The Kitchen design's green apron over Tom's shirt. */
  apron?: boolean;
  prop?:
    | 'tieHeadband'
    | 'scarf'
    | 'squish'
    | 'coffee'
    | 'spatula'
    | 'laptop'
    | 'clipboard'
    | 'chicken'
    | 'hobbyhorse'
    | 'camera'
    | 'beyblade'
    /** Roof Deck's rod, reel and line with a "FREE $$$" envelope as bait (Anthony). */
    | 'fishingRod';
  /** Town Center's three playing cards in Jon's right hand. */
  cards?: boolean;
  /** Dev Pit's raised arm holding a whiteboard marker (Ryan, Sam, Steven). */
  marker?: { arm: string; hand: string; color: string };
  /** The Icebox's large camera rig strapped to Jethro's chest. */
  cameraRig?: boolean;
  /** The Icebox's Nicole: seated, with a laptop on her lap. */
  seated?: 'laptop';
}

const SKIN: Record<NonNullable<HumanFigureSpec['skin']>, string> = {
  light: '#F3D3B8',
  fair: '#F6DCC6',
  med: '#E4B896',
};

const HAIR: Record<NonNullable<HumanFigureSpec['hair']>, string> = {
  auburn: '#A85A2A',
  ash: '#8B7355',
  caramel: '#8A6236',
  dark: '#2b2118',
  brown: '#5e4128',
  blond: '#E5C27A',
  lblond: '#EDD9A3',
  sandy: '#C9A366',
};

/** `humans.js`'s `OL` constant: the same teal stroke every figure outline uses. */
const OUTLINE = '#0C4B5F';

/**
 * Ports `design/build/humans.js`'s `human(s, uid)` figure body (legs, torso,
 * head, hair, face, facial hair, glasses, prop), verbatim where a branch is
 * ported at all -- same path data, same draw order -- for the options
 * `HumanFigureSpec` exposes. Pure string building, no DOM/Phaser import, so
 * it runs in Node, jsdom and the browser alike, the same as
 * `renderPenguinSvg`.
 */
function renderHumanFigure(spec: HumanFigureSpec, idPrefix: string): string {
  const sk = SKIN[spec.skin ?? 'light'];
  const hc = HAIR[spec.hair ?? 'dark'];
  const id = `npc-${idPrefix}`;
  let o = '';

  // Hair behind the head (long styles), drawn before the torso/legs so the
  // torso paints over its lower edge (`humans.js` order).
  if (spec.style === 'straightLong') {
    o += `<path d="M32 30 C28 50 28 76 32 96 L88 96 C92 76 92 50 88 30 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path>`;
  }
  if (spec.style === 'wavyLong') {
    o += `<path d="M32 30 C24 42 32 54 26 66 C20 78 30 88 26 98 L40 100 L80 100 L94 98 C90 88 100 78 94 66 C88 54 96 42 88 30 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path><path d="M34 44 q6 8 0 16 q-6 8 0 16 q6 8 0 16 M86 44 q-6 8 0 16 q6 8 0 16 q-6 8 0 16 M44 70 q4 8 0 16 q-4 8 0 12 M76 70 q-4 8 0 16 q4 8 0 12" fill="none" stroke="#161719" stroke-width="1.4" opacity=".35"></path>`;
  }
  if (spec.style === 'curlyLong') {
    o += `<path d="M30 30 C24 48 26 70 30 90 L90 90 C94 70 96 48 90 30 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path>`;
    for (const [cx, cy] of [
      [30, 50],
      [28, 64],
      [30, 78],
      [34, 90],
      [90, 50],
      [92, 64],
      [90, 78],
      [86, 90],
      [44, 92],
      [60, 94],
      [76, 92],
    ]) {
      o += `<circle cx="${cx}" cy="${cy}" r="6" fill="${hc}" stroke="${OUTLINE}" stroke-width="1.8"></circle>`;
    }
  }
  if (spec.style === 'texturedLong') {
    o +=
      `<path d="M32 28 Q18 32 25 42 Q14 50 23 58 Q12 66 21 74 Q11 82 21 90 Q14 99 28 102 L92 102 Q106 99 99 90 Q109 82 99 74 Q108 66 97 58 Q106 50 95 42 Q102 32 88 28 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path>` +
      `<path d="M28 46 q-5 3 -1 7 q4 2 5 -2 M26 62 q-5 3 -1 7 q4 2 5 -2 M25 78 q-5 3 -1 7 q4 2 5 -2 M27 93 q-4 3 0 6 M92 46 q5 3 1 7 q-4 2 -5 -2 M94 62 q5 3 1 7 q-4 2 -5 -2 M95 78 q5 3 1 7 q-4 2 -5 -2 M93 93 q4 3 0 6" fill="none" stroke="#B08A45" stroke-width="1.6" stroke-linecap="round"></path>` +
      `<path d="M33 52 q3 3 1 6 M31 70 q3 3 1 6 M87 52 q-3 3 -1 6 M89 70 q-3 3 -1 6" fill="none" stroke="#F6E2B0" stroke-width="1.4" stroke-linecap="round"></path>`;
  }

  // Legs + shoes.
  o +=
    `<rect x="46" y="104" width="12" height="18" rx="3" fill="#1d1f22" stroke="${OUTLINE}" stroke-width="2"></rect>` +
    `<rect x="62" y="104" width="12" height="18" rx="3" fill="#1d1f22" stroke="${OUTLINE}" stroke-width="2"></rect>` +
    `<rect x="43" y="118" width="17" height="7" rx="3.5" fill="#0f1012" stroke="${OUTLINE}" stroke-width="2"></rect>` +
    `<rect x="60" y="118" width="17" height="7" rx="3.5" fill="#0f1012" stroke="${OUTLINE}" stroke-width="2"></rect>`;

  // Torso.
  const top = spec.top ?? '#3a4046';
  o += `<defs><clipPath id="${id}t"><rect x="34" y="66" width="52" height="44" rx="12"></rect></clipPath></defs>`;
  o += `<rect x="34" y="66" width="52" height="44" rx="12" fill="${top}" stroke="${OUTLINE}" stroke-width="2.5"></rect>`;
  if (spec.pattern === 'stripes') {
    for (let y = 70; y < 110; y += 7) {
      o += `<rect x="34" y="${y}" width="52" height="3.5" fill="${spec.pattern2 ?? '#F4F4F4'}" clip-path="url(#${id}t)"></rect>`;
    }
  }
  if (spec.pattern === 'plaid') {
    const plaid = spec.pattern2 ?? '#8FB5D8';
    for (let y = 70; y < 110; y += 9) {
      o += `<rect x="34" y="${y}" width="52" height="2" fill="${plaid}" clip-path="url(#${id}t)" opacity=".8"></rect>`;
    }
    for (let x = 38; x < 86; x += 9) {
      o += `<rect x="${x}" y="66" width="2" height="44" fill="${plaid}" clip-path="url(#${id}t)" opacity=".8"></rect>`;
    }
  }
  if (spec.pattern === 'dots') {
    for (let y = 71; y < 108; y += 7) {
      for (let x = 38; x < 86; x += 7) {
        o += `<circle cx="${x + (y % 14 ? 3 : 0)}" cy="${y}" r="1.2" fill="#F4F4F4" clip-path="url(#${id}t)" opacity=".9"></circle>`;
      }
    }
  }

  // The Kitchen design's apron, clipped to the torso like the shirt pattern.
  if (spec.apron) {
    o +=
      `<g clip-path="url(#${id}t)">` +
      `<path d="M47 67 L50 76 M73 67 L70 76" stroke="#2F6B3A" stroke-width="2.5" stroke-linecap="round"></path>` +
      `<path d="M47 76 H73 V86 H78 L80 110 H40 L42 86 H47 Z" fill="#3E8E4E" stroke="${OUTLINE}" stroke-width="2"></path>` +
      `<rect x="34" y="85" width="52" height="3" fill="#2F6B3A"></rect>` +
      `<rect x="52" y="93" width="16" height="9" rx="2" fill="none" stroke="#2F6B3A" stroke-width="1.8"></rect>` +
      `</g>`;
  }

  // Jacket/vest over the shirt.
  if (spec.jacket) {
    o += `<path d="M34 78 L34 110 L52 110 L54 72 L44 66 Z" fill="${spec.jacket}" stroke="${OUTLINE}" stroke-width="2.5"></path><path d="M86 78 L86 110 L68 110 L66 72 L76 66 Z" fill="${spec.jacket}" stroke="${OUTLINE}" stroke-width="2.5"></path>`;
  }

  // Sleeves/arms.
  const sleeve = spec.sleeveless ? sk : (spec.jacket ?? top);
  o +=
    `<rect x="24" y="70" width="12" height="30" rx="6" fill="${sleeve}" stroke="${OUTLINE}" stroke-width="2.5"></rect>` +
    `<rect x="84" y="70" width="12" height="30" rx="6" fill="${sleeve}" stroke="${OUTLINE}" stroke-width="2.5"></rect>` +
    `<circle cx="30" cy="101" r="5.5" fill="${sk}" stroke="${OUTLINE}" stroke-width="2"></circle>` +
    `<circle cx="90" cy="101" r="5.5" fill="${sk}" stroke="${OUTLINE}" stroke-width="2"></circle>`;

  // Collar.
  if (spec.collar === 'button') {
    o += `<path d="M52 66 L60 76 L68 66 L64 64 L60 70 L56 64 Z" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="1.5"></path>`;
  }
  if (spec.collar === 'polo') {
    o += `<path d="M53 66 L60 74 L67 66" fill="none" stroke="${OUTLINE}" stroke-width="2"></path>`;
  }
  if (spec.collar === 'zip') {
    o += `<path d="M60 66 V84" stroke="${OUTLINE}" stroke-width="2"></path><path d="M50 66 L60 72 L70 66" fill="none" stroke="${OUTLINE}" stroke-width="2"></path>`;
  }
  if (spec.collar === 'crew') {
    o += `<path d="M50 66 Q60 74 70 66" fill="none" stroke="${OUTLINE}" stroke-width="2"></path>`;
  }
  if (spec.collar === 'shirtLight') {
    o += `<path d="M48 66 L60 80 L72 66 L66 62 L60 72 L54 62 Z" fill="#BFD6EE" stroke="${OUTLINE}" stroke-width="1.5"></path>`;
  }
  if (spec.necklace) {
    o += `<path d="M50 68 Q60 80 70 68" fill="none" stroke="#d9dcdf" stroke-width="1.5"></path><circle cx="60" cy="79" r="2" fill="#d9dcdf"></circle>`;
  }

  // Neck + head.
  o += `<rect x="54" y="58" width="12" height="12" fill="${sk}"></rect>`;
  o += `<circle cx="60" cy="40" r="25" fill="${sk}" stroke="${OUTLINE}" stroke-width="2.5"></circle>`;

  // Ears.
  o += `<circle cx="36" cy="42" r="4" fill="${sk}" stroke="${OUTLINE}" stroke-width="2"></circle><circle cx="84" cy="42" r="4" fill="${sk}" stroke="${OUTLINE}" stroke-width="2"></circle>`;
  if (spec.earrings) {
    o += `<circle cx="36" cy="49" r="2.5" fill="${spec.earrings}"></circle><circle cx="84" cy="49" r="2.5" fill="${spec.earrings}"></circle>`;
  }

  // Hair on top.
  const style = spec.style;
  if (style === 'spiky') {
    o += `<path d="M36 34 C34 22 40 12 46 16 L50 8 L54 16 L60 6 L66 16 L70 8 L74 16 C80 12 86 22 84 34 C76 24 44 24 36 34 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path>`;
  }
  if (style === 'short') {
    o += `<path d="M35 36 C34 18 46 12 60 12 C74 12 86 18 85 36 C80 26 40 26 35 36 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path>`;
  }
  if (style === 'shortDark') {
    o += `<path d="M35 34 C32 14 48 8 62 10 C78 12 88 18 85 34 C80 24 40 22 35 34 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path>`;
  }
  if (style === 'buzz') {
    o += `<path d="M37 30 C40 20 50 16 60 16 C70 16 80 20 83 30 C76 26 44 26 37 30 Z" fill="${hc}" opacity=".55"></path>`;
  }
  if (style === 'sideSwept') {
    o += `<path d="M35 36 C33 16 50 10 66 12 C80 14 86 22 85 34 C78 30 70 22 60 26 C52 30 44 34 35 36 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path>`;
  }
  if (style === 'wavyLong') {
    o += `<path d="M34 40 C32 18 48 10 60 12 C74 12 88 18 86 40 C82 30 74 24 60 26 C48 26 40 30 34 40 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path>`;
  }
  if (style === 'curlyLong') {
    o += `<path d="M34 40 C30 16 50 8 62 12 C76 12 90 18 86 40 C82 30 74 24 60 26 C48 26 40 30 34 40 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path><circle cx="40" cy="26" r="6" fill="${hc}"></circle><circle cx="80" cy="26" r="6" fill="${hc}"></circle>`;
  }
  if (style === 'texturedLong') {
    o += `<path d="M33 42 C30 18 48 9 60 11 C74 10 90 18 87 42 Q86 33 80 33 Q77 25 70 28 Q64 22 58 27 Q50 22 46 30 Q38 29 33 42 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path>`;
  }
  if (style === 'straightLong') {
    o += `<path d="M34 42 C32 16 50 10 62 12 C76 12 88 18 86 42 C82 30 72 26 60 26 C48 26 40 30 34 42 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path>`;
  }
  if (style === 'highBun') {
    o += `<path d="M35 38 C33 20 44 12 60 12 C76 12 87 20 85 38 C80 28 40 28 35 38 Z" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></path><path d="M42 30 Q60 22 78 30 M44 25 Q60 18 76 25 M50 20 Q60 15 70 20" fill="none" stroke="#161719" stroke-width="1.2" opacity=".35"></path>`;
    o += `<rect x="52" y="11" width="16" height="5" rx="2.5" fill="#00BDFF" stroke="${OUTLINE}" stroke-width="1.5"></rect>`;
    o += `<circle cx="60" cy="2" r="11" fill="${hc}" stroke="${OUTLINE}" stroke-width="2.5"></circle>`;
    for (const [cx, cy] of [
      [52, -3],
      [60, -7],
      [68, -3],
      [50, 5],
      [70, 5],
      [60, 8],
      [56, 1],
      [64, 1],
    ]) {
      o += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${hc}" stroke="${OUTLINE}" stroke-width="1.6"></circle>`;
    }
    for (const [cx, cy] of [
      [52, -3],
      [60, -7],
      [68, -3],
      [60, 1],
    ]) {
      o += `<path d="M${cx - 2} ${cy} a2 2 0 1 1 4 0" fill="none" stroke="#161719" stroke-width="1" opacity=".5"></path>`;
    }
    o += `<path d="M37 40 q-4 4 -1 8 q3 3 5 -1 M83 40 q4 4 1 8 q-3 3 -5 -1" fill="none" stroke="${hc}" stroke-width="2.5" stroke-linecap="round"></path>`;
  }
  if (style === 'bald') {
    o += `<ellipse cx="52" cy="24" rx="6" ry="3" fill="#fff" opacity=".35"></ellipse>`;
  }
  if (spec.greys) {
    o += `<path d="M40 24 q6 -6 12 -8 M48 18 q8 -5 16 -6 M74 20 q5 3 8 8 M38 32 q3 -4 6 -6" fill="none" stroke="#B3B6C9" stroke-width="2" stroke-linecap="round" opacity=".85"></path>`;
  }

  // Dotted stubble: the Room designs draw it before the eyes and mouth,
  // unlike humans.js's beards, which go over the mouth.
  if (spec.beard === 'dotStubble') {
    o += `<path d="M38 47 Q42 64 60 64.5 Q78 64 82 47 Q77 57 68 57 Q60 55 52 57 Q43 57 38 47 Z" fill="#8A7A6E" opacity=".22"></path>`;
    for (const [cx, cy] of [
      [42, 52],
      [45, 56],
      [48, 59],
      [52, 61],
      [56, 62],
      [60, 62.5],
      [64, 62],
      [68, 61],
      [72, 59],
      [75, 56],
      [78, 52],
      [44, 54],
      [50, 60],
      [70, 60],
      [76, 54],
      [54, 57.5],
      [66, 57.5],
      [58, 59],
      [62, 59],
    ]) {
      o += `<circle cx="${cx}" cy="${cy}" r=".7" fill="#5A4A3E" opacity=".55"></circle>`;
    }
  }

  // Eyebrows, eyes.
  o += `<path d="M46 34 L54 33 M66 33 L74 34" stroke="${OUTLINE}" stroke-width="2" stroke-linecap="round"></path>`;
  o += `<circle cx="51" cy="41" r="2.4" fill="#161719"></circle><circle cx="69" cy="41" r="2.4" fill="#161719"></circle>`;

  // Mouth.
  if (spec.mouth === 'flat') {
    o += `<path d="M52 54 L68 54" stroke="${OUTLINE}" stroke-width="2.5" stroke-linecap="round"></path>`;
  } else if (spec.mouth === 'smirk') {
    o += `<path d="M52 53 Q62 58 68 52" fill="none" stroke="${OUTLINE}" stroke-width="2.5" stroke-linecap="round"></path>`;
  } else if (spec.mouth === 'sip') {
    o += `<circle cx="60" cy="54" r="3" fill="${OUTLINE}"></circle>`;
  } else {
    o += `<path d="M50 51 Q60 60 70 51" fill="none" stroke="${OUTLINE}" stroke-width="2.5" stroke-linecap="round"></path>`;
  }
  if (spec.teeth) {
    o += `<path d="M52 52 Q60 58 68 52 Z" fill="#F4F4F4"></path>`;
  }

  // Facial hair.
  if (spec.beard === 'full') {
    o += `<path d="M38 44 C38 66 48 72 60 72 C72 72 82 66 82 44 C80 58 74 62 60 62 C46 62 40 58 38 44 Z" fill="${spec.beardColor ?? hc}" stroke="${OUTLINE}" stroke-width="2"></path><path d="M50 51 Q60 60 70 51" fill="none" stroke="${OUTLINE}" stroke-width="2.5"></path>`;
  }
  if (spec.beard === 'stubble') {
    o += `<path d="M40 46 C42 62 50 66 60 66 C70 66 78 62 80 46 C76 56 70 58 60 58 C50 58 44 56 40 46 Z" fill="${hc}" opacity=".35"></path>`;
  }

  // Glasses.
  if (spec.glasses === 'rect') {
    o += `<rect x="41" y="35" width="16" height="12" rx="2.5" fill="none" stroke="#161719" stroke-width="2.5"></rect><rect x="63" y="35" width="16" height="12" rx="2.5" fill="none" stroke="#161719" stroke-width="2.5"></rect><line x1="57" y1="40" x2="63" y2="40" stroke="#161719" stroke-width="2.5"></line>`;
  }
  if (spec.glasses === 'thin') {
    o += `<rect x="42" y="36" width="15" height="10" rx="2" fill="none" stroke="#161719" stroke-width="1.8"></rect><rect x="63" y="36" width="15" height="10" rx="2" fill="none" stroke="#161719" stroke-width="1.8"></rect><line x1="57" y1="40" x2="63" y2="40" stroke="#161719" stroke-width="1.8"></line>`;
  }
  if (spec.glasses === 'sun') {
    o += `<path d="M40 36 H58 V44 Q58 48 52 48 H46 Q40 48 40 44 Z" fill="#161719" stroke="#161719" stroke-width="2"></path><path d="M62 36 H80 V44 Q80 48 74 48 H68 Q62 48 62 44 Z" fill="#161719" stroke="#161719" stroke-width="2"></path><line x1="58" y1="38" x2="62" y2="38" stroke="#161719" stroke-width="2.5"></line>`;
  }
  if (spec.glasses === 'roundBrown') {
    o += `<circle cx="49" cy="41" r="8" fill="none" stroke="#a5683a" stroke-width="2.5"></circle><circle cx="71" cy="41" r="8" fill="none" stroke="#a5683a" stroke-width="2.5"></circle><line x1="57" y1="40" x2="63" y2="40" stroke="#a5683a" stroke-width="2.5"></line>`;
  }

  // Hat.
  if (spec.hat === 'chef') {
    o += `<path d="M36 26 L36 14 C34 2 50 0 56 8 C62 -2 80 0 84 10 C90 4 92 18 84 22 L84 26 Z" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="2.5"></path><rect x="34" y="22" width="52" height="8" rx="2" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="2.5"></rect>`;
  }
  if (spec.hat === 'toque') {
    o +=
      `<path d="M40 22 C27 21 23 5 35 1 C34 -10 49 -13 54 -5 C58 -14 73 -13 75 -4 C86 -9 96 4 86 12 C92 16 88 23 80 22 Z" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="2.5"></path>` +
      `<path d="M49 21 Q46 9 51 -2 M61 21 Q60 7 64 -5 M72 21 Q73 10 79 2" fill="none" stroke="#B3B6C9" stroke-width="1.6" stroke-linecap="round"></path>` +
      `<rect x="36" y="19" width="48" height="12" rx="2" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="2.5"></rect>` +
      `<path d="M44 20 V30 M52 20 V30 M60 20 V30 M68 20 V30 M76 20 V30" stroke="#B3B6C9" stroke-width="1.4"></path>`;
  }
  if (spec.hat === 'survivor') {
    o += `<path d="M35 28 L85 28 L85 36 L35 36 Z" fill="#E07A2F" stroke="${OUTLINE}" stroke-width="1.5"></path><path d="M40 30 q10 3 20 0 q10 -3 20 0" fill="none" stroke="#F2C12E" stroke-width="1.5"></path><path d="M84 30 L92 26 L96 40 L90 44 Z" fill="#E07A2F" stroke="${OUTLINE}" stroke-width="1.5"></path>`;
  }
  // humans.js draws the tee's "SURVIVOR" as Anton `<text>`; here it's the
  // pre-baked outline (`text-paths.ts`), since a texture can't use web fonts.
  if (spec.tee === 'survivor') {
    const tee = NPC_TEXT_PATHS.survivorTee;
    o += `<path d="${tee.d}" fill="${tee.fill}" clip-path="url(#${id}t)"></path><path d="M48 96 q12 4 24 0" fill="none" stroke="#E07A2F" stroke-width="1.5" clip-path="url(#${id}t)"></path>`;
  }
  if (spec.hat === 'headphones') {
    o += `<path d="M32 40 C30 14 90 14 88 40" fill="none" stroke="${OUTLINE}" stroke-width="5"></path><rect x="26" y="34" width="11" height="17" rx="4" fill="#00BDFF" stroke="${OUTLINE}" stroke-width="2"></rect><rect x="83" y="34" width="11" height="17" rx="4" fill="#00BDFF" stroke="${OUTLINE}" stroke-width="2"></rect>`;
  }

  // Prop.
  if (spec.prop === 'tieHeadband') {
    o += `<path d="M35 30 L85 30 L85 37 L35 37 Z" fill="#1f2a4a" stroke="${OUTLINE}" stroke-width="1.5"></path><path d="M78 30 L86 34 L84 76 L76 74 Z" fill="#1f2a4a" stroke="${OUTLINE}" stroke-width="1.5"></path>`;
  }
  if (spec.prop === 'scarf') {
    o += `<path d="M40 66 L60 78 L80 66 L80 74 L60 88 L40 74 Z" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="2"></path>`;
    for (let i = 0; i < 5; i += 1) {
      o += `<path d="M${42 + i * 8} 67 L${48 + i * 8} 84" stroke="${i % 2 ? '#d65a8a' : '#1f2a4a'}" stroke-width="2" opacity=".8"></path>`;
    }
    o += `<path d="M60 80 L70 108 L56 106 Z" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="2"></path>`;
  }
  if (spec.prop === 'squish') {
    o += `<ellipse cx="22" cy="96" rx="16" ry="14" fill="#F2A33A" stroke="${OUTLINE}" stroke-width="2"></ellipse><ellipse cx="22" cy="86" rx="14" ry="6" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="2"></ellipse><rect x="20" y="70" width="4" height="14" fill="#2fb59a"></rect><circle cx="17" cy="97" r="1.5" fill="#161719"></circle><path d="M24 97 q3 -2 6 0" stroke="#161719" stroke-width="1.5" fill="none"></path>`;
  }
  if (spec.prop === 'coffee') {
    o += `<rect x="88" y="86" width="16" height="16" rx="3" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="2"></rect><path d="M104 90 h5 v8 h-5" fill="none" stroke="${OUTLINE}" stroke-width="2"></path><path d="M93 82 q2 -4 0 -8 M98 82 q2 -4 0 -8" stroke="#B3B6C9" stroke-width="1.5" fill="none"></path>`;
  }
  if (spec.prop === 'spatula') {
    o += `<rect x="12" y="74" width="6" height="26" rx="2" fill="#0C4B5F"></rect><rect x="8" y="64" width="14" height="14" rx="2" fill="#d9dcdf" stroke="${OUTLINE}" stroke-width="2"></rect><ellipse cx="15" cy="62" rx="8" ry="3" fill="#c9a266" stroke="${OUTLINE}" stroke-width="1.5"></ellipse>`;
  }
  if (spec.prop === 'laptop') {
    o += `<rect x="86" y="84" width="22" height="14" rx="2" fill="#2f3338" stroke="${OUTLINE}" stroke-width="2"></rect><rect x="88" y="86" width="18" height="10" fill="#0a3d4d"></rect><polygon points="97,89 100,91 97,93" fill="#00BDFF"></polygon>`;
  }
  if (spec.prop === 'clipboard') {
    o += `<rect x="86" y="82" width="18" height="24" rx="2" fill="#d9dcdf" stroke="${OUTLINE}" stroke-width="2"></rect><rect x="92" y="79" width="6" height="5" fill="${OUTLINE}"></rect><path d="M90 90 h10 M90 95 h10 M90 100 h6" stroke="${OUTLINE}" stroke-width="1.5"></path>`;
  }
  if (spec.prop === 'camera') {
    o += `<rect x="84" y="82" width="26" height="18" rx="3" fill="#161719" stroke="${OUTLINE}" stroke-width="2"></rect><rect x="90" y="78" width="10" height="5" rx="1" fill="#161719" stroke="${OUTLINE}" stroke-width="1.5"></rect><circle cx="97" cy="91" r="6" fill="#0a3d4d" stroke="#00BDFF" stroke-width="2"></circle><circle cx="97" cy="91" r="2.5" fill="#00BDFF"></circle><rect x="104" y="85" width="3" height="3" fill="#D63C3C"></rect>`;
  }
  if (spec.prop === 'chicken') {
    o += `<ellipse cx="20" cy="98" rx="11" ry="9" fill="#F2C12E" stroke="${OUTLINE}" stroke-width="2"></ellipse><path d="M14 90 Q10 74 18 70 Q24 76 22 90" fill="#F2C12E" stroke="${OUTLINE}" stroke-width="2"></path><circle cx="19" cy="73" r="6" fill="#F2C12E" stroke="${OUTLINE}" stroke-width="2"></circle><polygon points="24,73 32,75 24,77" fill="#E07A2F"></polygon><path d="M17 67 q2 -6 5 0 q2 -5 4 1" fill="#D63C3C"></path><circle cx="21" cy="72" r="1.3" fill="#161719"></circle><path d="M8 106 l-4 6 M12 106 l-2 7" stroke="#E07A2F" stroke-width="2.5" stroke-linecap="round"></path>`;
  }
  if (spec.prop === 'hobbyhorse') {
    o += `<rect x="18" y="56" width="5" height="68" rx="2" fill="#C9A366" stroke="${OUTLINE}" stroke-width="1.5"></rect><path d="M8 58 C2 58 0 46 8 40 L26 42 C32 46 30 58 22 60 Z" fill="#8A5A2B" stroke="${OUTLINE}" stroke-width="2.5"></path><path d="M6 40 L10 30 L14 41 Z M14 40 L19 29 L23 41 Z" fill="#8A5A2B" stroke="${OUTLINE}" stroke-width="2"></path><path d="M12 40 Q24 36 28 50" fill="none" stroke="#3b2a1a" stroke-width="4" stroke-linecap="round"></path><circle cx="8" cy="48" r="2" fill="#161719"></circle><path d="M4 54 q4 2 8 0" stroke="#161719" stroke-width="1.5" fill="none"></path><path d="M14 50 Q20 54 26 50" fill="none" stroke="#D63C3C" stroke-width="2"></path><circle cx="20" cy="126" r="4" fill="#3b2a1a" stroke="${OUTLINE}" stroke-width="1.5"></circle>`;
  }
  if (spec.prop === 'fishingRod') {
    const bait = NPC_TEXT_PATHS.freeBait;
    o +=
      `<path d="M92 96 L118 10" stroke="#C9A366" stroke-width="3.5" stroke-linecap="round"></path>` +
      `<circle cx="95" cy="92" r="4" fill="#161719" stroke="${OUTLINE}" stroke-width="1.5"></circle>` +
      `<path d="M118 10 L118 70" stroke="#F4F4F4" stroke-width="1.2"></path>` +
      `<path d="M118 70 q0 8 -6 6" stroke="#B3B6C9" stroke-width="1.5" fill="none"></path>` +
      `<rect x="108" y="72" width="20" height="14" rx="2" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="1.5"></rect>` +
      `<path d="M108 72 L118 80 L128 72" stroke="${OUTLINE}" stroke-width="1.5" fill="none"></path>` +
      `<path d="${bait.d}" fill="${bait.fill}"></path>`;
  }
  if (spec.prop === 'beyblade') {
    o += `<circle cx="18" cy="96" r="11" fill="#00BDFF" stroke="#F4F4F4" stroke-width="3"></circle><circle cx="18" cy="96" r="4" fill="#161719"></circle><path d="M18 85 L18 107 M7 96 L29 96 M10 88 L26 104 M26 88 L10 104" stroke="#161719" stroke-width="1.5"></path><circle cx="102" cy="96" r="11" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="3"></circle><circle cx="102" cy="96" r="4" fill="#161719"></circle><path d="M102 85 L102 107 M91 96 L113 96 M94 88 L110 104 M110 88 L94 104" stroke="${OUTLINE}" stroke-width="1.5"></path>`;
  }

  // Resting poses of the Room designs' animated props (#113).
  if (spec.cameraRig) {
    o +=
      `<rect x="40" y="70" width="40" height="26" rx="4" fill="#161719" stroke="${OUTLINE}" stroke-width="2.5"></rect>` +
      `<circle cx="60" cy="83" r="9" fill="#2f3338" stroke="${OUTLINE}" stroke-width="2"></circle>` +
      `<circle cx="60" cy="83" r="4" fill="#0a3d4d"></circle>` +
      `<rect x="66" y="66" width="10" height="6" rx="1" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="1.5"></rect>`;
  }
  if (spec.cards) {
    o +=
      `<g transform="translate(96 84) rotate(-12)">` +
      `<rect x="0" y="0" width="16" height="22" rx="2" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="1.5"></rect>` +
      `<rect x="3" y="-3" width="16" height="22" rx="2" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="1.5"></rect>` +
      `<rect x="6" y="-6" width="16" height="22" rx="2" fill="#F4F4F4" stroke="${OUTLINE}" stroke-width="1.5"></rect>` +
      `<path d="M14 -1 l2 3 l-2 3 l-2 -3 z" fill="#00BDFF"></path>` +
      `</g>`;
  }
  if (spec.marker) {
    const { arm, hand, color } = spec.marker;
    o +=
      `<path d="M92 78 L112 56" stroke="${arm}" stroke-width="6" stroke-linecap="round"></path>` +
      `<circle cx="113" cy="54" r="5.5" fill="${hand}" stroke="${OUTLINE}" stroke-width="2"></circle>` +
      `<rect x="110" y="44" width="6" height="14" rx="2" fill="${color}" stroke="${OUTLINE}" stroke-width="1.5"></rect>`;
  }
  // Keep this last: it wraps everything drawn so far (`o`) in the seated
  // offset, so any part added after it wouldn't sit with the figure.
  if (spec.seated === 'laptop') {
    // The whole figure sits 14 px lower, a lap over its legs.
    o =
      `<g transform="translate(0 14)">` +
      o +
      `<path d="M30 104 Q60 92 90 104 L96 112 Q60 122 24 112 Z" fill="#1d1f22" stroke="${OUTLINE}" stroke-width="2"></path>` +
      `<rect x="18" y="106" width="16" height="8" rx="4" fill="#0f1012" stroke="${OUTLINE}" stroke-width="2"></rect>` +
      `<rect x="86" y="106" width="16" height="8" rx="4" fill="#0f1012" stroke="${OUTLINE}" stroke-width="2"></rect>` +
      `<rect x="44" y="84" width="32" height="20" rx="2" fill="#2f3338" stroke="${OUTLINE}" stroke-width="2"></rect>` +
      `<rect x="47" y="87" width="26" height="14" fill="#0a3d4d"></rect>` +
      `<rect x="50" y="90" width="14" height="2" fill="#00BDFF"></rect>` +
      `<rect x="50" y="94" width="10" height="2" fill="#00BDFF" opacity=".6"></rect>` +
      `<rect x="42" y="103" width="36" height="3" fill="#161719" stroke="${OUTLINE}" stroke-width="1.5"></rect>` +
      `</g>`;
  }

  return o;
}

let nextId = 0;

/**
 * Renders `spec` as a standalone SVG string in the same 120x130 design box
 * and padded frame as `renderPenguinSvg` (#31), anchored at the feet the
 * same way (#36 D2). `options.idPrefix`, when given, guarantees unique
 * `clipPath` ids the way `renderPenguinSvg`'s own option does.
 */
export function renderNpcSvg(spec: HumanFigureSpec, options: { idPrefix?: string } = {}): string {
  nextId += 1;
  const idPrefix = options.idPrefix ?? `auto-${nextId}`;
  return inNpcFrame(renderHumanFigure(spec, idPrefix));
}

/**
 * Renders one of #113's NPC prop layers (design markup in the figure's own
 * 120x130 viewBox units, e.g. Anthony's rod) as a standalone SVG in the
 * same padded frame as `renderNpcSvg`, so the two textures line up when
 * both are anchored at the feet.
 */
export function renderNpcPropSvg(markup: string): string {
  return inNpcFrame(markup);
}

function inNpcFrame(content: string): string {
  const minX = -PENGUIN_FRAME_PADDING_X;
  const minY = -PENGUIN_FRAME_PADDING_Y;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${PENGUIN_FRAME_WIDTH} ${PENGUIN_FRAME_HEIGHT}" width="${PENGUIN_FRAME_WIDTH}" height="${PENGUIN_FRAME_HEIGHT}">${content}</svg>`;
}
