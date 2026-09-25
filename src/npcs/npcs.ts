import { DEFAULT_LOOK, type MinigameId, type PenguinLook, type RoomId } from '../contracts';
import type { HumanFigureSpec } from '../game/npcs/render-npc-svg';

/**
 * Every NPC slot id on `main` (#16's five prototype Rooms' `npcSlots`,
 * confirmed against `src/game/rooms/definitions/*.ts`). No slot id lacked a
 * matching character in `design/Characters.dc.html`/`design/build/humans.js`
 * or a Room design's own inline SVG (Front Desk, Kevin, Tristin, Tonya,
 * Jesse are all named, drawn Penguin-kind background characters in their own
 * Room's `.dc.html`, just not part of "the 24 humans" character sheet).
 * `tom` replaces the old `chef-chelsea` slot -- #91's Kitchen design resync
 * removed Chef Chelsea entirely and introduced Tom instead (#36 round-1
 * follow-up).
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
  | 'tom'
  | 'chelsea'
  | 'tonya'
  | 'jesse';

/**
 * A minigame-launching NPC's trigger dialog (#36 D4; round-1 review item 4
 * adds `triggerLine`/`subtitle`, the minigame design's own trigger-phase
 * quote and "ROOM · ROLE"/"ROOM · GAME" badge next to the NPC's name,
 * verbatim from that minigame's own design file: Ian/Bug Squash
 * (`design/Minigame Bug Squash.dc.html`), Chelsea/Pancake Flip
 * (`design/Minigame Pancake Flip.dc.html`), Josh/Snow Cone Stand
 * (`design/Minigame Snow Cone Stand.dc.html`) and Tom/Coffee Rush
 * (`design/Minigame Coffee Rush.dc.html`) (#36 round-2 review item 1).
 */
export interface NpcMinigameDialog {
  kind: 'minigame';
  minigameId: MinigameId;
  /** The minigame design's own trigger-screen button copy. */
  actionLabel: string;
  declineLabel: string;
  /** The minigame design's own trigger-phase paragraph. */
  triggerLine: string;
  /** The minigame design's own name-badge text (e.g. "DEV PIT · VP OF ENGINEERING"). */
  subtitle: string;
}

/** Casey's Igloo Gear stall trigger (#36 D4/D5, wired to #40's real Market panel). */
export interface NpcStallDialog {
  kind: 'stall';
  stallId: string;
}

/** Every other NPC: its dialog line and a close button, nothing else. */
export interface NpcLineDialog {
  kind: 'line';
}

export type NpcDialog = NpcMinigameDialog | NpcStallDialog | NpcLineDialog;

/**
 * One line of an NPC's idle speech-bubble cycle, ported from a Room design's
 * own `say`-style CSS animation (`design/Room 01 Town Center.dc.html` and
 * siblings) (#36 round-1 review item 2/3b): `periodS` is the animation's own
 * duration, and `delayS` is its CSS `animation-delay` (typically negative,
 * "already elapsed at load"), both normalized onto the shared 7%-26%-of-
 * period visible window Dev Pit's and Roof Deck's generic `@keyframes say`
 * use (Town Center's own per-NPC keyframes -- `sayDarrin`, `saySyd`, `sayJon`
 * -- are converted to an equivalent delay under that same window, so every
 * NPC's cycle uses one shared render-side timing model).
 *
 * `periodS: 0` means the design shows this line statically, with no cycling
 * at all (Front Desk, and every The Melt NPC -- `design/Room 04
 * Kitchen.dc.html` has zero `animation:say` occurrences).
 */
export interface NpcBubbleLine {
  text: string;
  periodS: number;
  delayS: number;
}

