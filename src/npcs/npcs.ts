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
  | 'jesse'
  // #51: the Icebox's NPCs. The id rule: a person's first Room gets the bare
  // id; each repeat appearance gets a `-<roomId-ish>` suffix, since an NPC
  // lives in exactly one Room (`roomId`) and two different people's slots
  // can't share one id. Millie and Darrin already have an npcSlot in another
  // Room (Roof Deck and Town Center respectively), so their Icebox
  // appearances are `millie-icebox`/`darrin-icebox`; Jason has no npcSlot
  // anywhere else, so the Icebox -- his first and only Room -- gets his bare
  // id, `jason`.
  | 'millie-icebox'
  | 'nicole'
  | 'jason'
  | 'jethro'
  | 'darrin-icebox'
  // #51: the Hallway's, Team Rooms 1-4's and the Bathroom's NPCs, by the same
  // rule. Emily, Michael Prete, Michael S., Samantha, Daniel and Jessie have
  // no slot anywhere else, so they get bare ids; everyone else is a repeat
  // appearance with a `-<room>` suffix.
  | 'michael-s'
  | 'samantha'
  | 'daniel'
  | 'emily'
  | 'anthony-hallway'
  | 'jethro-team-room-1'
  | 'dom-team-room-1'
  | 'ian-team-room-2'
  | 'millie-team-room-3'
  | 'casey-team-room-3'
  | 'sydney-team-room-3'
  | 'michael'
  | 'sam-team-room-4'
  | 'ryan-team-room-4'
  | 'jessie'
  // #113: Town Center's Jory Hutchins, on the couch. Her first Room.
  | 'jory';

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
 * "already elapsed at load"). `window` is the fraction of the period the line
 * is fully shown, from the design's own keyframes; it defaults to the shared
 * 7%-26% of the generic `@keyframes say` most Rooms use, and only Town
 * Center's per-NPC keyframes (`sayDarrin`, `saySyd`, `sayJon`, `sayJory`) set
 * their own (#113). `bubbleSchedule()` turns all three into show times.
 *
 * `periodS: 0` means the design shows this line statically, with no cycling
 * at all (Front Desk, and the static bubbles in the #51 Rooms). The Kitchen
 * cycles its lines with the generic `say` like the other Rooms (#91).
 */
export interface NpcBubbleLine {
  text: string;
  periodS: number;
  delayS: number;
  window?: readonly [start: number, end: number];
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
   * offset), and Dev Pit's Dom, one tile right of Ian, shifts his bubble
   * clear of Ian's nameplate (see `dom`).
   */
  bubbleOffsetX?: number;
  /**
   * A per-NPC vertical nudge (more negative floats the bubble higher),
   * layered on top of the layout's bubble position just above the nameplate
   * (`npc-layout.ts`). Only set where deriving a screen position from the
   * Room's tile grid (rather than the design's exact, hand-placed pixel
   * layout) puts two NPCs' bubbles on top of each other while both are
   * shown: `npcs.test.ts`'s time-aware bubble check (#113) guards it.
   */
  bubbleOffsetY?: number;
  /**
   * `true` for an NPC its Room design draws without the shared `idle` bob
   * (#113: Dev Pit's Ian, Chelsea). Every other NPC bobs.
   */
  still?: boolean;
  /**
   * The idle bob's cycle in seconds, when the Room design's differs from the
   * shared 3 s (#113: the Icebox's `idle 1.1s`).
   */
  bobPeriodS?: number;
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

/**
 * Dev Pit's whiteboard markers (#113), verbatim from the design's raised-arm
 * `scribble` markup: Ryan's and Sam's cyan, Steven's red, each with its own
 * sleeve and hand colour as drawn.
 */
const DEV_PIT_CYAN_MARKER: HumanFigureSpec['marker'] = {
  arm: '#1f2a4a',
  hand: '#F3D3B8',
  color: '#00BDFF',
};
const DEV_PIT_RED_MARKER: HumanFigureSpec['marker'] = {
  arm: '#2B3557',
  hand: '#E4B896',
  color: '#D63C3C',
};

/** The Icebox design's faster shared bob (`animation:idle 1.1s`) for all five of its NPCs (#113). */
const ICEBOX_BOB_PERIOD_S = 1.1;

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

/**
 * The Hallway's Michael S. and the Bathroom's Jessie (#51): the shared
 * `peng()` figure with a `#F4F4F4` cap, per their Room designs' own markup.
 */
const WHITE_CAP_PENGUIN_LOOK: PenguinLook = { ...DEFAULT_LOOK, name: '', cap: '#F4F4F4' };

/** Tristin's figure uses the design's `#3a4046`/`#0C4B5F` grey-blue Penguin body/cap instead. */
const TRISTIN_LOOK: PenguinLook = { ...DEFAULT_LOOK, name: '', body: '#3a4046', cap: '#0C4B5F' };

/**
 * Darrin Jahnel's figure, shared by his Town Center (`darrin`) and Icebox
 * (`darrin-icebox`) appearances (#51 review fix 3): the same person, the same
 * `humans.js` spec, pulled into one constant so the two copies can't drift.
 */
const DARRIN_FIGURE: HumanFigureSpec = {
  style: 'short',
  hair: 'brown',
  skin: 'fair',
  top: '#BFD6EE',
  jacket: '#2a2f3a',
  collar: 'shirtLight',
  mouth: 'flat',
  prop: 'tieHeadband',
};

/**
 * Millie Elliott's figure, shared by her Roof Deck (`millie`) and Icebox
 * (`millie-icebox`) appearances (#51 review fix 3): the same person, the same
 * `humans.js` spec, pulled into one constant so the two copies can't drift.
 */
const MILLIE_FIGURE: HumanFigureSpec = {
  style: 'highBun',
  hair: 'dark',
  skin: 'med',
  top: '#8C7A80',
  jacket: '#1f2a4a',
  collar: 'crew',
  necklace: true,
  teeth: true,
};

/**
 * Ian Ballard's figure, shared by Dev Pit (`ian`) and Team Room 2
 * (`ian-team-room-2`) (#51): the same person, the same `humans.js` spec, in
 * one constant so the copies can't drift.
 */
const IAN_FIGURE: HumanFigureSpec = {
  style: 'bald',
  hair: 'brown',
  skin: 'fair',
  top: '#161719',
  collar: 'polo',
  // Both his Rooms' designs (Dev Pit, Team Room 2) draw light dotted stubble,
  // not humans.js's full beard (#113).
  beard: 'dotStubble',
  teeth: true,
  prop: 'laptop',
};

/**
 * Dom Favata's figure, shared by Dev Pit (`dom`) and Team Room 1
 * (`dom-team-room-1`) (#51): the same person, the same `humans.js` spec, in
 * one constant so the copies can't drift.
 */
const DOM_FIGURE: HumanFigureSpec = {
  style: 'short',
  hair: 'brown',
  skin: 'fair',
  top: '#C9B48E',
  collar: 'zip',
  teeth: true,
  prop: 'laptop',
};

/**
 * Sydney Murauskas's figure, shared by Town Center (`sydney`) and Team Room 3
 * (`sydney-team-room-3`) (#51): the same person, the same `humans.js` spec,
 * in one constant so the copies can't drift.
 */
const SYDNEY_FIGURE: HumanFigureSpec = {
  style: 'straightLong',
  hair: 'caramel',
  skin: 'med',
  top: '#1f2a4a',
  collar: 'crew',
  necklace: true,
  teeth: true,
  prop: 'clipboard',
};

/**
 * Casey Snow's figure, shared by Roof Deck (`casey`) and Team Room 3
 * (`casey-team-room-3`) (#51): the same person, the same `humans.js` spec, in
 * one constant so the copies can't drift.
 */
const CASEY_FIGURE: HumanFigureSpec = {
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
};

/**
 * Sam Schantz's figure, shared by Dev Pit (`sam`) and Team Room 4
 * (`sam-team-room-4`) (#51): the same person, the same `humans.js` spec, in
 * one constant so the copies can't drift.
 */
const SAM_FIGURE: HumanFigureSpec = {
  style: 'spiky',
  hair: 'dark',
  skin: 'med',
  top: '#00BDFF',
  collar: 'crew',
  glasses: 'thin',
  teeth: true,
  prop: 'coffee',
};

/**
 * Ryan Shendler's figure, shared by Dev Pit (`ryan`) and Team Room 4
 * (`ryan-team-room-4`) (#51): the same person, the same `humans.js` spec, in
 * one constant so the copies can't drift.
 */
const RYAN_FIGURE: HumanFigureSpec = {
  style: 'short',
  hair: 'brown',
  skin: 'fair',
  top: '#0C4B5F',
  collar: 'crew',
  beard: 'stubble',
  mouth: 'smirk',
  prop: 'laptop',
};

/**
 * Anthony Conway's figure, shared by Roof Deck (`anthony`) and the Hallway
 * (`anthony-hallway`) (#51): the same person, the same `humans.js` spec, in
 * one constant so the copies can't drift.
 */
const ANTHONY_FIGURE: HumanFigureSpec = {
  style: 'shortDark',
  hair: 'dark',
  skin: 'light',
  top: '#4a4f57',
  collar: 'button',
  beard: 'stubble',
  teeth: true,
  prop: 'laptop',
};

/**
 * Jethro Breuer's figure, shared by the Icebox (`jethro`) and Team Room 1
 * (`jethro-team-room-1`) (#51): the same person, the same `humans.js` spec,
 * in one constant so the copies can't drift.
 */
const JETHRO_FIGURE: HumanFigureSpec = {
  style: 'short',
  hair: 'ash',
  skin: 'fair',
  top: '#4a4f57',
  pattern: 'dots',
  collar: 'button',
  beard: 'full',
  beardColor: '#A85A2A',
  mouth: 'smirk',
  prop: 'camera',
};

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
    // `sayDarrin` (9%-28%) and `sayDarrin2` (55%-76%), 11 s, no delay.
    idleLines: [
      { text: "LET'S GO! Who's shipping today?!", periodS: 11, delayS: 0, window: [0.09, 0.28] },
      { text: 'YOU. ARE. CRUSHING IT.', periodS: 11, delayS: 0, window: [0.55, 0.76] },
    ],
    // His tile sits one screen row above Sydney's and Jory's, so his bubble
    // would overlap the top 5 px of theirs: lifted 8 px to clear them.
    bubbleOffsetY: -8,
    dialog: LINE_DIALOG,
    figure: DARRIN_FIGURE,
  },
  jon: {
    id: 'jon',
    name: 'Jon Keller',
    title: 'President',
    roomId: 'town-center',
    kind: 'human',
    tagName: 'Jon Keller',
    dialogLine: 'Welcome to JG. Sunglasses stay on.',
    // `sayJon` shows the same line twice per 14 s cycle: 19%-32% and 61%-74%.
    idleLines: [
      { text: 'Wanna see a magic trick?', periodS: 14, delayS: 0, window: [0.19, 0.32] },
      { text: 'Wanna see a magic trick?', periodS: 14, delayS: 0, window: [0.61, 0.74] },
    ],
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
      // Town Center's design puts three playing cards in his hand (`trick`).
      cards: true,
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
    // `saySyd` (21%-33%) and `saySyd2` (60%-84%), 24 s, no delay.
    idleLines: [
      { text: 'Look what we won!', periodS: 24, delayS: 0, window: [0.21, 0.33] },
      { text: 'Serve. Grind. Grow. Inspire.', periodS: 24, delayS: 0, window: [0.6, 0.84] },
    ],
    dialog: LINE_DIALOG,
    figure: SYDNEY_FIGURE,
  },
  // #113: Town Center's design draws Jory Hutchins on the couch with her own
  // nameplate and `sayJory` bubble. Name, title and dialog line from her
  // design/Characters.dc.html card; figure from humans.js's `hutchins`.
  jory: {
    id: 'jory',
    name: 'Jory Hutchins',
    title: 'Director of Career Development',
    roomId: 'town-center',
    kind: 'human',
    tagName: 'Jory Hutchins',
    dialogLine: 'The tribe has spoken.',
    // `sayJory` (63%-88%), 9 s, no delay.
    idleLines: [{ text: 'COUCH. IS. LAVA.', periodS: 9, delayS: 0, window: [0.63, 0.88] }],
    dialog: LINE_DIALOG,
    figure: {
      style: 'short',
      hair: 'brown',
      skin: 'fair',
      top: '#1f6b4a',
      collar: 'crew',
      glasses: 'rect',
      beard: 'stubble',
      teeth: true,
      hat: 'survivor',
      tee: 'survivor',
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
    // Ian (1,5) and Dom (2,5) stand one tile apart (#92 D3 round 2), so with
    // the design's layout (#113) Ian's bubble would overlap the top 5 px of
    // Dom's, which sits one screen row lower: lifted 8 px to clear it
    // (`npcs.test.ts`'s time-aware bubble check).
    bubbleOffsetY: -8,
    // Dev Pit's design draws him without the shared idle bob.
    still: true,
    dialog: BUG_SQUASH_DIALOG,
    figure: IAN_FIGURE,
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
      // Dev Pit's design raises a red whiteboard marker (`scribble`).
      marker: DEV_PIT_RED_MARKER,
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
    // One tile right of Ian (see his `bubbleOffsetY` note): shifted right so
    // his bubble clears Ian's nameplate, which now sits above Ian's head
    // (#113) right where Dom's bubble would otherwise be.
    bubbleOffsetX: 80,
    dialog: LINE_DIALOG,
    figure: DOM_FIGURE,
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
    // No nudge (#113): the row-1 trio (Ryan, Steven, Sam) sit two tiles
    // apart on a diagonal, one screen row (50 px) apart each, so their
    // one-line, design-height bubbles no longer overlap.
    dialog: LINE_DIALOG,
    // Dev Pit's design raises a cyan whiteboard marker (`scribble`); Team
    // Room 4's doesn't, so it's this entry's own override.
    figure: { ...RYAN_FIGURE, marker: DEV_PIT_CYAN_MARKER },
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
    dialog: LINE_DIALOG,
    // As Ryan's: the marker is Dev Pit's only.
    figure: { ...SAM_FIGURE, marker: DEV_PIT_CYAN_MARKER },
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
    idleLines: [
      { text: 'Cyan cap? 120 tokens.', periodS: 12, delayS: 0 },
      { text: 'Try it on!', periodS: 12, delayS: -6 },
    ],
    bubbleOffsetX: -90,
    // Her stall's tile sits one screen row above Millie's, so her bubble
    // would overlap the top 5 px of Millie's: lifted 8 px to clear it.
    bubbleOffsetY: -8,
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
    figure: MILLIE_FIGURE,
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
    // Roof Deck's design gives him a fishing rod baited with a "FREE $$$"
    // envelope instead of his laptop; the Hallway's keeps the laptop.
    figure: { ...ANTHONY_FIGURE, prop: 'fishingRod' },
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
    figure: CASEY_FIGURE,
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
      // The Kitchen design's green apron over the shirt.
      apron: true,
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
    // The Kitchen design draws her without the shared idle bob.
    still: true,
    dialog: PANCAKE_FLIP_DIALOG,
    figure: {
      // The Kitchen design's textured hair and pleated toque, not humans.js's
      // curls and puffy chef's hat.
      style: 'texturedLong',
      hair: 'blond',
      skin: 'fair',
      top: '#161719',
      pattern: 'stripes',
      sleeveless: true,
      glasses: 'rect',
      earrings: '#F06A5A',
      teeth: true,
      prop: 'spatula',
      hat: 'toque',
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
  // Spelled "Jesse" here, unlike the Bathroom's "Jessie" (see that entry's
  // own comment) -- a deliberate human decision to keep them as two separate
  // characters, not a typo to reconcile (#51).
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
  // #51: the Icebox's five NPCs. Names/titles from design/Characters.dc.html
  // (Millie is on its TITLE TBD list), figures from design/build/humans.js
  // (matching the figures design/Room 03 The Icebox.dc.html bakes for them),
  // and tags/`idleLines` from that Room design's own nameplates and
  // `animation:say` bubbles, verbatim. None of them triggers a Minigame: the
  // design's "ASK JETHRO FOR A PHOTO" panel is a photo mechanic outside #51.
  'millie-icebox': {
    id: 'millie-icebox',
    name: 'Millie Elliott',
    title: null,
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Millie',
    dialogLine: 'Quick question before you go in.',
    idleLines: [
      { text: 'Team lead question: who owns this?', periodS: 26, delayS: -3 },
      { text: 'Standup was 4 minutes. Record.', periodS: 26, delayS: -12 },
      { text: 'Trivia time. Door stays shut.', periodS: 26, delayS: -20 },
    ],
    bobPeriodS: ICEBOX_BOB_PERIOD_S,
    dialog: LINE_DIALOG,
    // The same figure as her Roof Deck appearance (`millie` above); shared
    // via the `MILLIE_FIGURE` constant so the two can't drift.
    figure: MILLIE_FIGURE,
  },
  nicole: {
    id: 'nicole',
    name: 'Nicole Roberts',
    title: 'Account Manager',
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Nicole',
    dialogLine: "The client loved it. Next one's at 2.",
    idleLines: [
      { text: 'Client call in 5. Shh.', periodS: 15, delayS: -2 },
      { text: 'Account manager mode: on.', periodS: 15, delayS: -7 },
      { text: 'Nope, that is billable.', periodS: 15, delayS: -12 },
    ],
    bobPeriodS: ICEBOX_BOB_PERIOD_S,
    dialog: LINE_DIALOG,
    // humans.js's spec, seated with a laptop on her lap as the Room design
    // draws her (#113).
    figure: {
      style: 'wavyLong',
      hair: 'lblond',
      skin: 'fair',
      top: '#161719',
      sleeveless: true,
      necklace: true,
      teeth: true,
      seated: 'laptop',
    },
  },
  jason: {
    id: 'jason',
    name: 'Jason Jahnel',
    title: 'COO',
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Jason',
    dialogLine: 'Answer three and you may pass.',
    idleLines: [
      { text: 'Stairs challenge. You are behind.', periodS: 26, delayS: -1 },
      { text: 'Three questions and you may pass.', periodS: 26, delayS: -10 },
      { text: 'Kickoff in 4:32. Sit.', periodS: 26, delayS: -18 },
    ],
    bobPeriodS: ICEBOX_BOB_PERIOD_S,
    dialog: LINE_DIALOG,
    figure: {
      style: 'buzz',
      hair: 'brown',
      skin: 'fair',
      top: '#F4F4F4',
      pattern: 'plaid',
      pattern2: '#8FB5D8',
      collar: 'button',
      glasses: 'thin',
      teeth: true,
    },
  },
  jethro: {
    id: 'jethro',
    name: 'Jethro Breuer',
    title: 'Director of Digital Media',
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Jethro',
    dialogLine: "Act natural. Camera's rolling.",
    idleLines: [
      { text: 'Act natural. Camera is rolling.', periodS: 21, delayS: -2 },
      { text: 'One more for the recap.', periodS: 21, delayS: -9 },
      { text: 'Say hackathon!', periodS: 21, delayS: -16 },
    ],
    bobPeriodS: ICEBOX_BOB_PERIOD_S,
    dialog: LINE_DIALOG,
    // The Icebox design straps a camera rig to his chest; Team Room 1's
    // doesn't, so it's this entry's own override.
    figure: { ...JETHRO_FIGURE, cameraRig: true },
  },
  'darrin-icebox': {
    id: 'darrin-icebox',
    name: 'Darrin Jahnel',
    title: 'Founder & CEO',
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Darrin',
    dialogLine: 'Show me energy.',
    idleLines: [
      { text: 'Show me energy.', periodS: 15, delayS: -1 },
      { text: 'Serve. Grind. Grow. Inspire.', periodS: 15, delayS: -6 },
      { text: 'Who is demoing first?', periodS: 15, delayS: -11 },
    ],
    bobPeriodS: ICEBOX_BOB_PERIOD_S,
    dialog: LINE_DIALOG,
    // The same figure as his Town Center appearance (`darrin` above); shared
    // via the `DARRIN_FIGURE` constant so the two can't drift.
    figure: DARRIN_FIGURE,
  },
  // #51: the Hallway's, Team Rooms 1-4's and the Bathroom's NPCs. Names and
  // titles from design/Characters.dc.html (Emily, Dom, Millie, Casey, Ryan and
  // Sam are on its TITLE TBD list), figures from design/build/humans.js, and
  // tags/`idleLines` from each Room design's own nameplates and bubbles,
  // verbatim. A repeat appearance shares its person's figure constant and
  // dialog line. Static bubbles are `periodS: 0`; Team Room 1's and Team
  // Room 3's custom keyframes are re-expressed under the shared 7% show
  // window (see each entry). Only Ian's Team Room 2 slot shows a Minigame
  // trigger ("TALK · BUG SQUASH"); Team Room 4's Beystadium is not a
  // Minigame in this build.
  'michael-s': {
    id: 'michael-s',
    // A Penguin-kind background NPC: name, tag and line from the Hallway
    // design's own nameplate and bubble.
    name: 'Michael S.',
    title: null,
    roomId: 'office-hallway',
    kind: 'penguin',
    tagName: 'Michael S.',
    dialogLine: 'standup in 5',
    idleLines: staticLine('standup in 5'),
    dialog: LINE_DIALOG,
    look: WHITE_CAP_PENGUIN_LOOK,
  },
  // Samantha and Daniel (#51 human decision 2026-09-25, superseding an
  // earlier "excluded, Players not NPCs" call): silent Penguin NPCs, one of
  // the banner's "4 PENGUINS" along with "You" and Michael S. The design
  // gives them no bubble of their own, so `idleLines` is empty and their
  // dialog is `LINE_DIALOG` with an empty `dialogLine`, showing just their
  // name and a close button.
  samantha: {
    id: 'samantha',
    name: 'Samantha',
    title: null,
    roomId: 'office-hallway',
    kind: 'penguin',
    tagName: 'Samantha',
    dialogLine: '',
    idleLines: [],
    dialog: LINE_DIALOG,
    // The design's own `#0C4B5F` dark teal cap, in place of the default cyan.
    look: { ...DEFAULT_LOOK, name: '', cap: '#0C4B5F' },
  },
  daniel: {
    id: 'daniel',
    name: 'Daniel',
    title: null,
    roomId: 'office-hallway',
    kind: 'penguin',
    tagName: 'Daniel',
    dialogLine: '',
    idleLines: [],
    dialog: LINE_DIALOG,
    // The design's own cap is the same default cyan as "You"'s own Penguin.
    look: { ...DEFAULT_LOOK, name: '' },
  },
  emily: {
    id: 'emily',
    name: 'Emily Smith',
    title: null,
    roomId: 'office-hallway',
    kind: 'human',
    tagName: 'Emily Smith',
    dialogLine: 'Ever thought about joining JG?',
    idleLines: staticLine('Joining JG?'),
    // One tile from Anthony, one screen row above him, and both bubbles are
    // always shown: lifted 8 px to clear the top of his.
    bubbleOffsetY: -8,
    dialog: LINE_DIALOG,
    figure: {
      style: 'wavyLong',
      hair: 'blond',
      skin: 'fair',
      top: '#D63C8A',
      sleeveless: true,
      mouth: 'smirk',
      necklace: true,
    },
  },
  'anthony-hallway': {
    id: 'anthony-hallway',
    name: 'Anthony Conway',
    title: 'Director of IT',
    roomId: 'office-hallway',
    kind: 'human',
    tagName: 'Anthony Conway',
    dialogLine: 'Would you click this link? Wrong.',
    idleLines: staticLine('Is this link safe?'),
    dialog: LINE_DIALOG,
    figure: ANTHONY_FIGURE,
  },
  'jethro-team-room-1': {
    id: 'jethro-team-room-1',
    name: 'Jethro Breuer',
    title: 'Director of Digital Media',
    roomId: 'team-room-1',
    kind: 'human',
    tagName: 'Jethro',
    dialogLine: "Act natural. Camera's rolling.",
    // `jtalk 4s`, shown from 38%: (0.38 - 0.07) * 4 = 1.24s, i.e. -2.76s.
    idleLines: [{ text: "Act natural. Camera's rolling.", periodS: 4, delayS: -2.76 }],
    dialog: LINE_DIALOG,
    figure: JETHRO_FIGURE,
  },
  'dom-team-room-1': {
    id: 'dom-team-room-1',
    name: 'Dom Favata',
    title: null,
    roomId: 'team-room-1',
    kind: 'human',
    tagName: 'Dom',
    dialogLine: 'p95 is spicy today.',
    // `domtalk 6s`, shown from 39%: (0.39 - 0.07) * 6 = 1.92s, i.e. -4.08s.
    idleLines: [{ text: 'you gotta be faster than that', periodS: 6, delayS: -4.08 }],
    dialog: LINE_DIALOG,
    // humans.js's spec; the Room design dresses him in running gear for his
    // lap of the room, a scene-only costume the renderer doesn't draw.
    figure: DOM_FIGURE,
  },
  'ian-team-room-2': {
    id: 'ian-team-room-2',
    name: 'Ian Ballard',
    title: 'VP of Engineering',
    roomId: 'team-room-2',
    kind: 'human',
    tagName: 'Ian',
    dialogLine: 'Who broke CI? Be honest.',
    idleLines: staticLine('have you installed the atlas plugin yet?'),
    // Team Room 2's own name badge, not Dev Pit's "DEV PIT · VP OF
    // ENGINEERING" (#51 review fix 2): the trigger line and action/decline
    // labels are still Ian's own Bug Squash copy, shared via
    // `BUG_SQUASH_DIALOG`.
    dialog: { ...BUG_SQUASH_DIALOG, subtitle: 'TEAM ROOM 2 · VP OF ENGINEERING' },
    figure: IAN_FIGURE,
  },
  'millie-team-room-3': {
    id: 'millie-team-room-3',
    name: 'Millie Elliott',
    title: null,
    roomId: 'team-room-3',
    kind: 'human',
    tagName: 'Millie',
    dialogLine: 'Quick question before you go in.',
    // The design gives her no bubble here.
    idleLines: [],
    dialog: LINE_DIALOG,
    figure: MILLIE_FIGURE,
  },
  'casey-team-room-3': {
    id: 'casey-team-room-3',
    name: 'Casey Snow',
    title: null,
    roomId: 'team-room-3',
    kind: 'human',
    tagName: 'Casey',
    dialogLine: 'Snow by name. Snowcones by trade.',
    // `rats 10s`, shown from 80%: (0.80 - 0.07) * 10 = 7.3s, i.e. -2.7s.
    idleLines: [{ text: 'RATS', periodS: 10, delayS: -2.7 }],
    // The Igloo Gear stall is the Roof Deck's; here she is just gaming.
    dialog: LINE_DIALOG,
    figure: CASEY_FIGURE,
  },
  'sydney-team-room-3': {
    id: 'sydney-team-room-3',
    name: 'Sydney Murauskas',
    title: 'Technical Recruiter',
    roomId: 'team-room-3',
    kind: 'human',
    tagName: 'Sydney',
    dialogLine: 'Welcome to JG HQ!',
    idleLines: staticLine('So, open to new roles?'),
    dialog: LINE_DIALOG,
    figure: SYDNEY_FIGURE,
  },
  michael: {
    id: 'michael',
    name: 'Michael Prete',
    title: 'IT Associate',
    roomId: 'team-room-4',
    kind: 'human',
    tagName: 'Michael',
    dialogLine: '3-0. Again.',
    idleLines: staticLine('I challenge you to a Beyblade battle!'),
    dialog: LINE_DIALOG,
    figure: {
      style: 'shortDark',
      hair: 'dark',
      skin: 'light',
      top: '#161719',
      jacket: '#D9534F',
      collar: 'crew',
      glasses: 'rect',
      beard: 'full',
      teeth: true,
      prop: 'beyblade',
    },
  },
  'sam-team-room-4': {
    id: 'sam-team-room-4',
    name: 'Sam Schantz',
    title: null,
    roomId: 'team-room-4',
    kind: 'human',
    tagName: 'Sam',
    dialogLine: 'Have you tried turning it off?',
    // The design gives him music notes, not a bubble.
    idleLines: [],
    dialog: LINE_DIALOG,
    figure: SAM_FIGURE,
  },
  'ryan-team-room-4': {
    id: 'ryan-team-room-4',
    name: 'Ryan Shendler',
    title: null,
    roomId: 'team-room-4',
    kind: 'human',
    tagName: 'Ryan',
    dialogLine: 'LGTM. One nit.',
    // The design gives him no bubble here.
    idleLines: [],
    dialog: LINE_DIALOG,
    figure: RYAN_FIGURE,
  },
  jessie: {
    id: 'jessie',
    // A Penguin-kind background NPC: name, tag and line from the Bathroom
    // design's own nameplate and bubble. Spelled "Jessie" there, unlike The
    // Melt's "Jesse", so kept a separate character.
    name: 'Jessie',
    title: null,
    roomId: 'bathroom',
    kind: 'penguin',
    tagName: 'Jessie',
    dialogLine: 'occupied since standup',
    idleLines: staticLine('occupied since standup'),
    dialog: LINE_DIALOG,
    look: WHITE_CAP_PENGUIN_LOOK,
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
