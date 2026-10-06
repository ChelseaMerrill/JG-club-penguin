import { REMOTE_JGERS } from '../../game/npcs/remote-lounge-figures';
import type { NpcId } from '../npcs';
import { REMOTE_LOUNGE_NPC_IDS } from '../remote-lounge-npcs';
import type { NpcMotionSpec, NpcPropLayer } from './types';

/**
 * The Remote Lounge's idle motions, from `design/Remote Area.html`'s "people
 * on the floor" block. Each person's figure plays one of five idle keyframes
 * (`idleBob`, `idleSway`, `idleBreathe`, `idleNod`, `idleHop`), in turn by
 * their index in the design's list, except Tommy and Michael, who play their
 * trumpet and harp (`playTrumpet`, `playHarp`) with music notes floating up.
 * Durations and phase offsets are the design's own formulas, by index.
 *
 * Units: the design animates a `<g class="body">` in Stage px around a
 * figure drawn at 0.66, with `transform-box: fill-box; transform-origin: 50%
 * 100%` (the figure's feet). Here a `figure` track runs inside the NPC's
 * 0.66-scaled wrapper, so each `translateY` is divided by 0.66 to move the
 * same Stage px, and the origin is the feet in figure units, `60px 125px`.
 */

const SCALE = 0.66;
const FEET = '60px 125px';

/** Stage px to figure units at the design's 0.66 draw scale. */
function fig(stagePx: number): string {
  return `${+(stagePx / SCALE).toFixed(3)}px`;
}

const KEYFRAMES = {
  idleBob: `@keyframes remoteIdleBob { 0%,100% { transform: translateY(0);} 50% { transform: translateY(${fig(-2.5)});} }`,
  idleSway:
    '@keyframes remoteIdleSway { 0%,100% { transform: rotate(-2deg);} 50% { transform: rotate(2deg);} }',
  idleBreathe:
    '@keyframes remoteIdleBreathe { 0%,100% { transform: scale(1,1);} 50% { transform: scale(1.015,1.035);} }',
  idleNod: `@keyframes remoteIdleNod { 0%,70%,100% { transform: rotate(0deg);} 78% { transform: rotate(-3deg) translateY(${fig(-1)});} 86% { transform: rotate(2deg);} }`,
  idleHop: `@keyframes remoteIdleHop { 0%,82%,100% { transform: translateY(0);} 88% { transform: translateY(${fig(-7)});} 94% { transform: translateY(0);} }`,
  playTrumpet: `@keyframes remotePlayTrumpet { 0%,100% { transform: rotate(0deg) translateY(0);} 25% { transform: rotate(-3deg) translateY(${fig(-2)});} 50% { transform: rotate(0deg) translateY(0);} 75% { transform: rotate(2deg) translateY(${fig(-1)});} }`,
  playHarp:
    '@keyframes remotePlayHarp { 0%,100% { transform: rotate(0deg);} 30% { transform: rotate(1.6deg);} 60% { transform: rotate(-1.2deg);} }',
} as const;

type Move = keyof typeof KEYFRAMES;

const IDLE_MOVES: readonly Move[] = ['idleBob', 'idleSway', 'idleBreathe', 'idleNod', 'idleHop'];
const PLAYS: Partial<Record<string, Move>> = { kneeland: 'playTrumpet', shirk: 'playHarp' };

/** Where each player's notes start, in figure units (the design's `NOTE`). */
const NOTE_AT: Partial<Record<string, readonly [number, number]>> = {
  kneeland: [112, 50],
  shirk: [104, 62],
};

/**
 * The design's three notes (a stem-and-flag path and a head each), drawn in
 * Stage px beside the player and floating up and away over 2.4 s,
 * 0.8 s apart (written as already-elapsed phases). Converted to figure units.
 */
function notes(at: readonly [number, number]): NpcPropLayer[] {
  const [nx, ny] = at;
  const u = (n: number) => +(n / SCALE).toFixed(3);
  const layers: NpcPropLayer[] = [];
  for (let k = 0; k < 3; k++) {
    const x = +(nx + u(k * 4)).toFixed(3);
    const y = +(ny - u(k * 3)).toFixed(3);
    const delay = ((2.4 - k * 0.8) % 2.4).toFixed(1);
    const animation = `remoteNoteFloat 2.4s ease-out -${delay}s infinite`;
    const keyframes = `@keyframes remoteNoteFloat { 0% { transform: translate(0,0) scale(.6); opacity: 0;} 15% { opacity: 1;} 100% { transform: translate(${fig(14)},${fig(-46)}) scale(1.1); opacity: 0;} }`;
    layers.push({
      svg: `<path d="M${x} ${y} v${-u(9)} l${u(6)} ${-u(2)} v${u(9)}" fill="none" stroke="#00BDFF" stroke-width="${u(2)}" stroke-linecap="round"/>`,
      motion: { keyframes, animation, transformOrigin: `${x + u(3)}px ${y - u(5.5)}px` },
    });
    const cx = +(x - u(1.6)).toFixed(3);
    layers.push({
      svg: `<circle cx="${cx}" cy="${y}" r="${u(2.4)}" fill="#00BDFF"/>`,
      motion: { keyframes, animation, transformOrigin: `${cx}px ${y}px` },
    });
  }
  return layers;
}

function motionFor(key: string, i: number): NpcMotionSpec {
  const move = PLAYS[key] ?? IDLE_MOVES[i % IDLE_MOVES.length]!;
  const dur = (move === 'idleNod' || move === 'idleHop' ? 3.2 : 2) + ((i * 0.37) % 1.4);
  const delay = (i * 0.53) % dur;
  const name = KEYFRAMES[move].match(/@keyframes (\S+)/)![1];
  const at = NOTE_AT[key];
  return {
    figure: {
      keyframes: KEYFRAMES[move],
      animation: `${name} ${dur.toFixed(2)}s ease-in-out -${delay.toFixed(2)}s infinite`,
      transformOrigin: FEET,
    },
    ...(at ? { props: notes(at) } : {}),
  };
}

export const REMOTE_LOUNGE_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = Object.fromEntries(
  REMOTE_JGERS.map((person, i) => [
    REMOTE_LOUNGE_NPC_IDS[person.key as keyof typeof REMOTE_LOUNGE_NPC_IDS],
    motionFor(person.key, i),
  ]),
);
