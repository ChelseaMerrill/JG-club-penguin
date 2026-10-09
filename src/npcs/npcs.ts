import { DEFAULT_LOOK, type MinigameId, type PenguinLook, type RoomId } from '../contracts';
import type { HumanFigureSpec } from '../game/npcs/render-npc-svg';
import { remoteLoungeNpcs, type RemoteLoungeNpcId } from './remote-lounge-npcs';

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
  // rule. Emily and Michael Prete have no slot anywhere else, so they get
  // bare ids; everyone else is a repeat appearance with a `-<room>` suffix.
  // The design also draws Michael S., Samantha and Daniel in the Hallway and
  // Jessie in the Bathroom, but only Players appear as Penguins in the World
  // (owner decision 2026-09-25; PR #133), so none of those four gets an id.
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
  // #113: Town Center's Jory Hutchins, on the couch. Her first Room.
  | 'jory'
  // #51 slice 3: the Mullet's nine NPCs, by the same rule. Tony Mercadante has
  // no slot anywhere else, so he gets his bare id; the other eight are repeat
  // appearances with a `-mullet` suffix (Dom's bare `dom` stays defined but
  // unplaced, as before).
  | 'jason-mullet'
  | 'nicole-mullet'
  | 'ann-marie-mullet'
  | 'jory-mullet'
  | 'ashley-mullet'
  | 'tony'
  | 'jon-mullet'
  | 'brandon-mullet'
  | 'dom-mullet'
  // New on the Characters sheet (owner request, 2026-10-02, Track D), each in
  // one Room only. `jesse-lucier`, not `jesse`: that id is The Melt's Jesse.
  | 'jesse-lucier'
  | 'alex-kelly'
  | 'alex-nikolis'
  | 'dan-bedian'
  | 'paul-carnival'
  | 'greg-westover'
  | 'nick-brown'
  | 'frank-nardone'
  | 'chris-pence'
  | 'aleksandr-molchagin'
  | 'rebecca-congi'
  | 'bich-dudla'
  | 'eva-trimboli'
  | 'abby-rivera'
  | 'adam-wilson-hwang'
  | 'bryan-sambrook'
  // Linda Martin, placed in The Icebox by an explicit owner exception to the
  // "don't place unplaced Characters-sheet people" rule (owner request,
  // 2026-10-09): she walks laps of the open floor.
  | 'linda-martin'
  // The LATAM Futebol Field's six JGers (`design/Characters LATAM.dc.html`,
  // cards 01/04/05/10/18/19): Thalles Stakonski, Bruno Amado, Washington
  // Marino, Chrystian Rissoli, Paulo Ponciano, Gustavo Barska, each walking a
  // ping-pong loop of `design/Latam Futebol Field.dc.html`'s own floor.
  | 'thalles-stakonski'
  | 'bruno-amado'
  | 'washington-marino'
  | 'chrystian-rissoli'
  | 'paulo-ponciano'
  | 'gustavo-barska'
  // The Remote Lounge's JGers (`remote-lounge-npcs.ts`).
  | RemoteLoungeNpcId;

/**
 * A minigame-launching NPC's trigger dialog (#36 D4; round-1 review item 4
 * adds `triggerLine`/`subtitle`, the minigame design's own trigger-phase
 * quote and "ROOM · ROLE"/"ROOM · GAME" badge next to the NPC's name,
 * verbatim from that minigame's own design file: Ian/Bug Squash
 * (`design/Minigame Bug Squash.dc.html`), Chelsea/Pancake Flip
 * (`design/Minigame Pancake Flip.dc.html`), Josh/Snow Cone Stand
 * (`design/Minigame Snow Cone Stand.dc.html`) and Tom/Coffee Rush
 * (`design/Minigame Coffee Rush.dc.html`) (#36 round-2 review item 1), and
 * Michael/Beystadium (`design/Minigame Beystadium.dc.html`, #121).
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
  /**
   * The NPC's own line when the Player clicks `declineLabel`, shown in place
   * of the trigger line before the dialog closes (#181's Ian: "Cool. Enjoy
   * the red build."). Omitted (every other minigame NPC): decline just
   * closes the dialog, unchanged.
   */
  declineLine?: string;
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

/**
 * Anthony's Phishing Quiz trigger (#146, `design/Minigame Phishing Quiz.dc.html`,
 * unbranded): laid out like a Minigame trigger (name badge, trigger line, two
 * buttons), but its action opens the quiz, which isn't a Minigame round.
 */
export interface NpcPhishingQuizDialog {
  kind: 'phishing-quiz';
  actionLabel: string;
  declineLabel: string;
  triggerLine: string;
  subtitle: string;
}

/**
 * A Remote Lounge JGer: walking up to them opens their person card and flies
 * the lounge's globe to their city (`src/ui/remote-lounge/remote-lounge.ts`),
 * never the NPC dialog.
 */
export interface NpcRemoteCardDialog {
  kind: 'remote-card';
}

export type NpcDialog =
  NpcMinigameDialog | NpcStallDialog | NpcLineDialog | NpcPhishingQuizDialog | NpcRemoteCardDialog;

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

/**
 * A quest giver's "Got any work for me?" hook (#144 D5). Adding a Quest or a
 * line here is a data-only change; `quest-giver.ts` does the routing.
 */
