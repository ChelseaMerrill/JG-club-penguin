import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Dev Pit's NPC motions (#113). No NPC here moves in `design/Room 02 Dev
 * Pit.dc.html`: every motion is authored (owner requests, Track D).
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
  // Steven left the Dev Pit (owner request, 2026-10-02, Track D), and his
  // walk with him.
  //
  // The Characters sheet's new Dev Pit people (owner request, 2026-10-02,
  // Track D). Each card bobs its figure (`bob`, translateY(-5px) on the
  // card's 176 px-wide render, so 5 / (176 / 120) = 3.41 figure units here),
  // at its own pace, verbatim; the rest is authored. Alex Nikolis and Alex
  // Kelly sit working at the back desks, so they only bob.
  'alex-nikolis': {
    figure: {
      keyframes:
        '@keyframes bobNikolis { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3.41px);} }',
      animation: 'bobNikolis 2.1s ease-in-out infinite',
    },
  },
  'alex-kelly': {
    figure: {
      keyframes:
        '@keyframes bobKelly { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3.41px);} }',
      animation: 'bobKelly 1.8s ease-in-out infinite',
    },
  },
  // Jesse Lucier ("Ship it, then 50 burpees.") jogs laps round the desks with
  // his kettlebell: from his (10,5) slot south to (10,8), west along the
  // front aisle to (4,8), north between desks B and D to (4,5), then east
  // home behind the front desks, over walkable tiles clear of every desk,
  // chair and other NPC's slot. `translate()`s are `tileToScreen` deltas
  // (`TILE_WIDTH`/`TILE_HEIGHT` 100/50) from his own tile, timed in
  // proportion to each leg's length (3, 6, 3, 6 tiles), with a short pause
  // at each corner; his card's own 1.5 s bob plays the whole time.
  'jesse-lucier': {
    path: {
      keyframes:
        '@keyframes jesseLap { 0%,3% { transform: translate(0,0);} 17.5%,20.5% { transform: translate(-150px,75px);} 50%,53% { transform: translate(-450px,-75px);} 67.5%,70.5% { transform: translate(-300px,-150px);} 100% { transform: translate(0,0);} }',
      animation: 'jesseLap 30s ease-in-out infinite',
    },
    figure: {
      keyframes:
        '@keyframes bobJesse { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3.41px);} }',
      animation: 'bobJesse 1.5s ease-in-out infinite',
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
