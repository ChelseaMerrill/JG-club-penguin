import { RYAN_SHENDLER_SHEET, SAM_SCHANTZ_SHEET } from '../../game/npcs/render-npc-svg';
import type { NpcId } from '../npcs';
import type { NpcMotionSpec, NpcPropLayer } from './types';

/**
 * Team Room 4's NPC motions (owner request, 2026-09-30, Track D: Sam and
 * Ryan "doing their actions from the character design page", with music
 * notes coming off both). `design/Team Room 4.dc.html` itself draws them
 * still, so these come from their cards on the Characters sheet
 * (`design/Characters.dc.html`, SAM SCHANTZ and RYAN SHENDLER), whose
 * figures `render-npc-svg.ts` draws (`sheet`).
 *
 * The cards animate with the page's CSS `bob` (copied verbatim) and with SMIL
 * `<animate>`/`<animateTransform>` on their own parts. SMIL isn't CSS, so
 * each is re-expressed here as the equivalent `@keyframes` rule: its
 * `values` list spaced evenly (SMIL's default `calcMode="linear"`), its
 * `dur`, `linear` timing, and its `begin` as the same phase offset written
 * as a negative `animation-delay` (the card's `begin="1.2s"` over a 2.4s
 * cycle is `-1.2s`). The keyframe names are ours; SMIL has none.
 *
 * Not in either card, so authored: Sam's three music notes (his card has
 * only sound arcs). The Team Room 4 design does float a "♪" and a "♫" over
 * this corner, but as font `<text>` in Stage coordinates, which a texture
 * can't draw (no web fonts), so his notes copy the path-and-ellipse note
 * shape of Ryan's card instead, in the game's cyan and yellow.
 */

/** Ryan's card: `animation:bob 3.81s`, Sam's `bob 1.6s` (the page's own `@keyframes bob`). */
const BOB =
  '@keyframes bob { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-5px);} }';

/**
 * A music note's drift, the SMIL pair on each of Ryan's card notes
 * (`translate` `0 0;dx dy` and `opacity` `0;1;0`, both `dur="2.4s"`) as one
 * rule: linear, so the 50% stop is exactly half the drift.
 */
function noteDrift(name: string, dx: number, dy: number): string {
  return `@keyframes ${name} { 0% { transform: translate(0,0); opacity:0;} 50% { transform: translate(${dx / 2}px,${dy / 2}px); opacity:1;} 100% { transform: translate(${dx}px,${dy}px); opacity:0;} }`;
}

/** Ryan's card's lit deck keys: each `opacity` `1;.3;1`, at its own `dur`. */
const KEY_BLINK = '@keyframes keyBlink { 0%,100% { opacity:1;} 50% { opacity:.3;} }';
const KEY_BLINK_DURATIONS = ['.5s', '.89s', '1.15s', '1.28s'] as const;

/** Sam's card's two cyan sound arcs by his mouth: `opacity` `0;1;0` over 0.9s, the second `begin="0.3s"`. */
const SOUND = '@keyframes samSound { 0%,100% { opacity:0;} 50% { opacity:1;} }';