export interface NpcQuestGiver {
  /** The Quest this NPC gives, once its issue lands (#121 'beystadium', #140, #141, #142). */
  questId?: string;
  /**
   * For a steps Quest whose "talk to <giver>" step starts it: the Quest counts
   * as not started until that step is done. Without it, not started means
   * progress 0.
   */
  startStepId?: string;
  /** The in-character "nothing right now" reply while no Quest is connected. BA copy only. */
  nothingRightNowLine?: string;
  /**
   * What the giver says when they give the Quest (#141's Nicole: "Client
   * call in five. I need an oat latte."). With it the dialog stays open on
   * this line; without it, starting the Quest closes the dialog.
   */
  startLine?: string;
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
   * This NPC's own dialog lines (#144): element 0 is #36's single
   * `dialogLine` (usually the character sheet's quote, otherwise the
   * `humans.js` `line`), then any other lines the designs or the BA give the
   * person (`humans.js`, the Mullet and HUD designs). The dialog shows
   * `dialogLinePool()` of these plus this appearance's `idleLines`, one at
   * random, never the same line twice in a row. A `kind: 'minigame'` NPC's
   * dialog keeps its verbatim `dialog.triggerLine` instead (#144 Q15).
   */
  dialogLines: readonly [string, ...string[]];
  /**
   * `idleLines` texts left out of the dialog pool (#144 Q16): near-duplicates
   * of a `dialogLines` entry. They still show as bubbles in the Room.
   */
  dialogOmit?: readonly string[];
  /**
   * Set on the one appearance of a QUEST GIVER (`design/Characters.dc.html`)
   * that offers "Got any work for me?" (#144 D5): the Room its Quest names.
   */
  questGiver?: NpcQuestGiver;
  dialog: NpcDialog;
  /**
   * A per-NPC horizontal nudge, layered on top of the tile-derived bubble
   * position. Two distinct reasons set this: Roof Deck's vendor stalls
   * (Kevin, Ann Marie, Josh, Casey) float their speech bubble left of their
   * own nameplate/figure centre by exactly -90px (#36 round-1 review item
   * 3c; traced directly from the Room design's own bubble-vs-nameplate x
   * offset), and where the Room's tile grid stands two NPCs closer than
   * their design does, a bubble shifts clear of a neighbour's nameplate
   * (#113: Dev Pit's Sam, the Office Hallway's Anthony; see each entry).
   * `npcs.test.ts`'s rest-slot overlap check guards it.
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
   * `true` for an NPC its Room design draws without any idle bob (#113: the
   * Kitchen's Chelsea, Dev Pit's Ashley, the Office Hallway's Emily and
   * Anthony, and every NPC in Team Rooms 3 and 4). Every other NPC bobs,
   * unless a designed motion (`npc-motions.ts`) replaces the bob.
   */
  still?: boolean;
  /**
   * The Room design's draw scale for this NPC, when it isn't its kind's
   * default (`npc-layout.ts`): Team Room 3 draws its Humans at 0.58
   * (`width="69.6"`), not 0.62 (owner request, 2026-09-30, Track D).
   */
  scale?: number;
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
 * Dev Pit's cyan whiteboard marker (#113), verbatim from the design's
 * raised-arm `scribble` markup for Ryan and Sam, with its own sleeve and hand
 * colour as drawn. (Steven's red one went when he started walking.)
 */
const DEV_PIT_CYAN_MARKER: HumanFigureSpec['marker'] = {
  arm: '#1f2a4a',
  hand: '#F3D3B8',
  color: '#00BDFF',
};

const BUG_SQUASH_DIALOG: NpcMinigameDialog = {
  kind: 'minigame',
  minigameId: 'bug-squash',
  actionLabel: 'GRAB THE HAMMER',
  declineLabel: 'NOT MY TICKET',
  triggerLine:
    "CI is red. Something's crawling through the test suite and I've got a 2 o'clock. Grab the hammer, squash what you find. 500 points and I'll put you on the Exterminator wall.",
  subtitle: 'DEV PIT · VP OF ENGINEERING',
  // #181, verbatim from design/Minigame Bug Squash.dc.html's own `decline`.
  declineLine: 'Cool. Enjoy the red build.',
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

/**
 * Michael's Beystadium trigger dialog (#121), verbatim from
 * `design/Minigame Beystadium.dc.html`'s trigger phase: his "THE POD · IT
 * ASSOCIATE · BEYSTADIUM CHAMP" badge, his challenge and its LET IT RIP /
 * BACK AWAY SLOWLY buttons.
 */
const BEYSTADIUM_DIALOG: NpcMinigameDialog = {
  kind: 'minigame',
  minigameId: 'beystadium',
  actionLabel: 'LET IT RIP',
  declineLabel: 'BACK AWAY SLOWLY',
  triggerLine:
    "You walked into the Pod. That's a challenge. Pick a Bey, rip the launcher, and knock mine out of the stadium. Best of three. I'm 3-0 against the whole office. 3-0 against you next.",
  subtitle: 'THE POD · IT ASSOCIATE · BEYSTADIUM CHAMP',
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
 * Dom Favata's figure, humans.js's spec (#51), as the Dev Pit's `dom` still
 * wears it. Team Room 1 and the Mullet dress him in running kit instead
 * (`DOM_RUNNER_FIGURE`).
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
 * Dom in running kit, shared by Team Room 1 (`dom-team-room-1`) and the
 * Mullet (`dom-mullet`) so the copies can't drift: both Room designs dress
 * him this way for his lap of the Room, as `design/Characters.dc.html`'s
 * sheet now does too (owner requests, 2026-09-30, Track D). humans.js's spec
 * minus its shirt colour and zip collar, which the kit replaces.
 */
const DOM_RUNNER_FIGURE: HumanFigureSpec = {
  ...DOM_FIGURE,
  top: undefined,
  collar: undefined,
  runner: true,
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
 * (`sam-team-room-4`) (#51), in one constant so the copies can't drift. His
 * card on the Characters sheet (`design/Characters.dc.html`, SAM SCHANTZ,
 * "MC · FREESTYLE") replaced the older `humans.js` spec (spiky dark hair,
 * cyan tee, thin glasses, coffee; owner request, 2026-09-30, Track D): brown
 * curls, a white shirt striped navy/yellow/blue, lavender-tinted glasses,
 * white sneakers, left arm thrown up and singing into a mic in his right.
 */
const SAM_FIGURE: HumanFigureSpec = {
  sheet: 'samSchantz',
  prop: 'mic',
};

/**
 * Ryan Shendler's figure, shared by Dev Pit (`ryan`) and Team Room 4
 * (`ryan-team-room-4`) (#51), in one constant so the copies can't drift. His
 * card on the Characters sheet (`design/Characters.dc.html`, RYAN SHENDLER,
 * "DJ · MUSIC TRACKS") replaced the older `humans.js` spec (short brown
 * hair, teal tee, stubble, smirk, laptop; owner request, 2026-09-30, Track
 * D): black-and-cyan headphones, rectangular glasses, a black shirt, navy
 * trousers, and both hands on a DJ deck with blinking keys.
 */
const RYAN_FIGURE: HumanFigureSpec = {
  sheet: 'ryanShendler',
  prop: 'djDeck',
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
 * in one constant so the copies can't drift. Each Room adds its own camera
 * pose on top.
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
 * Jon Keller's figure, shared by Town Center (`jon`) and the Mullet
 * (`jon-mullet`) (#51 slice 3): the same person, the same `humans.js` spec,
 * in one constant so the copies can't drift. Town Center's playing cards are
 * that entry's own override.
 */
const JON_FIGURE: HumanFigureSpec = {
  style: 'spiky',
  hair: 'dark',
  skin: 'light',
  top: '#BFD6EE',
  jacket: '#1f2a4a',
  collar: 'shirtLight',
  glasses: 'sun',
  mouth: 'smirk',
  prop: 'scarf',
};

/**
 * Jory Hutchins's figure, shared by Town Center (`jory`) and the Mullet
 * (`jory-mullet`) (#51 slice 3), from `humans.js`'s `hutchins`.
 */
const JORY_FIGURE: HumanFigureSpec = {
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
};

/**
 * Ashley Schuliger's figure, shared by the Dev Pit (`ashley`) and the Mullet
 * (`ashley-mullet`) (#51 slice 3), from `humans.js`'s `schuliger`.
 */
const ASHLEY_FIGURE: HumanFigureSpec = {
  style: 'wavyLong',
  hair: 'brown',
  skin: 'fair',
  top: '#161719',
  collar: 'crew',
  teeth: true,
  prop: 'chicken',
};

/**
 * Ann Marie Berdar's figure, shared by the Roof Deck (`ann-marie`) and the
 * Mullet (`ann-marie-mullet`) (#51 slice 3), from `humans.js`'s `berdar`.
 */
const ANN_MARIE_FIGURE: HumanFigureSpec = {
  style: 'wavyLong',
  hair: 'lblond',
  skin: 'med',
  top: '#F2C12E',
  jacket: '#7A2A8C',
  collar: 'crew',
  necklace: true,
  teeth: true,
};

/**
 * Brandon Badgett's figure, shared by the Roof Deck (`brandon`) and the
 * Mullet (`brandon-mullet`) (#51 slice 3), from `humans.js`'s spec.
 */
const BRANDON_FIGURE: HumanFigureSpec = {
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
};

/**
 * Nicole Roberts's figure, shared by the Icebox (`nicole`) and the Mullet
 * (`nicole-mullet`) (#51 slice 3), from `humans.js`'s spec. The Icebox's
 * laptop-on-lap pose is that entry's own override.
 */
const NICOLE_FIGURE: HumanFigureSpec = {
  style: 'wavyLong',
  hair: 'lblond',
  skin: 'fair',
  top: '#161719',
  sleeveless: true,
  necklace: true,
  teeth: true,
};

/**
 * Jason Jahnel's figure, shared by the Icebox (`jason`) and the Mullet
 * (`jason-mullet`) (#51 slice 3), from `humans.js`'s spec.
 */
const JASON_FIGURE: HumanFigureSpec = {
  style: 'buzz',
  hair: 'brown',
  skin: 'fair',
  top: '#F4F4F4',
  pattern: 'plaid',
  pattern2: '#8FB5D8',
  collar: 'button',
  glasses: 'thin',
  teeth: true,
};

/**
 * Person-wide dialog lines (#144 D2), shared by every appearance of the same
 * person like the `*_FIGURE` constants above, so the copies can't drift.
 * Element 0 is #36's single `dialogLine` (usually the character sheet's
 * quote, otherwise the `humans.js` `line`). Sources are the character sheet
 * (`design/Characters.dc.html`), `design/build/humans.js`'s `line`, the
 * Mullet design (`design/The Mullet.dc.html`) and the BA (#144). A line tied
 * to one Room reaches that appearance only through its own `idleLines`.
 */
const DARRIN_LINES = ['Show me energy.'] as const;
const SYDNEY_LINES = ['Welcome to JG HQ!'] as const;
/** "Living the dream!" is the BA's (#144); "Clucknelius coming at you!" is the Mullet design's. */
const ASHLEY_LINES = [
  'The chicken stays. Non-negotiable.',
  'Living the dream!',
  'Clucknelius coming at you!',
] as const;
const IAN_LINES = ['Who broke CI? Be honest.'] as const;
/** humans.js's line, the sheet's quote and the Mullet design's line. */
const DOM_LINES = [
  'p95 is spicy today.',
  'Another day, another trophy.',
  'Undefeated. I always win.',
] as const;
/** humans.js's line, then the sheet's quote. */
const RYAN_LINES = ['LGTM. One nit.', 'Hold on, dropping the bass.'] as const;
/** humans.js's line, then the sheet's quote. */
const SAM_LINES = [
  'Have you tried turning it off?',
  "Mic check. This one's about merge conflicts.",
] as const;
/** humans.js's line, then the sheet's quote. */
const MILLIE_LINES = [
  'Quick question before you go in.',
  "So what I'm hearing you say is...",
] as const;
const ANTHONY_LINES = ['Would you click this link? Wrong.'] as const;
const CASEY_LINES = ['Snow by name. Snowcones by trade.'] as const;
/** The sheet's quote, plus his two Icebox bubbles, reused in Team Room 1 (#144 H4). */
const JETHRO_LINES = [
  "Act natural. Camera's rolling.",
  'One more for the recap.',
  'Say hackathon!',
] as const;
const JON_LINES = ['Welcome to JG. Sunglasses stay on.'] as const;
const JORY_LINES = ['The tribe has spoken.'] as const;
const ANN_MARIE_LINES = ['That cap? Totally your color.', 'OK great :) now do it now'] as const;
const BRANDON_LINES = ["Giddy up. Arcade's this way."] as const;
const NICOLE_LINES = ["The client loved it. Next one's at 2."] as const;
const JASON_LINES = ['Answer three and you may pass.'] as const;

/**
 * `NPCS`: every prototype Room's NPC, keyed by `NpcId` (#36 D1). Names come
 * from `design/Characters.dc.html`'s character sheet (D1/A3); titles come
 * from the same sheet, with `null` for every "TITLE TBD" card its footnote
 * lists (Chelsea, Dom, Ashley, Millie, Casey, Ryan, Sam, Tom) plus Ann
 * Marie's own resolved "SUBSCRIPTION AI" (#36 round-1 review item 1).
 * `design/build/humans.js`'s figure `spec`s are used for the Human NPCs'
 * rendered figures only, never for name/title. `idleLines` come from each
 * Room design's own `say`-cycling (or static) speech bubbles (round-1 item
 * 2), and `dialogLines` starts with #36's single `dialogLine` (usually the
 * sheet's own short quote, otherwise the `humans.js` `line`), shown in the
 * dialog panel (#144).
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
    dialogLines: DARRIN_LINES,
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
    dialogLines: JON_LINES,
    // `sayJon` shows the same line twice per 14 s cycle: 19%-32% and 61%-74%.
    idleLines: [
      { text: 'Wanna see a magic trick?', periodS: 14, delayS: 0, window: [0.19, 0.32] },
      { text: 'Wanna see a magic trick?', periodS: 14, delayS: 0, window: [0.61, 0.74] },
    ],
    dialog: LINE_DIALOG,
    // Town Center's design puts three playing cards in his hand (`trick`);
    // the Mullet's doesn't, so it's this entry's own override.
    figure: { ...JON_FIGURE, cards: true },
  },
  sydney: {
    id: 'sydney',
    name: 'Sydney Murauskas',
    title: 'Technical Recruiter',
    roomId: 'town-center',
    kind: 'human',
    tagName: 'Sydney Murauskas',
    // `design/Club JenGuin HUD Menus.dc.html`'s Town Center scene gives her
    // one more line; it's this appearance's own, not Team Room 3's.
    dialogLines: [...SYDNEY_LINES, 'lobby snowball fight?'],
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
    dialogLines: JORY_LINES,
    questGiver: {},
    // `sayJory` (63%-88%), 9 s, no delay.
    idleLines: [{ text: 'COUCH. IS. LAVA.', periodS: 9, delayS: 0, window: [0.63, 0.88] }],
    dialog: LINE_DIALOG,
    figure: JORY_FIGURE,
  },
  'front-desk': {
    id: 'front-desk',
    name: 'Front Desk',
    title: null,
    roomId: 'town-center',
    kind: 'penguin',
    tagName: 'Front Desk',
    dialogLines: ['Welcome to JG HQ!'],
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
    dialogLines: ASHLEY_LINES,
    questGiver: {},
    // The Dev Pit design gives her group no `animation:` at all.
    still: true,
    idleLines: [
      { text: 'Incoming!', periodS: 9, delayS: -4.2 },
      { text: 'Most spirited. Deal with it.', periodS: 14, delayS: -5 },
      { text: 'Catch!', periodS: 14, delayS: -9.5 },
    ],
    dialog: LINE_DIALOG,
    figure: ASHLEY_FIGURE,
  },
  ian: {
    id: 'ian',
    name: 'Ian Ballard',
    title: 'VP of Engineering',
    roomId: 'dev-pit',
    kind: 'human',
    tagName: 'Ian',
    dialogLines: IAN_LINES,
    questGiver: {},
    idleLines: [
      { text: 'Who broke CI? Be honest.', periodS: 22, delayS: -1 },
      { text: 'Grab the hammer. CI is red.', periodS: 22, delayS: -10 },
    ],
    // No `still` and no nudge: the Dev Pit design draws him without the
    // shared idle bob, but he now walks a loop (owner request, 2026-09-25;
    // `motions/dev-pit.ts`), and Dom, whose bubble his used to clear, is no
    // longer in this Room.
    dialog: BUG_SQUASH_DIALOG,
    figure: IAN_FIGURE,
  },
  // The Characters sheet's new Dev Pit people (owner request, 2026-10-02,
  // Track D): name, title and line from each one's card, drawn from the card
  // itself (`card-figures.ts`); their motions play the card's bob instead of
  // #36's.
  'jesse-lucier': {
    id: 'jesse-lucier',
    name: 'Jesse Lucier',
    title: 'Director of Internal Applications',
    roomId: 'dev-pit',
    kind: 'human',
    tagName: 'Jesse Lucier',
    dialogLines: ['Ship it, then 50 burpees.'],
    idleLines: [{ text: 'Ship it, then 50 burpees.', periodS: 20, delayS: -3 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'jesseLucier' },
  },
  'alex-kelly': {
    id: 'alex-kelly',
    name: 'Alex Kelly',
    title: 'Director of Service Delivery',
    roomId: 'dev-pit',
    kind: 'human',
    tagName: 'Alex Kelly',
    dialogLines: ['Hold on, let me ask Claude.'],
    idleLines: [{ text: 'Hold on, let me ask Claude.', periodS: 20, delayS: -9 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'alexKelly' },
  },
  'alex-nikolis': {
    id: 'alex-nikolis',
    name: 'Alex Nikolis',
    title: 'Senior Software Engineer',
    roomId: 'dev-pit',
    kind: 'human',
    tagName: 'Alex Nikolis',
    dialogLines: ['Works on my machine.'],
    idleLines: [{ text: 'Works on my machine.', periodS: 20, delayS: -15 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'alexNikolis' },
  },
  steven: {
    id: 'steven',
    name: 'Steven Zgaljic',
    title: 'CTO',
    roomId: 'dev-pit',
    kind: 'human',
    tagName: 'Steven',
    dialogLines: ['Architecture question. Ready?'],
    idleLines: [
      { text: 'Boxes and arrows. Mostly arrows.', periodS: 14, delayS: -2 },
      { text: 'This diagram scales. Trust me.', periodS: 14, delayS: -9 },
    ],
    dialog: LINE_DIALOG,
    // As `design/Characters.dc.html`'s STEVEN ZGALJIC card draws him (owner
    // request, 2026-09-30, Track D), which is newer than `humans.js`'s spec:
    // grey hair, no beard or grey streaks, a green android badge on his
    // jacket, and arms down (the Dev Pit design's raised red marker is gone;
    // he walks instead, `motions/dev-pit.ts`).
    figure: {
      style: 'shortDark',
      hair: 'grey',
      skin: 'med',
      top: '#2B3557',
      pattern: 'dots',
      jacket: '#161719',
      collar: 'crew',
      mouth: 'smirk',
      badge: 'android',
    },
  },
  dom: {
    id: 'dom',
    name: 'Dom Favata',
    title: null,
    roomId: 'dev-pit',
    kind: 'human',
    tagName: 'Dom',
    dialogLines: DOM_LINES,
    idleLines: [
      { text: 'Parkour!', periodS: 18, delayS: -1 },
      { text: 'Dashboards are lava.', periodS: 18, delayS: -7 },
      { text: 'Do not tell facilities.', periodS: 18, delayS: -13 },
    ],
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
    dialogLines: RYAN_LINES,
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
    dialogLines: SAM_LINES,
    idleLines: [
      { text: 'Have you tried turning it off?', periodS: 20, delayS: -4 },
      { text: 'Drawing the architecture. Again.', periodS: 20, delayS: -11 },
      { text: 'Ship it Friday. What could go wrong.', periodS: 20, delayS: -17 },
    ],
    // Shifted right just past Steven's nameplate (#113): the grid stands
    // him 50 px below Steven, and his wrapped "Ship it Friday..." pill (one
    // line in the design) would otherwise cover Steven's whole nameplate.
    // The design's own one-line pills already overlap its bottom 4 px.
    bubbleOffsetX: 72,
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
    dialogLines: ['Hexles bounce. 800 tokens.'],
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
    dialogLines: ANN_MARIE_LINES,
    idleLines: [
      { text: 'Cyan cap? 120 tokens.', periodS: 12, delayS: 0 },
      { text: 'Try it on!', periodS: 12, delayS: -6 },
    ],
    bubbleOffsetX: -90,
    // Her stall's tile sits one screen row above Millie's, so her bubble
    // would overlap the top 5 px of Millie's: lifted 8 px to clear it.
    bubbleOffsetY: -8,
    dialog: LINE_DIALOG,
    figure: ANN_MARIE_FIGURE,
  },
  millie: {
    id: 'millie',
    name: 'Millie Elliott',
    title: null,
    roomId: 'roof-deck',
    kind: 'human',
    tagName: 'Millie',
    dialogLines: MILLIE_LINES,
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
    dialogLines: ['Pumpkin spice is a lifestyle.'],
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
    dialogLines: BRANDON_LINES,
    idleLines: [
      { text: 'Giddy up!', periodS: 26, delayS: -2 },
      { text: 'Does it come in horse?', periodS: 26, delayS: -10 },
      { text: 'Yeehaw. Hexle time.', periodS: 26, delayS: -18 },
    ],
    dialog: LINE_DIALOG,
    figure: BRANDON_FIGURE,
  },
  anthony: {
    id: 'anthony',
    name: 'Anthony Conway',
    title: 'Director of IT',
    roomId: 'roof-deck',
    kind: 'human',
    tagName: 'Anthony',
    dialogLines: ANTHONY_LINES,
    idleLines: [
      { text: 'Catch of the day: your password.', periodS: 28, delayS: -2 },
      { text: 'Never click the bait!', periodS: 28, delayS: -11 },
      { text: 'Reel talk: check the sender.', periodS: 28, delayS: -20 },
    ],
    // #146: the door guard. He has no Room slot; the Phishing Quiz places him
    // at the door he's guarding (`roomId` stays his home Room, the Roof Deck).
    dialog: {
      kind: 'phishing-quiz',
      actionLabel: 'TAKE THE QUIZ',
      declineLabel: 'WALK AROUND HIM',
      triggerLine:
        'Whoa there. You bumped into me, so you know the rule: one security question before you pass.',
      subtitle: 'DOOR BOSS · PHISHING QUIZ',
    },
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
    dialogLines: ["It's 12° out here."],
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
    dialogLines: CASEY_LINES,
    idleLines: [
      { text: 'Roof igloo: BYO fish.', periodS: 12, delayS: -4 },
      { text: 'New gear drops Friday.', periodS: 12, delayS: -10 },
    ],
    bubbleOffsetX: -90,
    dialog: IGLOO_GEAR_STALL_DIALOG,
    figure: CASEY_FIGURE,
    // #143: the Igloo Badge Quest's giver; "talk to Casey" starts it.
    questGiver: { questId: 'igloo-badge', startStepId: 'talk-to-casey' },
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
    dialogLines: ['Fresh pot. Do not touch.'],
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
    dialogLines: ['Flip it NOW.'],
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
    dialogLines: ['Clean your mug.'],
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
    dialogLines: ['Is this decaf? Be honest.'],
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
    dialogLines: MILLIE_LINES,
    idleLines: [
      { text: 'Team lead question: who owns this?', periodS: 26, delayS: -3 },
      { text: 'Standup was 4 minutes. Record.', periodS: 26, delayS: -12 },
      { text: 'Trivia time. Door stays shut.', periodS: 26, delayS: -20 },
    ],
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
    dialogLines: NICOLE_LINES,
    // #141: "Bring Nicole a coffee before kickoff", her line verbatim from the ticket.
    questGiver: {
      questId: 'nicole-coffee',
      startStepId: 'talk-to-nicole',
      startLine: 'Client call in five. I need an oat latte.',
    },
    idleLines: [
      { text: 'Client call in 5. Shh.', periodS: 15, delayS: -2 },
      { text: 'Account manager mode: on.', periodS: 15, delayS: -7 },
      { text: 'Nope, that is billable.', periodS: 15, delayS: -12 },
    ],
    dialog: LINE_DIALOG,
    // humans.js's spec, seated with a laptop on her lap as the Room design
    // draws her (#113). The Mullet's design seats her on the couch without
    // one, a pose the renderer doesn't draw, so that entry stands.
    figure: { ...NICOLE_FIGURE, seated: 'laptop' },
  },
  jason: {
    id: 'jason',
    name: 'Jason Jahnel',
    title: 'COO',
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Jason',
    dialogLines: JASON_LINES,
    // A near-duplicate of his dialog line; it stays a bubble in the Room.
    dialogOmit: ['Three questions and you may pass.'],
    idleLines: [
      { text: 'Stairs challenge. You are behind.', periodS: 26, delayS: -1 },
      { text: 'Three questions and you may pass.', periodS: 26, delayS: -10 },
      { text: 'Kickoff in 4:32. Sit.', periodS: 26, delayS: -18 },
    ],
    dialog: LINE_DIALOG,
    figure: JASON_FIGURE,
  },
  jethro: {
    id: 'jethro',
    name: 'Jethro Breuer',
    title: 'Director of Digital Media',
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Jethro',
    dialogLines: JETHRO_LINES,
    // A near-duplicate of his dialog line; it stays a bubble in the Room.
    dialogOmit: ['Act natural. Camera is rolling.'],
    idleLines: [
      { text: 'Act natural. Camera is rolling.', periodS: 21, delayS: -2 },
      { text: 'One more for the recap.', periodS: 21, delayS: -9 },
      { text: 'Say hackathon!', periodS: 21, delayS: -16 },
    ],
    dialog: LINE_DIALOG,
    // He takes photos as he walks, with Team Room 1's camera raise, in place
    // of the Icebox design's chest camera rig (owner request, 2026-10-01,
    // Track D), so he carries one camera, not two.
    figure: { ...JETHRO_FIGURE, prop: undefined, cameraRaise: 'lowered' },
  },
  // The Characters sheet's new people at the Icebox table (owner request,
  // 2026-10-02, Track D): name, title and line from each one's card, drawn
  // from the card itself (`card-figures.ts`); their motions play the card's
  // bob instead of #36's. Greg's card title is "TITLE TBD".
  // The Characters sheet's new people in Team Room 2 (owner request,
  // 2026-10-02, Track D): name, title and line from each one's card, drawn
  // from the card itself. Chris's card hangs his binoculars on his chest;
  // here he holds them up to his eyes and looks round the Room through them
  // (`motions/team-room-2.ts`).
  'nick-brown': {
    id: 'nick-brown',
    name: 'Nick Brown',
    title: 'Developer',
    roomId: 'team-room-2',
    kind: 'human',
    tagName: 'Nick Brown',
    dialogLines: ['Just one more commit. Then lunch.'],
    idleLines: [{ text: 'Just one more commit. Then lunch.', periodS: 20, delayS: -4 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'nickBrown' },
  },
  'frank-nardone': {
    id: 'frank-nardone',
    name: 'Frank Nardone',
    title: 'Software Engineer',
    roomId: 'team-room-2',
    kind: 'human',
    tagName: 'Frank Nardone',
    dialogLines: ["LGTM. Didn't read it."],
    idleLines: [{ text: "LGTM. Didn't read it.", periodS: 20, delayS: -11 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'frankNardone' },
  },
  'chris-pence': {
    id: 'chris-pence',
    name: 'Chris Pence',
    title: 'Software Engineer',
    roomId: 'team-room-2',
    kind: 'human',
    tagName: 'Chris Pence',
    dialogLines: ['Chris P. Bacon'],
    idleLines: [{ text: 'Chris P. Bacon', periodS: 20, delayS: -17 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'chrisPenceArmsRaised' },
  },
  // New from the Characters sheet (owner request, 2026-10-02, Track D):
  // name, title and line from his card, drawn from the card itself.
  'aleksandr-molchagin': {
    id: 'aleksandr-molchagin',
    name: 'Aleksandr Molchagin',
    title: 'Developer',
    roomId: 'team-room-2',
    kind: 'human',
    tagName: 'Aleksandr Molchagin',
    dialogLines: ['This is not cold. This is spring.'],
    idleLines: [{ text: 'This is not cold. This is spring.', periodS: 20, delayS: -8 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'aleksandrMolchagin' },
  },
  // New from the Characters sheet (owner request, 2026-10-02, Track D):
  // name, title and line from her card, drawn from the card itself.
  'rebecca-congi': {
    id: 'rebecca-congi',
    name: 'Rebecca Congi',
    title: 'Developer',
    roomId: 'team-room-1',
    kind: 'human',
    tagName: 'Rebecca Congi',
    dialogLines: ["Green tests or it didn't happen."],
    idleLines: [{ text: "Green tests or it didn't happen.", periodS: 18, delayS: -6 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'rebeccaCongi' },
  },
  // The Characters sheet's two QA Analysts, new in the Market (owner
  // request, 2026-10-02, Track D): name, title and line from each one's
  // card, drawn from the card itself. Bich waters the Market's potted
  // plants and Eva walks the deck (`motions/roof-deck.ts`).
  'bich-dudla': {
    id: 'bich-dudla',
    name: 'Bich Dudla',
    title: 'QA Analyst',
    roomId: 'roof-deck',
    kind: 'human',
    tagName: 'Bich Dudla',
    // Her long line, at her slot, would cover Ann Marie's bubbles at her
    // counter up and to the right; shifted left until it clears them.
    bubbleOffsetX: -90,
    dialogLines: ['I test the code. I water the plant. Both keep growing.'],
    idleLines: [
      { text: 'I test the code. I water the plant. Both keep growing.', periodS: 20, delayS: -3 },
    ],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'bichDudla' },
  },
  'eva-trimboli': {
    id: 'eva-trimboli',
    name: 'Eva Trimboli',
    title: 'QA Analyst',
    roomId: 'roof-deck',
    kind: 'human',
    tagName: 'Eva Trimboli',
    dialogLines: ["It's not a bug until I say it's a bug."],
    idleLines: [{ text: "It's not a bug until I say it's a bug.", periodS: 20, delayS: -13 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'evaTrimboli' },
  },
  // The Characters sheet's new people in the Mullet (owner request,
  // 2026-10-02, Track D): name, title and line from each one's card, drawn
  // from the card itself. Abby paints the wall; Adam and Bryan walk laps.
  'abby-rivera': {
    id: 'abby-rivera',
    name: 'Abby Rivera',
    title: 'UI/UX',
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Abby Rivera',
    dialogLines: ["Hold still, I'm sketching you."],
    idleLines: [{ text: "Hold still, I'm sketching you.", periodS: 20, delayS: -3 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'abbyRiveraPainting' },
  },
  'adam-wilson-hwang': {
    id: 'adam-wilson-hwang',
    name: 'Adam Wilson-Hwang',
    title: 'Tech Lead',
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Adam Wilson-Hwang',
    dialogLines: ["That's a three-pointer. Minimum."],
    idleLines: [{ text: "That's a three-pointer. Minimum.", periodS: 20, delayS: -9 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'adamWilsonHwang' },
  },
  'bryan-sambrook': {
    id: 'bryan-sambrook',
    name: 'Bryan Sambrook',
    title: 'Principal Software Engineer',
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Bryan Sambrook',
    dialogLines: ['Seen this bug before. Back in 2009.'],
    idleLines: [{ text: 'Seen this bug before. Back in 2009.', periodS: 20, delayS: -15 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'bryanSambrook' },
  },
  'dan-bedian': {
    id: 'dan-bedian',
    name: 'Dan Bedian',
    title: 'Leader of Kelmar',
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Dan Bedian',
    dialogLines: ["This meeting's a 40-minute jam. Stay for the encore."],
    idleLines: [
      { text: "This meeting's a 40-minute jam. Stay for the encore.", periodS: 21, delayS: -5 },
    ],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'danBedian' },
  },
  'paul-carnival': {
    id: 'paul-carnival',
    name: 'Paul Carnival',
    title: 'QA',
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Paul Carnival',
    dialogLines: ['Found one. Steps to reproduce: exist.'],
    idleLines: [{ text: 'Found one. Steps to reproduce: exist.', periodS: 21, delayS: -12 }],
    // Clear of Dan's nameplate, one chair up-left of him at the table.
    bubbleOffsetX: 140,
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'paulCarnival' },
  },
  'greg-westover': {
    id: 'greg-westover',
    name: 'Greg Westover',
    title: null,
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Greg Westover',
    dialogLines: ['Have you tried turning it off and on again?'],
    idleLines: [{ text: 'Have you tried turning it off and on again?', periodS: 21, delayS: -19 }],
    // Clear of Paul's nameplate, one chair up-left of him at the table.
    bubbleOffsetX: 160,
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'gregWestover' },
  },
  // Linda Martin (`design/Characters.dc.html` card 02: CSO, "QUEST GIVER ·
  // CLOSER"), placed in The Icebox walking laps of the open floor by an
  // explicit owner exception to the "don't place unplaced Characters-sheet
  // people" rule (owner request, 2026-10-09).
  'linda-martin': {
    id: 'linda-martin',
    name: 'Linda Martin',
    title: 'CSO',
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Linda',
    dialogLines: ['Every room is a pitch. Smile.'],
    // #142: the pitch Quest's giver; "talk to Linda" starts it. Her own card
    // quote doubles as her start line, as Nicole's does.
    questGiver: {
      questId: 'pitch-hack',
      startStepId: 'talk-to-linda',
      startLine: 'Every room is a pitch. Smile.',
    },
    idleLines: [{ text: 'Every room is a pitch. Smile.', periodS: 21, delayS: -9 }],
    still: true,
    dialog: LINE_DIALOG,
    figure: { card: 'lindaMartin' },
  },
  'darrin-icebox': {
    id: 'darrin-icebox',
    name: 'Darrin Jahnel',
    title: 'Founder & CEO',
    roomId: 'the-icebox',
    kind: 'human',
    tagName: 'Darrin',
    dialogLines: DARRIN_LINES,
    idleLines: [
      { text: 'Show me energy.', periodS: 15, delayS: -1 },
      { text: 'Serve. Grind. Grow. Inspire.', periodS: 15, delayS: -6 },
      { text: 'Who is demoing first?', periodS: 15, delayS: -11 },
    ],
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
  // Michael S., Samantha and Daniel: the design draws all three as Penguins
  // in the Hallway, but only Players appear as Penguins in the World (owner
  // decision 2026-09-25, superseding an earlier addition; see PR #133) --
  // dropped here and from the Hallway's own npcSlots.
  emily: {
    id: 'emily',
    name: 'Emily Smith',
    title: null,
    roomId: 'office-hallway',
    kind: 'human',
    tagName: 'Emily Smith',
    dialogLines: ['Ever thought about joining JG?'],
    // A near-duplicate of her dialog line; it stays a bubble in the Room.
    dialogOmit: ['Joining JG?'],
    idleLines: staticLine('Joining JG?'),
    // The Hallway design draws her without any idle bob; she walks laps of
    // the corridor instead (`motions/office-hallway.ts`, owner request,
    // 2026-10-02, Track D), whose motion brings its own bob.
    still: true,
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
    dialogLines: ANTHONY_LINES,
    idleLines: staticLine('Is this link safe?'),
    // The design stands him 140 px right of Emily; the grid stands him one
    // tile (50 px) away, where his always-shown bubble would cover her
    // nameplate. Shifted right until it clears it (#113).
    bubbleOffsetX: 90,
    // The Hallway design draws him without any idle bob.
    still: true,
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
    dialogLines: JETHRO_LINES,
    // `jtalk 4s` (38%-76%), no delay (owner request, 2026-09-30, Track D):
    // its own window, so the line stays up while `jup` holds the camera to
    // his eye, instead of the generic `say` window shifted to 38%.
    idleLines: [
      { text: "Act natural. Camera's rolling.", periodS: 4, delayS: 0, window: [0.38, 0.76] },
    ],
    dialog: LINE_DIALOG,
    // The Room design draws his hands and camera as its `jdown` group, after
    // his face (the resting pose of his camera raise, see
    // `motions/team-room-1.ts`), not humans.js's `camera` prop in his hand.
    figure: { ...JETHRO_FIGURE, prop: undefined, cameraRaise: 'lowered' },
  },
  'dom-team-room-1': {
    id: 'dom-team-room-1',
    name: 'Dom Favata',
    title: null,
    roomId: 'team-room-1',
    kind: 'human',
    tagName: 'Dom',
    dialogLines: DOM_LINES,
    questGiver: {},
    // `domtalk 6s` (39%-66%), no delay (owner request, 2026-09-30, Track D):
    // its own window rather than the generic `say` window shifted to 39%.
    idleLines: [
      { text: 'you gotta be faster than that', periodS: 6, delayS: 0, window: [0.39, 0.66] },
    ],
    dialog: LINE_DIALOG,
    // The Room design dresses him in running kit for his lap of the Room.
    figure: DOM_RUNNER_FIGURE,
  },
  'ian-team-room-2': {
    id: 'ian-team-room-2',
    name: 'Ian Ballard',
    title: 'VP of Engineering',
    roomId: 'team-room-2',
    kind: 'human',
    tagName: 'Ian',
    dialogLines: IAN_LINES,
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
    dialogLines: MILLIE_LINES,
    // The design gives her no bubble here.
    idleLines: [],
    // Team Room 3's design draws its NPCs without any idle bob.
    still: true,
    // Team Room 3 draws its Humans at 0.58, not 0.62 (`width="69.6"`).
    scale: 0.58,
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
    dialogLines: CASEY_LINES,
    // `rats 10s linear infinite`, no delay: fully shown 80%-98% (verbatim
    // from `design/Team Room 3.dc.html`, owner request, 2026-09-30, Track D).
    idleLines: [{ text: 'RATS', periodS: 10, delayS: 0, window: [0.8, 0.98] }],
    // The Igloo Gear stall is the Roof Deck's; here she is just gaming.
    // Team Room 3's design draws its NPCs without any idle bob.
    still: true,
    // Team Room 3 draws its Humans at 0.58, not 0.62 (`width="69.6"`).
    scale: 0.58,
    dialog: LINE_DIALOG,
    // The Room design hands her an open laptop, which the Roof Deck's
    // `casey` doesn't carry (owner request, 2026-09-30, Track D).
    figure: { ...CASEY_FIGURE, prop: 'openLaptop' },
  },
  'sydney-team-room-3': {
    id: 'sydney-team-room-3',
    name: 'Sydney Murauskas',
    title: 'Technical Recruiter',
    roomId: 'team-room-3',
    kind: 'human',
    tagName: 'Sydney',
    dialogLines: SYDNEY_LINES,
    // Her quest-giver appearance now she has left Town Center (owner
    // request, 2026-10-02, Track D).
    questGiver: {},
    idleLines: staticLine('So, open to new roles?'),
    // Team Room 3's design draws its NPCs without any idle bob.
    still: true,
    // Team Room 3 draws its Humans at 0.58, not 0.62 (`width="69.6"`).
    scale: 0.58,
    dialog: LINE_DIALOG,
    // The Room design adds a headset, which Town Center's `sydney` doesn't
    // wear (owner request, 2026-09-30, Track D).
    figure: { ...SYDNEY_FIGURE, headset: true },
  },
  michael: {
    id: 'michael',
    name: 'Michael Prete',
    title: 'IT Associate',
    roomId: 'team-room-4',
    kind: 'human',
    tagName: 'Michael',
    dialogLines: ['3-0. Again.'],
    questGiver: {},
    idleLines: staticLine('I challenge you to a Beyblade battle!'),
    // Team Room 4's design draws its NPCs without any idle bob.
    still: true,
    // #121: LET IT RIP launches Beystadium.
    dialog: BEYSTADIUM_DIALOG,
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
    // His full name, not the Room design's "Sam" (owner request, 2026-09-30,
    // Track D).
    tagName: 'Sam Schantz',
    dialogLines: SAM_LINES,
    // The design gives him music notes, not a bubble.
    idleLines: [],
    // No #36 idle bob: his Team Room 4 motion plays his Characters sheet
    // card's own `bob` instead (`src/npcs/motions/team-room-4.ts`).
    still: true,
    dialog: LINE_DIALOG,
    figure: SAM_FIGURE,
  },
  'ryan-team-room-4': {
    id: 'ryan-team-room-4',
    name: 'Ryan Shendler',
    title: null,
    roomId: 'team-room-4',
    kind: 'human',
    // His full name, not the Room design's "Ryan" (owner request,
    // 2026-09-30, Track D).
    tagName: 'Ryan Shendler',
    dialogLines: RYAN_LINES,
    // The design gives him no bubble here.
    idleLines: [],
    // No #36 idle bob: his Team Room 4 motion plays his Characters sheet
    // card's own `bob` instead (`src/npcs/motions/team-room-4.ts`).
    still: true,
    dialog: LINE_DIALOG,
    figure: RYAN_FIGURE,
  },
  // #51 slice 3: the Mullet's nine NPCs. Names and titles from
  // design/Characters.dc.html (Dom and Ashley are on its TITLE TBD list), tags
  // and `idleLines` from design/The Mullet.dc.html's own nameplates and
  // bubbles, verbatim. A repeat appearance shares its person's figure and
  // dialog-lines constants. The design animates all nine with SMIL (Jason's
  // arcade, the couch giggles, Dom's and Jory's lap, Tony's walk round the
  // pool table, Jon's and Brandon's rally, Ashley's pacing and throws),
  // ported in `src/npcs/motions/the-mullet.ts` (owner request, 2026-10-01,
  // Track D).
  'jason-mullet': {
    id: 'jason-mullet',
    name: 'Jason Jahnel',
    title: 'COO',
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Jason',
    dialogLines: JASON_LINES,
    // At the Ms. Pac-Man, with no bubble.
    idleLines: [],
    // The design jiggles him at the joystick rather than bobbing him.
    still: true,
    dialog: LINE_DIALOG,
    // His hands go up to the controls while his Mullet motion plays (owner
    // request, 2026-10-01, Track D); at rest they're at his sides as usual.
    figure: { ...JASON_FIGURE, arcadeHands: 'resting' },
  },
  'nicole-mullet': {
    id: 'nicole-mullet',
    name: 'Nicole Roberts',
    title: 'Account Manager',
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Nicole',
    dialogLines: NICOLE_LINES,
    // The design floats a laugh ("hehe") off her on a 3 s cycle: an SMIL
    // opacity `0;1;1;0;0` at `keyTimes` `0;0.05;0.35;0.4;1`, fully shown from
    // 5% to 35% (owner request, 2026-10-01, Track D; it was a static line).
    idleLines: [{ text: 'hehe', periodS: 3, delayS: 0, window: [0.05, 0.35] }],
    dialog: LINE_DIALOG,
    figure: NICOLE_FIGURE,
  },
  'ann-marie-mullet': {
    id: 'ann-marie-mullet',
    name: 'Ann Marie Berdar',
    title: 'SUBSCRIPTION AI',
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Ann Marie',
    dialogLines: ANN_MARIE_LINES,
    // As Nicole's laugh, half a cycle later (`begin="1.5s"`).
    idleLines: [{ text: 'haha', periodS: 3, delayS: -1.5, window: [0.05, 0.35] }],
    dialog: LINE_DIALOG,
    figure: ANN_MARIE_FIGURE,
  },
  'jory-mullet': {
    id: 'jory-mullet',
    name: 'Jory Hutchins',
    title: 'Director of Career Development',
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Jory',
    dialogLines: JORY_LINES,
    idleLines: staticLine('Tribe has spoken.'),
    // The grid stands her two tiles (100 px) right of Brandon, where her
    // always-shown bubble would cover the end of his nameplate (the design
    // already has them touching). Shifted right until it clears it (#113).
    bubbleOffsetX: 20,
    // The design walks her a loop of the room rather than bobbing her.
    still: true,
    dialog: LINE_DIALOG,
    figure: JORY_FIGURE,
  },
  'ashley-mullet': {
    id: 'ashley-mullet',
    name: 'Ashley Schuliger',
    title: null,
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Ashley',
    dialogLines: ASHLEY_LINES,
    // One bubble the design shows three times per 18 s cycle (a discrete SMIL
    // opacity: shown 4.4%-16.7%, 41.1%-53.3% and 70.6%-82.8%), each time
    // Clucknelius is thrown.
    idleLines: [
      { text: 'Clucknelius coming at you!', periodS: 18, delayS: 0, window: [0.0444, 0.1667] },
      { text: 'Clucknelius coming at you!', periodS: 18, delayS: 0, window: [0.4111, 0.5333] },
      { text: 'Clucknelius coming at you!', periodS: 18, delayS: 0, window: [0.7056, 0.8278] },
    ],
    dialog: LINE_DIALOG,
    figure: ASHLEY_FIGURE,
  },
  tony: {
    id: 'tony',
    name: 'Tony Mercadante',
    title: 'Project Manager',
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Tony Mercadante',
    dialogLines: ['Eight ball, corner pocket.'],
    // A near-duplicate of his dialog line; it stays a bubble in the Room.
    // Without it his dialog showed the fragment "corner pocket" half the
    // time (and flaked e2e/npcs.spec.ts's "clicking Tony" test).
    dialogOmit: ['corner pocket'],
    idleLines: staticLine('corner pocket'),
    // The design walks him round the pool table with his cue rather than
    // bobbing him.
    still: true,
    dialog: LINE_DIALOG,
    // humans.js's `mercadante` spec has `slick` hair and a `henley` collar,
    // neither of which the renderer draws; the nearest it does are the short
    // dark cut and a crew neck (#149 follow-up).
    figure: {
      style: 'shortDark',
      hair: 'dark',
      skin: 'light',
      top: '#6B2237',
      collar: 'crew',
      beard: 'stubble',
      teeth: true,
    },
  },
  'jon-mullet': {
    id: 'jon-mullet',
    name: 'Jon Keller',
    title: 'President',
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Jon',
    dialogLines: JON_LINES,
    // His quest-giver appearance now he has left Town Center (owner request,
    // 2026-10-02, Track D).
    questGiver: { nothingRightNowLine: 'Just enjoy the tour. Sunglasses stay on.' },
    // At the ping-pong table, with no bubble.
    idleLines: [],
    // The design sways him side to side with the rally rather than bobbing.
    still: true,
    dialog: LINE_DIALOG,
    figure: JON_FIGURE,
  },
  'brandon-mullet': {
    id: 'brandon-mullet',
    name: 'Brandon Badgett',
    title: 'Senior Vice President',
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Brandon',
    dialogLines: BRANDON_LINES,
    // Jon's ping-pong opponent, also with no bubble. The arcade is out of
    // scope, so his Interaction is Dialogue.
    idleLines: [],
    still: true,
    dialog: LINE_DIALOG,
    figure: BRANDON_FIGURE,
  },
  'dom-mullet': {
    id: 'dom-mullet',
    name: 'Dom Favata',
    title: null,
    roomId: 'the-mullet',
    kind: 'human',
    tagName: 'Dom',
    dialogLines: DOM_LINES,
    // A linear SMIL opacity on his 9.4 s lap (`1;1;0;0;1;1` at `keyTimes`
    // `0;0.1;0.12;0.86;0.88;1`) shows it fully from 88% of one cycle to 10% of
    // the next, fading in and out either side: two windows either side of the
    // cycle's start (owner request, 2026-10-01, Track D: the fades no longer
    // count as shown, as `DEFAULT_BUBBLE_WINDOW` doesn't).
    idleLines: [
      { text: 'Undefeated. I always win.', periodS: 9.4, delayS: 0, window: [0, 0.1] },
      { text: 'Undefeated. I always win.', periodS: 9.4, delayS: 0, window: [0.88, 1] },
    ],
    dialog: LINE_DIALOG,
    // The Room design dresses him in running gear for his lap of the room,
    // which the renderer now draws (owner request, 2026-09-30, Track D).
    figure: DOM_RUNNER_FIGURE,
  },
  // Jessie: the design draws her as a Penguin in the Bathroom, but only
  // Players appear as Penguins in the World (owner decision 2026-09-25; see
  // PR #133) -- dropped here and from the Bathroom's own npcSlots. Spelled
  // "Jessie" there, unlike The Melt's "Jesse" (see that entry's own
  // comment), which remains.
  // The LATAM Futebol Field's six JGers (`design/Characters LATAM.dc.html`,
  // cards 01/04/05/10/18/19, each a whole inline-SVG card drawing --
  // `card-figures.ts`'s LATAM comment), placed at their own position in
  // `design/Latam Futebol Field.dc.html` (owner request, 2026-10-09). None of
  // the 19 LATAM cards carries a title or a quote (confirmed by inspection),
  // so `title` is `null` and every `dialogLines` entry below is one shared
  // placeholder line awaiting BA copy (`dialog-lines.test.ts`'s
  // `AWAITING_BA_LINE`), not an invented personal quote. Each walks the
  // design's own ping-pong `<animateTransform>` path on its shared .6s/4px
  // walk bob, ported in `src/npcs/motions/latam-futebol-field.ts`, at the
  // design's own 0.58 draw scale (Team Room 3's precedent). Chrystian
  // Rissoli stands closest to the design's "KICK IT · PENALTY SHOOTOUT" ball
  // icon (90 Stage px away, the next-closest 147), so he is the Penalty Kick
  // minigame's host for dialog purposes; the minigame itself is not built yet
  // (see `latam-futebol-field.ts`'s own comment).
  'thalles-stakonski': {
    id: 'thalles-stakonski',
    name: 'Thalles Stakonski',
    title: null,
    roomId: 'latam-futebol-field',
    kind: 'human',
    tagName: 'Thalles Stakonski',
    dialogLines: ['Bora, LATAM!'],
    idleLines: [],
    dialog: LINE_DIALOG,
    scale: 0.58,
    figure: { card: 'thallesStakonski' },
  },
  'bruno-amado': {
    id: 'bruno-amado',
    name: 'Bruno Amado',
    title: null,
    roomId: 'latam-futebol-field',
    kind: 'human',
    tagName: 'Bruno Amado',
    dialogLines: ['Bora, LATAM!'],
    idleLines: [],
    dialog: LINE_DIALOG,
    scale: 0.58,
    figure: { card: 'brunoAmado' },
  },
  'washington-marino': {
    id: 'washington-marino',
    name: 'Washington Marino',
    title: null,
    roomId: 'latam-futebol-field',
    kind: 'human',
    tagName: 'Washington Marino',
    dialogLines: ['Bora, LATAM!'],
    idleLines: [],
    dialog: LINE_DIALOG,
    scale: 0.58,
    figure: { card: 'washingtonMarino' },
  },
  'chrystian-rissoli': {
    id: 'chrystian-rissoli',
    name: 'Chrystian Rissoli',
    title: null,
    roomId: 'latam-futebol-field',
    kind: 'human',
    tagName: 'Chrystian Rissoli',
    dialogLines: ['Bora, LATAM!'],
    idleLines: [],
    dialog: LINE_DIALOG,
    scale: 0.58,
    figure: { card: 'chrystianRissoli' },
  },
  'paulo-ponciano': {
    id: 'paulo-ponciano',
    name: 'Paulo Ponciano',
    title: null,
    roomId: 'latam-futebol-field',
    kind: 'human',
    tagName: 'Paulo Ponciano',
    dialogLines: ['Bora, LATAM!'],
    idleLines: [],
    dialog: LINE_DIALOG,
    scale: 0.58,
    figure: { card: 'pauloPonciano' },
  },
  'gustavo-barska': {
    id: 'gustavo-barska',
    name: 'Gustavo Barska',
    title: null,
    roomId: 'latam-futebol-field',
    kind: 'human',
    tagName: 'Gustavo Barska',
    dialogLines: ['Bora, LATAM!'],
    idleLines: [],
    dialog: LINE_DIALOG,
    scale: 0.58,
    figure: { card: 'gustavoBarska' },
  },
  // The Remote Lounge's JGers, built from its design's own people list
  // (`remote-lounge-npcs.ts`).
  ...remoteLoungeNpcs({ kind: 'remote-card' }),
};

const NPC_IDS = Object.keys(NPCS) as NpcId[];

function isNpcId(id: string): id is NpcId {
  return (NPC_IDS as string[]).includes(id);
}

/** Looks up an NPC by a Room slot's loosely-typed `npcId` string. */
export function getNpcDefinition(id: string): NpcDefinition | undefined {
  return isNpcId(id) ? NPCS[id] : undefined;
}
