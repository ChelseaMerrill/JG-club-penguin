import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Dev Pit's NPC motions (#113), copied verbatim from `design/Room 02 Dev
 * Pit.dc.html`'s `<style>` block and each NPC's `animation:` style.
 *
 * Left out, because they don't belong to an NPC: `say` (#36's bubbles),
 * `idle` where nothing else needs it (Ian: no designed motion at all), `blink`
 * (the "TALK · BUG SQUASH" HUD button), `doodle` (a whiteboard sketch fading
 * in/out, opacity only, not attached to any NPC's own group). `sq1`/`sq2`/
 * `sq3` (floating "SQUEAK" HUD callouts) and `chuck`/`tumble` (Ashley's thrown
 * squeaky chicken, an `#F2C12E` ellipse-and-comb blob with its own `translate`
 * path and mid-air `rotate`) are a standalone top-level group placed after
 * every NPC's own block (drawn last, on top, to fly over the whole Room) and
 * never nested inside Ashley's `<g>` -- per the packet's own rule ("if a
 * keyframe animates an element inside an NPC's group, it's that NPC's;
 * otherwise it's decoration"), that makes it decoration here, not an NPC
 * motion, even though it's conceptually "Ashley's chicken". There's also a
 * background "Matt" character (a "not me" speech bubble) with no motion and
 * no `NpcId` -- not one of this Room's six NPCs, so left alone entirely.
 *
 * Ashley has no `animation:` anywhere in her own group (static, arms at her
 * sides) beyond the chicken-toss decoration above, so she isn't in this map.
 */
export const DEV_PIT_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Steven doesn't move (no path), but his own group's figure carries the
  // design's `idle` bob explicitly (`animation:idle 3s ease-in-out -1s
  // infinite`) *and* a scribbling pen prop (`scribble`, a hand+pen writing on
  // his whiteboard notepad). Porting only `props` would otherwise suppress
  // #36's default bob (any designed motion does), so `figure` re-adds that
  // same bob verbatim to match the design instead of losing it.
  steven: {
    figure: {
      keyframes:
        '@keyframes idle { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3px);} }',
      animation: 'idle 3s ease-in-out -1s infinite',
    },
    props: [
      {
        svg: '<path d="M92 78 L112 56" stroke="#2B3557" stroke-width="6" stroke-linecap="round"/><circle cx="113" cy="54" r="5.5" fill="#E4B896" stroke="#0C4B5F" stroke-width="2"/><rect x="110" y="44" width="6" height="14" rx="2" fill="#D63C3C" stroke="#0C4B5F" stroke-width="1.5"/>',
        motion: {
          keyframes:
            '@keyframes scribble { 0%,100% { transform: rotate(0);} 50% { transform: rotate(-14deg);} }',
          animation: 'scribble .5s ease-in-out infinite',
          transformOrigin: '92px 78px',
        },
      },
    ],
  },
  // Dom hops in a loop around the room (his own outer group's `domHop`
  // translate path); `hop2` is the same hop's squash-and-stretch on his whole
  // figure (a slightly taller hop than #36's default bob).
  dom: {
    path: {
      keyframes:
        '@keyframes domHop { 0%,8% { transform: translate(0,0);} 20%,28% { transform: translate(170px,-85px);} 40%,48% { transform: translate(320px,-10px);} 60%,68% { transform: translate(150px,75px);} 80%,88% { transform: translate(300px,150px);} 100% { transform: translate(0,0);} }',
      animation: 'domHop 18s ease-in-out infinite',
    },
    figure: {
      keyframes:
        '@keyframes hop2 { 0%,100% { transform: translateY(0) scaleY(1);} 50% { transform: translateY(-14px) scaleY(1.06);} }',
      animation: 'hop2 .6s ease-in-out infinite',
      transformOrigin: '60px 120px',
    },
  },
  // Ryan walks a loop (`ryanWalk` path) while his whole figure sways to a
  // little dance (`ryanDance`, a rock left/right with a hop on each beat),
  // plus the same scribbling-pen prop Steven has (his own hand/pen colors).
  ryan: {
    path: {
      keyframes:
        '@keyframes ryanWalk { 0%,38% { transform: translate(0,0);} 44% { transform: translate(-40px, -20px);} 52% { transform: translate(-230px, 75px);} 58%,76% { transform: translate(-150px, 115px);} 84% { transform: translate(-230px, 75px);} 92% { transform: translate(-40px, -20px);} 96%,100% { transform: translate(0,0);} }',
      animation: 'ryanWalk 24s ease-in-out infinite',
    },
    figure: {
      keyframes:
        '@keyframes ryanDance { 0%,55% { transform: rotate(0);} 60% { transform: rotate(-12deg) translateY(-6px);} 65% { transform: rotate(12deg);} 70% { transform: rotate(-12deg) translateY(-6px);} 75% { transform: rotate(12deg);} 80% { transform: rotate(-12deg) translateY(-6px);} 85%,100% { transform: rotate(0);} }',
      animation: 'ryanDance 20s ease-in-out infinite',
      transformOrigin: '60px 120px',
    },
    props: [
      {
        svg: '<path d="M92 78 L112 56" stroke="#1f2a4a" stroke-width="6" stroke-linecap="round"/><circle cx="113" cy="54" r="5.5" fill="#F3D3B8" stroke="#0C4B5F" stroke-width="2"/><rect x="110" y="44" width="6" height="14" rx="2" fill="#00BDFF" stroke="#0C4B5F" stroke-width="1.5"/>',
        motion: {
          keyframes:
            '@keyframes scribble { 0%,100% { transform: rotate(0);} 50% { transform: rotate(-14deg);} }',
          animation: 'scribble .5s ease-in-out infinite',
          transformOrigin: '92px 78px',
        },
      },
    ],
  },
  // Sam walks a wider loop (`samWalk`, delayed 6s so he and Ryan don't move
  // in lockstep) while his whole figure spins a full 360° (`samSpin`, delayed
  // 4s), plus the same scribbling-pen prop.
  sam: {
    path: {
      keyframes:
        '@keyframes samWalk { 0%,38% { transform: translate(0,0);} 44% { transform: translate(100px, 50px);} 50% { transform: translate(-90px, 145px);} 58%,76% { transform: translate(-220px, 80px);} 84% { transform: translate(-90px, 145px);} 90% { transform: translate(100px, 50px);} 96%,100% { transform: translate(0,0);} }',
      animation: 'samWalk 24s ease-in-out -6s infinite',
    },
    figure: {
      keyframes:
        '@keyframes samSpin { 0%,55% { transform: rotate(0);} 60%,80% { transform: rotate(360deg);} 85%,100% { transform: rotate(360deg);} }',
      animation: 'samSpin 20s ease-in-out -4s infinite',
      transformOrigin: '60px 120px',
    },
    props: [
      {
        svg: '<path d="M92 78 L112 56" stroke="#1f2a4a" stroke-width="6" stroke-linecap="round"/><circle cx="113" cy="54" r="5.5" fill="#F3D3B8" stroke="#0C4B5F" stroke-width="2"/><rect x="110" y="44" width="6" height="14" rx="2" fill="#00BDFF" stroke="#0C4B5F" stroke-width="1.5"/>',
        motion: {
          keyframes:
            '@keyframes scribble { 0%,100% { transform: rotate(0);} 50% { transform: rotate(-14deg);} }',
          animation: 'scribble .5s ease-in-out infinite',
          transformOrigin: '92px 78px',
        },
      },
    ],
  },
};