interface NpcDefinitionBase {
  id: NpcId;
  /** The character sheet's full name (#36 round-1 review item 1); shown in the dialog panel. */
  name: string;
  /**
   * `null` where `design/Characters.dc.html`'s footnote (line ~217) lists the
   * NPC as still "TITLE TBD" (Chelsea, Tom, Dom, Ashley, Emily, Millie,
   * Casey, Ryan, Sam), or where a Penguin-kind background NPC has no title at
   * all. `design/build/humans.js`'s own `title` field is used only for
   * figure-adjacent flavor and is NOT authoritative here -- it resolves
   * several of these to a guessed title ("Developer", "Team Lead") the sheet
   * itself still marks unresolved; the sheet wins per D1/A3 (#36 round-1
   * review item 1).
   */
  title: string | null;
  /** The Room whose `npcSlots` place this NPC (#36 D1: derived from #16's
   *  Room definitions, not duplicated as a tile here). */
  roomId: RoomId;
  /**
   * The in-Room nameplate text (#36 round-1 review item 5): Dev Pit and Roof
   * Deck use first names ("Ian", "Kevin"); Town Center and The Melt use full
   * names ("Darrin Jahnel", "Chelsea Merrill"), per each Room design's own
   * nameplate markup.
   */
  tagName: string;
  /** The idle speech-bubble cycle, from the Room design's own `say` bubbles. */
  idleLines: NpcBubbleLine[];
  /**
   * The line `npc-dialog.ts` shows for a `kind: 'line'` or `kind: 'stall'`
   * NPC's dialog panel: the character sheet's own short quote (distinct from
   * `idleLines` above, which is the Room design's separate in-World bubble
   * cycle). A `kind: 'minigame'` NPC's dialog uses `dialog.triggerLine`
   * instead.
   */
  dialogLine: string;
  dialog: NpcDialog;
  /**
   * A per-NPC horizontal nudge, layered on top of the tile-derived bubble
   * position. Two distinct reasons set this: Roof Deck's vendor stalls
   * (Kevin, Ann Marie, Josh, Casey) float their speech bubble left of their
   * own nameplate/figure centre by exactly -90px (#36 round-1 review item
   * 3c; traced directly from the Room design's own bubble-vs-nameplate x
   * offset). Dev Pit's row-1/row-5 NPCs sat close enough after #92's D3
   * round 2 resync (Ian/Dom one tile apart; Ryan/Steven/Sam two tiles apart
   * each) that their bubbles visibly overlapped -- confirmed via an e2e
   * screenshot -- so those are spread apart by a nudge instead (`ian`/`dom`
   * and `ryan`/`sam`'s own doc comments).
   */
  bubbleOffsetX?: number;
  /**
   * A per-NPC vertical nudge (more negative floats the bubble higher),
   * layered on top of the shared head-top offset every NPC otherwise uses.
   * Only set where deriving a screen position from `npcs.ts`'s own tile
   * grid (rather than the design's exact, hand-placed pixel layout) pushed
   * two NPCs' Room elements close enough to visually collide: e.g. Tristin's
   * bubble and Millie's nameplate, confirmed via an e2e screenshot to
   * overlap (#36 round-1 review item 3's overlap check) even though the
   * source design's own pixel coordinates for the two don't.
   */
  bubbleOffsetY?: number;
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
  triggerLine:
    "CI is red. Something's crawling through the test suite and I've got a 2 o'clock. Grab the hammer, squash what you find. 500 points and I'll put you on the Exterminator wall.",
  subtitle: 'DEV PIT · VP OF ENGINEERING',
};

const PANCAKE_FLIP_DIALOG: NpcMinigameDialog = {
  kind: 'minigame',
  minigameId: 'pancake-flip',
  actionLabel: 'GRAB THE SPATULA',
  declineLabel: 'I BURN TOAST',
  triggerLine:
    'Batter is mixed, griddle is hot, and Tom keeps eating the burnt ones. Watch the color and flip on GOLDEN. Twenty on the stack and you are in the Breakfast Club.',
  subtitle: 'THE MELT · PANCAKE FLIP',
};

/** Josh's Snow Cone Stand trigger dialog (#36 round-2 review item 1a; #49's own design, verbatim from `design/Minigame Snow Cone Stand.dc.html`). */
const SNOW_CONE_DIALOG: NpcMinigameDialog = {
  kind: 'minigame',
  minigameId: 'snow-cone-stand',
  actionLabel: 'WORK A SHIFT',
  declineLabel: 'MAYBE LATER',
  triggerLine:
    "Line's getting long and I've got a pumpkin spice to finish. Work a shift at the stand? Tokens are yours. 200 in one shift and I'll throw in a badge.",
  subtitle: 'SNACKS · SENIOR PROJECT MANAGER',
};

/** Tom's Coffee Rush trigger dialog (#36 round-2 review item 1b; #50's own design, verbatim from `design/Minigame Coffee Rush.dc.html`). */
const COFFEE_RUSH_DIALOG: NpcMinigameDialog = {
  kind: 'minigame',
  minigameId: 'coffee-rush',
  actionLabel: 'GRAB THE POT',
  declineLabel: 'JUST HERE FOR COFFEE',
  triggerLine:
    'Fresh pot is on and the line is out the door. You pour, I supervise. Fifteen good cups before the pot runs dry and the Barista badge is yours.',
  subtitle: 'THE MELT · COFFEE RUSH',
};

const IGLOO_GEAR_STALL_DIALOG: NpcStallDialog = { kind: 'stall', stallId: 'igloo-gear' };

