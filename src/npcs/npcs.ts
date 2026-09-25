import { DEFAULT_LOOK, type MinigameId, type PenguinLook, type RoomId } from '../contracts';
import type { HumanFigureSpec } from '../game/npcs/render-npc-svg';

/**
 * Every NPC slot id on `main` (#16's five prototype Rooms' `npcSlots`,
 * confirmed against `src/game/rooms/definitions/*.ts` at the #36 scope-change
 * comment's `main` @ `5ddaaae`). No slot id lacked a matching character in
 * `design/Characters.dc.html`/`design/build/humans.js` or a Room design's own
 * inline SVG (Front Desk, Kevin, Tristin, Chef Chelsea, Tonya, Jesse are all
 * named, drawn Penguin-kind background characters in their own Room's
 * `.dc.html`, just not part of "the 24 humans" character sheet).
 */
export type NpcId =
  | 'darrin'
  | 'jon'
  | 'sydney'
  | 'front-desk'
  | 'ashley'
  | 'ian'
  | 'steven'
  | 'dom'
  | 'ryan'
  | 'sam'
  | 'kevin'
  | 'ann-marie'
  | 'millie'
  | 'josh'
  | 'brandon'
  | 'anthony'
  | 'tristin'
  | 'casey'
  | 'chef-chelsea'
  | 'chelsea'
  | 'tonya'
  | 'jesse';

/** Ian's Bug Squash / Chelsea's Pancake Flip trigger dialog (#36 D4). */
export interface NpcMinigameDialog {
  kind: 'minigame';
  minigameId: MinigameId;
  /** `design/Minigame Bug Squash.dc.html` / `design/Minigame Pancake Flip.dc.html`'s own button copy. */
  actionLabel: string;
  declineLabel: string;
}

/** Casey's Igloo Gear stall trigger (#36 D4/D5; #40 isn't built, so this stays a logged no-op until then). */
export interface NpcStallDialog {
  kind: 'stall';
  stallId: string;
}

/** Every other NPC: its idle line and a close button, nothing else. */
export interface NpcLineDialog {
  kind: 'line';
}

export type NpcDialog = NpcMinigameDialog | NpcStallDialog | NpcLineDialog;

interface NpcDefinitionBase {
  id: NpcId;
  name: string;
  /** `null` where the design shows "TITLE TBD" (or `design/build/humans.js`'s
   *  equivalent unresolved `title` placeholder, "ROLE TBD · SEND ME THIS ONE"). */
  title: string | null;
  /** The Room whose `npcSlots` place this NPC (#36 D1: derived from #16's
   *  Room definitions, not duplicated as a tile here). */
  roomId: RoomId;
  idleLine: string;
  dialog: NpcDialog;
}

/** A Human NPC (`design/build/humans.js`'s figures), rendered by `render-npc-svg.ts`. */
export interface HumanNpcDefinition extends NpcDefinitionBase {
  kind: 'human';
  figure: HumanFigureSpec;
}

/** A Penguin-kind NPC (a background/market/kitchen Penguin in the design, not a Player), rendered by `renderPenguinSvg` with a fixed look. */
export interface PenguinNpcDefinition extends NpcDefinitionBase {
  kind: 'penguin';
  look: PenguinLook;
}

export type NpcDefinition = HumanNpcDefinition | PenguinNpcDefinition;

const BUG_SQUASH_DIALOG: NpcMinigameDialog = {
  kind: 'minigame',
  minigameId: 'bug-squash',
  actionLabel: 'GRAB THE HAMMER',
  declineLabel: 'NOT MY TICKET',
};

const PANCAKE_FLIP_DIALOG: NpcMinigameDialog = {
  kind: 'minigame',
  minigameId: 'pancake-flip',
  actionLabel: 'GRAB THE SPATULA',
  declineLabel: 'I BURN TOAST',
};

const IGLOO_GEAR_STALL_DIALOG: NpcStallDialog = { kind: 'stall', stallId: 'igloo-gear' };

const LINE_DIALOG: NpcLineDialog = { kind: 'line' };

