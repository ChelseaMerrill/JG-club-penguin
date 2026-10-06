import { REMOTE_JGERS, type RemoteJger } from '../game/npcs/remote-lounge-figures';
import type { HumanNpcDefinition, NpcDialog } from './npcs';

/**
 * The Remote Lounge's JGers (`design/Remote Area.html`), one NPC each, in the
 * design's own order. The id rule is `npcs.ts`'s: a person's first Room gets
 * the bare id, a repeat appearance a `-<room>` suffix. Steven Zgaljic, Millie
 * Elliott and Casey Snow already have ids from their HQ appearances, so here
 * they are `-remote-lounge`; everyone else is new to the game.
 */
export const REMOTE_LOUNGE_NPC_IDS = {
  bessler: 'matt-bessler',
  lynch: 'cameron-lynch',
  marcum: 'austin-marcum',
  anderson: 'matt-anderson',
  higgins: 'john-higgins',
  macfarlane: 'paul-macfarlane',
  milliken: 'dani-milliken',
  schoen: 'ethan-schoen',
  steven: 'steven-remote-lounge',
  kneeland: 'tommy-kneeland',
  snow: 'casey-remote-lounge',
  vickers: 'steven-vickers',
  melliott: 'millie-remote-lounge',
  shirk: 'michael-shirk',
  wonkovich: 'matthew-wonkovich',
  jameson: 'joshua-jameson',
  carson: 'nick-carson',
  nyberg: 'chris-nyberg',
} as const;

export type RemoteLoungeNpcId = (typeof REMOTE_LOUNGE_NPC_IDS)[keyof typeof REMOTE_LOUNGE_NPC_IDS];

/**
 * The design pops one person's quote at a time, every 4 s, for 3.2 s
 * (`popQuote`), first at 1.2 s, picking at random. A bubble cycle can't pick
 * at random, so this takes them in the design's own order instead: 18 people
 * at 4 s apart is a 72 s cycle, each person shown for 3.2 s of it.
 */
const QUOTE_EVERY_S = 4;
const QUOTE_SHOWN_S = 3.2;
const FIRST_QUOTE_AT_S = 1.2;

/**
 * Casey's and Millie's titles stay `null` here, as on their HQ appearances:
 * `design/Characters.dc.html` still lists both as TITLE TBD, and the sheet
 * wins over a Room design's guess (#36 D1/A3). The lounge design's own
 * "Title TBD" for Steven Vickers is the same thing.
 */
const TBD_TITLES: ReadonlySet<string> = new Set(['snow', 'melliott', 'vickers']);

/**
 * Bubble nudges where the Room's tile grid puts a quote over a neighbour's
 * nameplate. The design draws its bubbles over everything; the game keeps
 * nameplates readable (`npcs.test.ts`), so these shift each one clear, the
 * least distance that does it.
 */
const BUBBLE_OFFSETS: Partial<Record<string, { x?: number; y?: number }>> = {
  bessler: { y: -20 },
  anderson: { x: 40 },
  steven: { y: -30 },
  kneeland: { y: -30 },
  snow: { y: -50 },
  vickers: { y: -30 },
  melliott: { y: -10 },
};

function remoteNpc(person: RemoteJger, index: number, dialog: NpcDialog): HumanNpcDefinition {
  const id = REMOTE_LOUNGE_NPC_IDS[person.key as keyof typeof REMOTE_LOUNGE_NPC_IDS];
  if (!id) throw new Error(`Remote Lounge: no NPC id for design key "${person.key}"`);
  const periodS = QUOTE_EVERY_S * REMOTE_JGERS.length;
  const nudge = BUBBLE_OFFSETS[person.key];
  return {
    id,
    name: person.name,
    title: TBD_TITLES.has(person.key) ? null : person.title,
    roomId: 'remote-lounge',
    kind: 'human',
    // The design's nameplates are first names.
    tagName: person.name.split(' ')[0]!,
    dialogLines: [person.line],
    idleLines: [
      {
        text: person.line,
        periodS,
        // Shown at FIRST_QUOTE_AT_S + 4 s x index, written as the matching
        // already-elapsed (negative) delay.
        delayS: FIRST_QUOTE_AT_S + QUOTE_EVERY_S * index - periodS,
        window: [0, QUOTE_SHOWN_S / periodS],
      },
    ],
    dialog,
    ...(nudge?.x ? { bubbleOffsetX: nudge.x } : {}),
    ...(nudge?.y ? { bubbleOffsetY: nudge.y } : {}),
    // The design draws its people at 0.66 (`sc=.66`), not the usual 0.62.
    scale: 0.66,
    figure: { card: person.card },
  };
}

/** Every Remote Lounge NPC, keyed by id, for `npcs.ts`'s `NPCS`. */
export function remoteLoungeNpcs(dialog: NpcDialog): Record<RemoteLoungeNpcId, HumanNpcDefinition> {
  return Object.fromEntries(
    REMOTE_JGERS.map((person, index) => {
      const npc = remoteNpc(person, index, dialog);
      return [npc.id, npc];
    }),
  ) as Record<RemoteLoungeNpcId, HumanNpcDefinition>;
}
