import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Dev Pit's NPC motions (#113). Neither NPC left here moves in `design/Room
 * 02 Dev Pit.dc.html`: both walks are authored (owner requests, Track D).
 *
 * Left out, because they don't belong to an NPC: `say` (#36's bubbles),
 * `blink` (the "TALK · BUG SQUASH" HUD button), `doodle` (a whiteboard
 * sketch fading in/out, opacity only, not attached to any NPC's own group).
 * The design's `chuck`/`tumble` chicken and its `sq1`/`sq2`/`sq3` "SQUEAK"
 * callouts are Ashley's toss, played by `game/npcs/room-chicken-toss.ts` at
 * the Penguins in the Room (owner request, 2026-09-30) rather than on the
 * design's fixed path, so they aren't an NPC motion either. There's also a
 * background "Matt" character (a "not me" speech bubble) with no motion and
 * no `NpcId` -- not one of this Room's NPCs, so left alone entirely.
 *
 * Ashley has no `animation:` anywhere in her own group (static, arms at her
 * sides), so she isn't in this map.
 *
 * Dom removed (owner request, 2026-09-25) and Ryan and Sam removed (owner
 * request, 2026-09-30, Track D): none has a slot in this Room any more (see
 * `dev-pit.ts`'s own `RoomDefinition`), so their motions are gone too --
 * their `NpcDefinition`s in `npcs.ts` are untouched.
 */
export const DEV_PIT_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Steven scribbled at his whiteboard in the Dev Pit design, but now looks
  // as the Characters sheet draws him (arms down, no marker) and walks
  // instead (owner request, 2026-09-30, Track D). Authored, not from the
  // design: a loop along the back wall and around his (7,1) slot, over
  // walkable tiles clear of every desk and every other NPC's slot. Waypoints:
  // north to (7,0), west to (4,0), south to (4,1), then east home past the
  // spawn tile (6,1) -- `translate()`s are `tileToScreen` deltas
  // (`TILE_WIDTH`/`TILE_HEIGHT` 100/50) from his own tile, timed in
  // proportion to each leg's length (1, 3, 1, 3 tiles). `figure` is the
  // design's own generic `idle` bob, as Ian's.
  steven: {
    path: {
      keyframes:
        '@keyframes stevenWalk { 0%,6% { transform: translate(0,0);} 14%,20% { transform: translate(50px,-25px);} 42%,48% { transform: translate(-100px,-100px);} 56%,62% { transform: translate(-150px,-75px);} 84%,100% { transform: translate(0,0);} }',
      animation: 'stevenWalk 20s ease-in-out -3s infinite',
    },
    figure: {
      keyframes:
        '@keyframes idle { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3px);} }',
      animation: 'idle 3s ease-in-out -1s infinite',
    },
  },
  // Ian has no motion in the design (his own figure group carries no
  // `animation:` at all). Authored, not from the design (owner request,
  // 2026-09-25, Track D): a slow rectangular loop down the open west-wall
  // aisle beside his desk, over walkable tiles that avoid every desk and
  // every other NPC's slot (including Dom's now-empty (2,5), still blocked
  // in `WALKABLE` -- see that file's own comment). Waypoints, relative to
  // his (1,5) slot: west to (0,5), south to (0,7), east to (1,7), then home
  // -- `translate()`s are `tileToScreen` deltas (`TILE_WIDTH`/`TILE_HEIGHT`
  // 100/50) between those tiles and his own. `figure` reuses the design's
  // own generic `idle` bob verbatim rather than inventing a new walk cycle.
  ian: {
    path: {
      keyframes:
        '@keyframes ianWalk { 0%,8% { transform: translate(0,0);} 22%,30% { transform: translate(-50px,-25px);} 46%,54% { transform: translate(-150px,25px);} 70%,78% { transform: translate(-100px,50px);} 92%,100% { transform: translate(0,0);} }',
      animation: 'ianWalk 18s ease-in-out infinite',
    },
    figure: {
      keyframes:
        '@keyframes idle { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3px);} }',
      animation: 'idle 3s ease-in-out infinite',
    },
  },
};