/**
 * The fixed look most background/market Penguin-kind NPCs share (Front Desk,
 * Kevin, Chef Chelsea, Tonya, Jesse): traced from their shared `peng()`-style
 * figure markup in the Room designs -- `#161719` body, `#00BDFF`
 * cap/beak/feet, `#F4F4F4` belly, the `JG CAP` hat silhouette. Exact per-NPC
 * fidelity beyond that (e.g. a chef's hat) isn't attempted; a judgment call,
 * the same kind the #16 execution plan already documents for market fixtures.
 */
const MARKET_PENGUIN_LOOK: PenguinLook = { ...DEFAULT_LOOK, name: '' };

/** Tristin's figure uses the design's `#3a4046`/`#0C4B5F` grey-blue Penguin body/cap instead. */
const TRISTIN_LOOK: PenguinLook = { ...DEFAULT_LOOK, name: '', body: '#3a4046', cap: '#0C4B5F' };

/**
 * `NPCS`: every prototype Room's NPC, keyed by `NpcId` (#36 D1). Names,
 * titles and idle lines come from `design/build/humans.js`'s `PEOPLE` array
 * (the structured data the character sheet and Room figures are themselves
 * built from) for the 16 Human NPCs, and from each Room's own `.dc.html`
 * inline speech-bubble/nameplate markup for the 6 Penguin-kind background
 * NPCs it draws (none of which appear in `design/Characters.dc.html`'s "24
 * humans" sheet).
 *
 * `design/build/humans.js` is preferred over `design/Characters.dc.html`
 * where the two disagree (#36 deviation, reported): `ryan` and `sam` are
 * "DJ · MUSIC TRACKS"/"MC · FREESTYLE" at "The Mullet (Mezzanine)" on the
 * character sheet, a Room outside this prototype's five, but
 * `design/build/humans.js` -- the file that actually renders every figure --
 * resolves both of them to ordinary Dev Pit developers ("WANDERING NPC · CODE
 * REVIEW"/"PAIR PROGRAMMER"), matching where #16's `devPit.npcSlots` actually
 * places them. The character sheet looks like a stale snapshot for these two;
 * `humans.js`'s data is used throughout.
 */