const LINE_DIALOG: NpcLineDialog = { kind: 'line' };

/** A single static line, for the NPCs whose Room design shows no `say` cycling animation at all. */
function staticLine(text: string): NpcBubbleLine[] {
  return [{ text, periodS: 0, delayS: 0 }];
}

/**
 * The fixed look most background/market Penguin-kind NPCs share (Front Desk,
 * Kevin, Tonya, Jesse): traced from their shared `peng()`-style
 * figure markup in the Room designs -- `#161719` body, `#00BDFF`
 * cap/beak/feet, `#F4F4F4` belly, the `JG CAP` hat silhouette. Exact per-NPC
 * fidelity beyond that (e.g. a chef's hat) isn't attempted; a judgment call,
 * the same kind the #16 execution plan already documents for market fixtures.
 */
const MARKET_PENGUIN_LOOK: PenguinLook = { ...DEFAULT_LOOK, name: '' };

/** Tristin's figure uses the design's `#3a4046`/`#0C4B5F` grey-blue Penguin body/cap instead. */
const TRISTIN_LOOK: PenguinLook = { ...DEFAULT_LOOK, name: '', body: '#3a4046', cap: '#0C4B5F' };

/**
 * `NPCS`: every prototype Room's NPC, keyed by `NpcId` (#36 D1). Names come
 * from `design/Characters.dc.html`'s character sheet (D1/A3); titles come
 * from the same sheet, with `null` for every "TITLE TBD" card its footnote
 * lists (Chelsea, Dom, Ashley, Millie, Casey, Ryan, Sam, Tom) plus Ann
 * Marie's own resolved "SUBSCRIPTION AI" (#36 round-1 review item 1).
 * `design/build/humans.js`'s figure `spec`s are used for the Human NPCs'
 * rendered figures only, never for name/title. `idleLines` come from each
 * Room design's own `say`-cycling (or static) speech bubbles (round-1 item
 * 2), and `dialogLine` is the sheet's own short quote, shown in the dialog
 * panel instead.
 *
 * The 5 Penguin-kind background NPCs (Front Desk, Kevin, Tristin, Tonya,
 * Jesse) are named, drawn characters in their own Room's
 * `.dc.html` inline SVG but never appear in the character sheet's "24
 * humans" -- their name/line/tag all come from that inline markup instead.
 */