export const TEAM_ROOM_4_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Sam, "MC · FREESTYLE": bobs (1.6s), sings into his mic (the card's mouth
  // `ry` 3.5 -> 1.5 -> 3.5 over 0.4s, ported as a `scaleY` of 1.5/3.5 about
  // the mouth's centre, which also thins its outline's top and bottom a
  // little), with two sound arcs flashing beside it, and three authored
  // notes rising off him.
  'sam-team-room-4': {
    figure: {
      keyframes: BOB,
      animation: 'bob 1.6s ease-in-out infinite',
    },
    // The mouth and mic-arm layers are the moving version of his `mic` prop.
    replaceFigureProp: true,
    props: [
      {
        svg: SAM_SCHANTZ_SHEET.mouth,
        motion: {
          keyframes:
            '@keyframes samSing { 0%,100% { transform: scaleY(1);} 50% { transform: scaleY(.4286);} }',
          animation: 'samSing .4s linear infinite',
          transformOrigin: '60px 54px',
        },
      },
      // The card's arcs, verbatim minus their `opacity="0"` (the keyframes
      // own the opacity now).
      {
        svg: '<path d="M48 55.6 Q46 60 48 64.4" fill="none" stroke="#00BDFF" stroke-width="2" stroke-linecap="round"/>',
        motion: { keyframes: SOUND, animation: 'samSound .9s linear infinite' },
      },
      {
        svg: '<path d="M43 54.6 Q41 60 43 65.4" fill="none" stroke="#00BDFF" stroke-width="2" stroke-linecap="round"/>',
        motion: { keyframes: SOUND, animation: 'samSound .9s linear -.6s infinite' },
      },
      // Drawn after the mouth and arcs, as in the card; it doesn't move.
      { svg: SAM_SCHANTZ_SHEET.micArm },
      // Authored notes: a yellow ♪ off the right of his head, a cyan ♫ over
      // his raised left hand, and a yellow ♪ above his curls, each drifting
      // up and out over 2.4s like Ryan's, a third of a cycle apart.
      {
        svg: '<path d="M98 30 V18 Q103 20 104 25" fill="none" stroke="#F2C12E" stroke-width="2" stroke-linecap="round"/><ellipse cx="96" cy="30" rx="2.6" ry="2" fill="#F2C12E"/>',
        motion: {
          keyframes: noteDrift('samNoteRight', 6, -22),
          animation: 'samNoteRight 2.4s linear infinite',
        },
      },
      {
        svg: '<path d="M16 42 V32 L23 30 V40" fill="none" stroke="#00BDFF" stroke-width="2"/><ellipse cx="14" cy="42" rx="2.6" ry="2" fill="#00BDFF"/><ellipse cx="21" cy="40" rx="2.6" ry="2" fill="#00BDFF"/>',
        motion: {
          keyframes: noteDrift('samNoteLeft', -6, -22),
          animation: 'samNoteLeft 2.4s linear -.8s infinite',
        },
      },
      {
        svg: '<path d="M88 12 V1 Q93 3 94 8" fill="none" stroke="#F2C12E" stroke-width="2" stroke-linecap="round"/><ellipse cx="86" cy="12" rx="2.6" ry="2" fill="#F2C12E"/>',
        motion: {
          keyframes: noteDrift('samNoteTop', 4, -20),
          animation: 'samNoteTop 2.4s linear -1.6s infinite',
        },
      },
    ],
  },
  // Ryan, "DJ · MUSIC TRACKS": bobs (3.81s) at his DJ deck, its four lit
  // keys blinking at their own rates, with his card's own two cyan ♫ notes
  // rising off either side of his head.
  'ryan-team-room-4': {
    figure: {
      keyframes: BOB,
      animation: 'bob 3.81s ease-in-out infinite',
    },
    // The deck, key and hand layers are the moving version of his `djDeck`.
    replaceFigureProp: true,
    props: [
      { svg: RYAN_SHENDLER_SHEET.deck },
      ...RYAN_SHENDLER_SHEET.litKeys.map((svg, index): NpcPropLayer => ({
        svg,
        motion: {
          keyframes: KEY_BLINK,
          animation: `keyBlink ${KEY_BLINK_DURATIONS[index]} linear infinite`,
        },
      })),
      { svg: RYAN_SHENDLER_SHEET.hands },
      // The card's two notes, verbatim minus their `<g opacity="0">` wrapper
      // (the keyframes own the opacity now).
      {
        svg: '<path d="M100 30 V20 L107 18 V28" fill="none" stroke="#00BDFF" stroke-width="2"/><ellipse cx="98" cy="30" rx="2.6" ry="2" fill="#00BDFF"/><ellipse cx="105" cy="28" rx="2.6" ry="2" fill="#00BDFF"/>',
        motion: {
          keyframes: noteDrift('ryanNoteRight', 6, -22),
          animation: 'ryanNoteRight 2.4s linear infinite',
        },
      },
      {
        svg: '<path d="M14 40 V30 L21 28 V38" fill="none" stroke="#00BDFF" stroke-width="2"/><ellipse cx="12" cy="40" rx="2.6" ry="2" fill="#00BDFF"/><ellipse cx="19" cy="38" rx="2.6" ry="2" fill="#00BDFF"/>',
        motion: {
          keyframes: noteDrift('ryanNoteLeft', -6, -22),
          animation: 'ryanNoteLeft 2.4s linear -1.2s infinite',
        },
      },
    ],
  },
};
