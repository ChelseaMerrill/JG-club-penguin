import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Icebox's NPC motions (#113), copied verbatim from `design/Room 03 The
 * Icebox.dc.html`'s `<style>` block and each NPC's `animation:` style.
 *
 * Each of this Room's five NPCs roams a loop (`…Roam`, on the outer group,
 * translated Stage pixels off their slot point) while a shared `idle`
 * bob (`idle 1.1s ease-in-out infinite`, no delay, identical for all five)
 * plays on a wrapper directly around the figure `<svg>` the whole time they
 * roam -- ported as `figure` too, since a designed `path` alone would
 * otherwise drop #36's default bob entirely and lose that motion the design
 * clearly intends. Its distance is rescaled to figure units (see
 * `ICEBOX_IDLE_BOB`).
 *
 * Left out, because they don't belong to an NPC: `say` (#36's bubbles),
 * `blink` (a HUD button elsewhere in the Room), `fadeIn`/`fadeOut` (the photo
 * booth's own polaroid-develop transition), `flashBulb`/`flashScreen`/
 * `develop` (the same photo mechanic's camera flash and print-developing
 * animation -- opacity/filter only, no `transform`, so even if ported they'd
 * compile to a no-op; the polaroid photo booth is outside #113 regardless).
 * `milWalk`, `jasWalk` and `jetWalk` are defined in the `<style>` block but
 * never referenced by any element's `animation:` anywhere in the file (dead
 * CSS in the design itself) -- there's nothing to port for them.
 */
/**
 * The design's `idle` (`translateY(-3px)`) sits on a `<g>` outside the
 * figure's scaled `<svg>`, so it moves 3 Stage px. A `figure` track plays
 * inside `npc-sprite.ts`'s 0.62 scaled wrapper, in figure units, so the
 * distance is 3 / 0.62 = 4.84 figure px here to move the same 3 Stage px.
 */
const ICEBOX_IDLE_BOB = {
  keyframes:
    '@keyframes idle { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4.84px); } }',
  animation: 'idle 1.1s ease-in-out infinite',
};

export const THE_ICEBOX_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  'millie-icebox': {
    path: {
      keyframes:
        '@keyframes milRoam { 0% { transform: translate(0px, 0px); } 10% { transform: translate(0px, 0px); } 30% { transform: translate(-140px, 68px); } 45% { transform: translate(-140px, 68px); } 65% { transform: translate(-80px, -10px); } 80% { transform: translate(-80px, -10px); } 100% { transform: translate(0px, 0px); } }',
      animation: 'milRoam 26s ease-in-out infinite',
    },
    figure: ICEBOX_IDLE_BOB,
  },
  nicole: {
    path: {
      keyframes:
        '@keyframes nicRoam { 0% { transform: translate(0px, -10px); } 15% { transform: translate(0px, -10px); } 35% { transform: translate(70px, -40px); } 50% { transform: translate(70px, -40px); } 70% { transform: translate(-70px, 10px); } 85% { transform: translate(-70px, 10px); } 100% { transform: translate(0px, -10px); } }',
      animation: 'nicRoam 26s ease-in-out infinite',
    },
    figure: ICEBOX_IDLE_BOB,
  },
  jason: {
    path: {
      keyframes:
        '@keyframes jasRoam { 0% { transform: translate(0px, 0px); } 12% { transform: translate(0px, 0px); } 32% { transform: translate(100px, 65px); } 47% { transform: translate(100px, 65px); } 67% { transform: translate(-30px, 110px); } 82% { transform: translate(-30px, 110px); } 100% { transform: translate(0px, 0px); } }',
      animation: 'jasRoam 26s ease-in-out infinite',
    },
    figure: ICEBOX_IDLE_BOB,
  },
  jethro: {
    path: {
      keyframes:
        '@keyframes jetRoam { 0% { transform: translate(-20px, 65px); } 10% { transform: translate(-20px, 65px); } 30% { transform: translate(-120px, 35px); } 45% { transform: translate(-120px, 35px); } 65% { transform: translate(20px, 100px); } 80% { transform: translate(20px, 100px); } 100% { transform: translate(-20px, 65px); } }',
      animation: 'jetRoam 26s ease-in-out infinite',
    },
    figure: ICEBOX_IDLE_BOB,
  },
  'darrin-icebox': {
    path: {
      keyframes:
        '@keyframes darRoam { 0% { transform: translate(0px, 0px); } 10% { transform: translate(0px, 0px); } 30% { transform: translate(80px, -20px); } 45% { transform: translate(80px, -20px); } 65% { transform: translate(20px, 60px); } 80% { transform: translate(20px, 60px); } 100% { transform: translate(0px, 0px); } }',
      animation: 'darRoam 26s ease-in-out infinite',
    },
    figure: ICEBOX_IDLE_BOB,
  },
};