export const NPCS: Record<NpcId, NpcDefinition> = {
  darrin: {
    id: 'darrin',
    name: 'Darrin Jahnel',
    title: 'Founder & CEO',
    roomId: 'town-center',
    kind: 'human',
    tagName: 'Darrin Jahnel',
    dialogLine: 'Show me energy.',
    idleLines: [
      { text: "LET'S GO! Who's shipping today?!", periodS: 11, delayS: -0.22 },
      { text: 'YOU. ARE. CRUSHING IT.', periodS: 11, delayS: -5.28 },
    ],
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
    tagName: 'Jon Keller',
    dialogLine: 'Welcome to JG. Sunglasses stay on.',
    idleLines: [{ text: 'Wanna see a magic trick?', periodS: 14, delayS: -1.68 }],
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
    tagName: 'Sydney Murauskas',
    dialogLine: 'Welcome to JG HQ!',
    idleLines: [
      { text: 'Look what we won!', periodS: 24, delayS: -3.36 },
      { text: 'Serve. Grind. Grow. Inspire.', periodS: 24, delayS: -12.72 },
    ],
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
    tagName: 'Front Desk',
    dialogLine: 'Welcome to JG HQ!',
    idleLines: staticLine('Welcome to JG HQ!'),
    dialog: LINE_DIALOG,
    look: MARKET_PENGUIN_LOOK,
  },
  ashley: {
    id: 'ashley',
    name: 'Ashley Schuliger',
    title: null,
    roomId: 'dev-pit',
    kind: 'human',
    tagName: 'Ashley',
    dialogLine: 'The chicken stays. Non-negotiable.',
    idleLines: [
      { text: 'Incoming!', periodS: 9, delayS: -4.2 },
      { text: 'Most spirited. Deal with it.', periodS: 14, delayS: -5 },
      { text: 'Catch!', periodS: 14, delayS: -9.5 },
    ],
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
    tagName: 'Ian',
    dialogLine: 'Who broke CI? Be honest.',
    idleLines: [
      { text: 'Who broke CI? Be honest.', periodS: 22, delayS: -1 },
      { text: 'Grab the hammer. CI is red.', periodS: 22, delayS: -10 },
    ],
    // #92 D3 round 2 moved Ian to (1,5) and Dom to (2,5), one tile apart
    // (confirmed via an e2e screenshot to overlap at their derived screen
    // position): nudged apart horizontally, opposite Dom's own +80 below.
    // 80, not 70 (#36 round-2 review item 4): the minimum that clears their
    // bubble rects at the shared bubble-width ceiling (`npc-sprite.ts`'s own
    // `MAX_BUBBLE_WIDTH`) while still spanning Ian's own tile x, confirmed by
    // `npcs.test.ts`'s geometric bubble-rect check.
    bubbleOffsetX: -80,
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
    tagName: 'Steven',
    dialogLine: 'Architecture question. Ready?',
    idleLines: [
      { text: 'Boxes and arrows. Mostly arrows.', periodS: 14, delayS: -2 },
      { text: 'This diagram scales. Trust me.', periodS: 14, delayS: -9 },
    ],
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
    title: null,
    roomId: 'dev-pit',
    kind: 'human',
    tagName: 'Dom',
    dialogLine: 'p95 is spicy today.',
    idleLines: [
      { text: 'Parkour!', periodS: 18, delayS: -1 },
      { text: 'Dashboards are lava.', periodS: 18, delayS: -7 },
      { text: 'Do not tell facilities.', periodS: 18, delayS: -13 },
    ],
    // See Ian's own bubbleOffsetX note above -- the two are one tile apart.
    bubbleOffsetX: 80,
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
    name: 'Ryan Shendler',
    title: null,
    roomId: 'dev-pit',
    kind: 'human',
    tagName: 'Ryan',
    dialogLine: 'LGTM. One nit.',
    idleLines: [
      { text: 'LGTM. One nit.', periodS: 20, delayS: -2 },
      { text: 'This diagram is load-bearing.', periodS: 20, delayS: -8 },
      { text: 'Whiteboard is the real repo.', periodS: 20, delayS: -14 },
    ],
    // #92 D3 round 2's row-1 trio (Ryan, Steven, Sam) sit only 2 tiles apart
    // each (confirmed via an e2e screenshot to overlap): Ryan and Sam nudged
    // apart from Steven in the middle, opposite Sam's own +100 below.
    // 100, not 110 (#36 round-2 review item 4): 110 pushed the bubble rect
    // (at `npc-sprite.ts`'s own `MAX_BUBBLE_WIDTH` ceiling) fully past Ryan's
    // own tile x, so its rect no longer spanned him; 100 is the exact value
    // both constraints allow here, confirmed by `npcs.test.ts`'s geometric
    // bubble-rect check.
    bubbleOffsetX: -100,
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
    name: 'Sam Schantz',
    title: null,
    roomId: 'dev-pit',
    kind: 'human',
    tagName: 'Sam',
    dialogLine: 'Have you tried turning it off?',
    idleLines: [
      { text: 'Have you tried turning it off?', periodS: 20, delayS: -4 },
      { text: 'Drawing the architecture. Again.', periodS: 20, delayS: -11 },
      { text: 'Ship it Friday. What could go wrong.', periodS: 20, delayS: -17 },
    ],
    // See Ryan's own bubbleOffsetX note above -- the row-1 trio sit close together.
    bubbleOffsetX: 100,
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
    tagName: 'Kevin',
    dialogLine: 'Hexles bounce. 800 tokens.',
    idleLines: [
      { text: 'Hexles bounce. 800 tokens.', periodS: 13, delayS: -2 },
      { text: 'They bite. Gently.', periodS: 13, delayS: -9 },
    ],
    bubbleOffsetX: -90,
    dialog: LINE_DIALOG,
    look: MARKET_PENGUIN_LOOK,
  },
  'ann-marie': {
    id: 'ann-marie',
    name: 'Ann Marie Berdar',
    title: 'SUBSCRIPTION AI',
    roomId: 'roof-deck',
    kind: 'human',
    tagName: 'Ann Marie',
    dialogLine: 'That cap? Totally your color.',
    idleLines: [{ text: 'Try it on!', periodS: 12, delayS: -6 }],
    bubbleOffsetX: -90,
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
    title: null,
    roomId: 'roof-deck',
    kind: 'human',
    tagName: 'Millie',
    dialogLine: 'Quick question before you go in.',
    idleLines: [{ text: 'Team lead perk: free cone.', periodS: 20, delayS: -7 }],
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
    tagName: 'Josh',
    dialogLine: 'Pumpkin spice is a lifestyle.',
    idleLines: [
      { text: 'Snowcones are 15!', periodS: 11, delayS: -3 },
      { text: 'Pumpkin spice, obviously.', periodS: 11, delayS: -8.5 },
    ],
    bubbleOffsetX: -90,
    dialog: SNOW_CONE_DIALOG,
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
    tagName: 'Brandon',
    dialogLine: "Giddy up. Arcade's this way.",
    idleLines: [
      { text: 'Giddy up!', periodS: 26, delayS: -2 },
      { text: 'Does it come in horse?', periodS: 26, delayS: -10 },
      { text: 'Yeehaw. Hexle time.', periodS: 26, delayS: -18 },
    ],
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
    tagName: 'Anthony',
    dialogLine: 'Would you click this link? Wrong.',
    idleLines: [
      { text: 'Catch of the day: your password.', periodS: 28, delayS: -2 },
      { text: 'Never click the bait!', periodS: 28, delayS: -11 },
      { text: 'Reel talk: check the sender.', periodS: 28, delayS: -20 },
    ],
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
    tagName: 'Tristin',
    dialogLine: "It's 12° out here.",
    idleLines: [
      { text: "It's 12° out here.", periodS: 24, delayS: -1 },
      { text: 'Worth it for snacks.', periodS: 24, delayS: -13 },
    ],
    // Confirmed via an e2e screenshot: at his own tile's derived screen
    // position, Tristin's bubble overlapped Millie's nameplate (they sit far
    // apart on the design's own hand-placed canvas, but close together once
    // both are projected from `roofDeck.npcSlots`' tile grid). Nudged up to
    // clear it.
    bubbleOffsetY: -60,
    dialog: LINE_DIALOG,
    look: TRISTIN_LOOK,
  },
  casey: {
    id: 'casey',
    name: 'Casey Snow',
    title: null,
    roomId: 'roof-deck',
    kind: 'human',
    tagName: 'Casey',
    dialogLine: 'Snow by name. Snowcones by trade.',
    idleLines: [
      { text: 'Roof igloo: BYO fish.', periodS: 12, delayS: -4 },
      { text: 'New gear drops Friday.', periodS: 12, delayS: -10 },
    ],
    bubbleOffsetX: -90,
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
  tom: {
    id: 'tom',
    // design/Characters.dc.html: "TOM O'NEILL". Figure spec from
    // design/build/humans.js's `tom` entry. Chef Chelsea no longer appears
    // in the design (#91's Kitchen resync); Tom replaces her npcSlot.
    name: "Tom O'Neill",
    title: null,
    roomId: 'the-melt',
    kind: 'human',
    tagName: 'Tom',
    dialogLine: 'Fresh pot. Do not touch.',
    idleLines: [
      { text: 'Fresh pot. Do not touch.', periodS: 16, delayS: -1 },
      { text: 'Coffee run?', periodS: 16, delayS: -6 },
      { text: 'This is my fourth. Fifth. Whatever.', periodS: 16, delayS: -11 },
    ],
    dialog: COFFEE_RUSH_DIALOG,
    figure: {
      style: 'sideSwept',
      hair: 'sandy',
      skin: 'fair',
      top: '#6E86A8',
      pattern: 'stripes',
      pattern2: '#9FB3CC',
      collar: 'button',
      glasses: 'rect',
      teeth: true,
      prop: 'coffee',
    },
  },
  chelsea: {
    id: 'chelsea',
    name: 'Chelsea Merrill',
    title: null,
    roomId: 'the-melt',
    kind: 'human',
    tagName: 'Chelsea',
    dialogLine: 'Flip it NOW.',
    idleLines: [
      { text: 'Flip it NOW.', periodS: 13, delayS: 0 },
      { text: 'GOLDEN. Not before.', periodS: 13, delayS: -4.5 },
      { text: 'Tom, stop eating the burnt ones.', periodS: 13, delayS: -9 },
    ],
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
    tagName: 'Tonya',
    dialogLine: 'Clean your mug.',
    idleLines: [
      { text: 'Clean your mug.', periodS: 15, delayS: -5 },
      { text: 'I made the sign. I mean it.', periodS: 15, delayS: -12 },
    ],
    dialog: LINE_DIALOG,
    look: MARKET_PENGUIN_LOOK,
  },
  jesse: {
    id: 'jesse',
    name: 'Jesse',
    title: null,
    roomId: 'the-melt',
    kind: 'penguin',
    tagName: 'Jesse',
    dialogLine: 'Is this decaf? Be honest.',
    idleLines: [
      { text: 'Is this decaf? Be honest.', periodS: 15, delayS: -2 },
      { text: 'Snack drawer is a lie.', periodS: 15, delayS: -9 },
    ],
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