export const NPCS: Record<NpcId, NpcDefinition> = {
  darrin: {
    id: 'darrin',
    name: 'Darrin Jahnel',
    title: 'Founder & CEO',
    roomId: 'town-center',
    kind: 'human',
    idleLine: 'Show me energy.',
    dialog: LINE_DIALOG,
    figure: {
      style: 'short',
      hair: 'brown',
      skin: 'fair',
      top: '#BFD6EE',
      jacket: '#2a2f3a',
      collar: 'shirtLight',
      mouth: 'flat',
      prop: 'tieHeadband',
    },
  },
  jon: {
    id: 'jon',
    name: 'Jon Keller',
    title: 'President',
    roomId: 'town-center',
    kind: 'human',
    idleLine: 'Welcome to JG. Sunglasses stay on.',
    dialog: LINE_DIALOG,
    figure: {
      style: 'spiky',
      hair: 'dark',
      skin: 'light',
      top: '#BFD6EE',
      jacket: '#1f2a4a',
      collar: 'shirtLight',
      glasses: 'sun',
      mouth: 'smirk',
      prop: 'scarf',
    },
  },
  sydney: {
    id: 'sydney',
    name: 'Sydney Murauskas',
    title: 'Technical Recruiter',
    roomId: 'town-center',
    kind: 'human',
    idleLine: 'Welcome to JG HQ!',
    dialog: LINE_DIALOG,
    figure: {
      style: 'straightLong',
      hair: 'caramel',
      skin: 'med',
      top: '#1f2a4a',
      collar: 'crew',
      necklace: true,
      teeth: true,
      prop: 'clipboard',
    },
  },
  'front-desk': {
    id: 'front-desk',
    name: 'Front Desk',
    title: null,
    roomId: 'town-center',
    kind: 'penguin',
    idleLine: 'Welcome to JG HQ!',
    dialog: LINE_DIALOG,
    look: MARKET_PENGUIN_LOOK,
  },
  ashley: {
    id: 'ashley',
    name: 'Ashley Schuliger',
    title: 'Developer',
    roomId: 'dev-pit',
    kind: 'human',
    idleLine: 'The chicken stays. Non-negotiable.',
    dialog: LINE_DIALOG,
    figure: {
      style: 'wavyLong',
      hair: 'brown',
      skin: 'fair',
      top: '#161719',
      collar: 'crew',
      teeth: true,
      prop: 'chicken',
    },
  },
  ian: {
    id: 'ian',
    name: 'Ian Ballard',
    title: 'VP of Engineering',
    roomId: 'dev-pit',
    kind: 'human',
    idleLine: 'Who broke CI? Be honest.',
    dialog: BUG_SQUASH_DIALOG,
    figure: {
      style: 'bald',
      hair: 'brown',
      skin: 'fair',
      top: '#161719',
      collar: 'polo',
      beard: 'full',
      teeth: true,
      prop: 'laptop',
    },
  },
  steven: {
    id: 'steven',
    name: 'Steven Zgaljic',
    title: 'CTO',
    roomId: 'dev-pit',
    kind: 'human',
    idleLine: 'Architecture question. Ready?',
    dialog: LINE_DIALOG,
    figure: {
      style: 'shortDark',
      hair: 'dark',
      skin: 'med',
      top: '#2B3557',
      pattern: 'dots',
      jacket: '#161719',
      collar: 'crew',
      beard: 'full',
      mouth: 'smirk',
      greys: true,
    },
  },
  dom: {
    id: 'dom',
    name: 'Dom Favata',
    title: 'Developer',
    roomId: 'dev-pit',
    kind: 'human',
    idleLine: 'p95 is spicy today.',
    dialog: LINE_DIALOG,
    figure: {
      style: 'short',
      hair: 'brown',
      skin: 'fair',
      top: '#C9B48E',
      collar: 'zip',
      teeth: true,
      prop: 'laptop',
    },
  },
  ryan: {
    id: 'ryan',
    name: 'Ryan',
    title: 'Developer',
    roomId: 'dev-pit',
    kind: 'human',
    idleLine: 'LGTM. One nit.',
    dialog: LINE_DIALOG,
    figure: {
      style: 'short',
      hair: 'brown',
      skin: 'fair',
      top: '#0C4B5F',
      collar: 'crew',
      beard: 'stubble',
      mouth: 'smirk',
      prop: 'laptop',
    },
  },
  sam: {
    id: 'sam',
    name: 'Sam',
    title: 'Developer',
    roomId: 'dev-pit',
    kind: 'human',
    idleLine: 'Have you tried turning it off?',
    dialog: LINE_DIALOG,
    figure: {
      style: 'spiky',
      hair: 'dark',
      skin: 'med',
      top: '#00BDFF',
      collar: 'crew',
      glasses: 'thin',
      teeth: true,
      prop: 'coffee',
    },
  },
  kevin: {
    id: 'kevin',
    name: 'Kevin',
    title: null,
    roomId: 'roof-deck',
    kind: 'penguin',
    idleLine: 'Hexles bounce. 800 tokens.',
    dialog: LINE_DIALOG,
    look: MARKET_PENGUIN_LOOK,
  },
  'ann-marie': {
    id: 'ann-marie',
    name: 'Ann Marie Berdar',
    title: null,
    roomId: 'roof-deck',
    kind: 'human',
    idleLine: 'That cap? Totally your color.',
    dialog: LINE_DIALOG,
    figure: {
      style: 'wavyLong',
      hair: 'lblond',
      skin: 'med',
      top: '#F2C12E',
      jacket: '#7A2A8C',
      collar: 'crew',
      necklace: true,
      teeth: true,
    },
  },
  millie: {
    id: 'millie',
    name: 'Millie Elliott',
    title: 'Team Lead',
    roomId: 'roof-deck',
    kind: 'human',
    idleLine: 'Quick question before you go in.',
    dialog: LINE_DIALOG,
    figure: {
      style: 'highBun',
      hair: 'dark',
      skin: 'med',
      top: '#8C7A80',
      jacket: '#1f2a4a',
      collar: 'crew',
      necklace: true,
      teeth: true,
    },
  },
  josh: {
    id: 'josh',
    name: 'Josh Cantor-Stone',
    title: 'Senior Project Manager',
    roomId: 'roof-deck',
    kind: 'human',
    idleLine: 'Pumpkin spice is a lifestyle.',
    dialog: LINE_DIALOG,
    figure: {
      style: 'bald',
      hair: 'dark',
      skin: 'fair',
      top: '#161719',
      collar: 'crew',
      glasses: 'roundBrown',
      beard: 'full',
      mouth: 'sip',
      prop: 'squish',
    },
  },
  brandon: {
    id: 'brandon',
    name: 'Brandon Badgett',
    title: 'Senior Vice President',
    roomId: 'roof-deck',
    kind: 'human',
    idleLine: "Giddy up. Arcade's this way.",
    dialog: LINE_DIALOG,
    figure: {
      style: 'sideSwept',
      hair: 'dark',
      skin: 'fair',
      top: '#1f2a4a',
      pattern: 'stripes',
      pattern2: '#D63C3C',
      collar: 'crew',
      beard: 'stubble',
      mouth: 'smirk',
      prop: 'hobbyhorse',
    },
  },
  anthony: {
    id: 'anthony',
    name: 'Anthony Conway',
    title: 'Director of IT',
    roomId: 'roof-deck',
    kind: 'human',
    idleLine: 'Would you click this link? Wrong.',
    dialog: LINE_DIALOG,
    figure: {
      style: 'shortDark',
      hair: 'dark',
      skin: 'light',
      top: '#4a4f57',
      collar: 'button',
      beard: 'stubble',
      teeth: true,
      prop: 'laptop',
    },
  },
  tristin: {
    id: 'tristin',
    name: 'Tristin',
    title: null,
    roomId: 'roof-deck',
    kind: 'penguin',
    idleLine: "It's 12° out here.",
    dialog: LINE_DIALOG,
    look: TRISTIN_LOOK,
  },
  casey: {
    id: 'casey',
    name: 'Casey Snow',
    title: 'Developer',
    roomId: 'roof-deck',
    kind: 'human',
    idleLine: 'Snow by name. Snowcones by trade.',
    dialog: IGLOO_GEAR_STALL_DIALOG,
    figure: {
      style: 'straightLong',
      hair: 'sandy',
      skin: 'fair',
      top: '#2FB59A',
      pattern: 'stripes',
      pattern2: '#F4F4F4',
      collar: 'crew',
      necklace: true,
      teeth: true,
      hat: 'headphones',
    },
  },
  'chef-chelsea': {
    id: 'chef-chelsea',
    name: 'Chef Chelsea',
    title: null,
    roomId: 'the-melt',
    kind: 'penguin',
    idleLine: 'Fresh pot!',
    dialog: LINE_DIALOG,
    look: MARKET_PENGUIN_LOOK,
  },
  chelsea: {
    id: 'chelsea',
    name: 'Chelsea Merrill',
    title: null,
    roomId: 'the-melt',
    kind: 'human',
    idleLine: 'Flip it NOW.',
    dialog: PANCAKE_FLIP_DIALOG,
    figure: {
      style: 'curlyLong',
      hair: 'blond',
      skin: 'fair',
      top: '#161719',
      pattern: 'stripes',
      sleeveless: true,
      glasses: 'rect',
      earrings: '#F06A5A',
      teeth: true,
      prop: 'spatula',
      hat: 'chef',
    },
  },
  tonya: {
    id: 'tonya',
    name: 'Tonya',
    title: null,
    roomId: 'the-melt',
    kind: 'penguin',
    idleLine: 'who took my yogurt',
    dialog: LINE_DIALOG,
    look: MARKET_PENGUIN_LOOK,
  },
  jesse: {
    id: 'jesse',
    name: 'Jesse',
    title: null,
    roomId: 'the-melt',
    kind: 'penguin',
    // No idle line is drawn in `design/Room 04 Kitchen.dc.html` for Jesse
    // (every other background Penguin there has one); reported on #36 rather
    // than left unset, since `NpcDefinition.idleLine` is required.
    idleLine: 'Order up!',
    dialog: LINE_DIALOG,
    look: MARKET_PENGUIN_LOOK,
  },
};

const NPC_IDS = Object.keys(NPCS) as NpcId[];

function isNpcId(id: string): id is NpcId {
  return (NPC_IDS as string[]).includes(id);
}

/** Looks up an NPC by a Room slot's loosely-typed `npcId` string. */
export function getNpcDefinition(id: string): NpcDefinition | undefined {
  return isNpcId(id) ? NPCS[id] : undefined;
}
