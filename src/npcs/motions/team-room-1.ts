import type { NpcId } from '../npcs';
import type { NpcMotionSpec, NpcPropLayer } from './types';

/**
 * Team Room 1's NPC motions (owner request, 2026-09-30, Track D), copied
 * verbatim from `design/Team Room 1.dc.html`'s `<style>` block and each
 * NPC's `animation:` style, except where a comment below says otherwise.
 *
 * Left out, because they don't belong to an NPC: `jtalk` and `domtalk` (the
 * speech bubbles, ported as each NPC's `idleLines` in `npcs.ts` with their
 * own show windows) and `blink` (the "HALLWAY ↓" HUD pill). The design's
 * "You" Penguin is the local Player's own, never an NPC. Nothing else in the
 * Room is animated: the training progress bars, the GPU temperature panel
 * and the model cube are static art baked into `public/rooms/team-room-1.png`.
 */

/**
 * The design's `bob` sits on a `<div>` around the figure's `<svg>`, so its
 * `translateY(-6px)` moves 6 Stage px. A `figure` track plays inside
 * `npc-sprite.ts`'s 0.62 scaled wrapper, in figure units, so it is 6 / 0.62
 * = 9.68 figure px here to move the same 6 Stage px (the Icebox's
 * `ICEBOX_IDLE_BOB` precedent). Its `transform-origin: 50% 100%` is the
 * bottom-centre of that 70x76 `<div>`, i.e. the figure viewBox's (60, 130).
 * The rotation is verbatim.
 */
const BOB_KEYFRAMES =
  '@keyframes bob { 0%,100% { transform: translateY(0) rotate(-2deg);} 50% { transform: translateY(-9.68px) rotate(2deg);} }';
const BOB_ORIGIN = '60px 130px';

/**
 * Jethro's camera raise from `design/Team Room 1.dc.html`, verbatim: every 4 s
 * his lowered camera and hands fade out (`jdown`), the camera rises to his eye
 * with both hands on it (`jup`) and its flash fires once (`jflash`). It
 * replaces his figure's resting `cameraRaise: 'lowered'` pose (use with
 * `replaceFigureRestPose`). Shared with the Icebox's Jethro, who takes photos
 * the same way as he walks (owner request, 2026-10-01, Track D).
 */
export const JETHRO_CAMERA_PROPS: readonly NpcPropLayer[] = [
  {
    svg: '<circle cx="30" cy="101" r="5.5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2"/><circle cx="90" cy="101" r="5.5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2"/><rect x="84" y="82" width="26" height="18" rx="3" fill="#161719" stroke="#0C4B5F" stroke-width="2"/><rect x="90" y="78" width="10" height="5" rx="1" fill="#161719" stroke="#0C4B5F" stroke-width="1.5"/><circle cx="97" cy="91" r="6" fill="#0a3d4d" stroke="#00BDFF" stroke-width="2"/><circle cx="97" cy="91" r="2.5" fill="#00BDFF"/><rect x="104" y="85" width="3" height="3" fill="#D63C3C"/>',
    motion: {
      keyframes:
        '@keyframes jdown { 0%,26% { opacity:1; } 32%,78% { opacity:0; } 84%,100% { opacity:1; } }',
      animation: 'jdown 4s linear infinite',
    },
  },
  {
    svg: '<rect x="34" y="30" width="52" height="32" rx="4" fill="#161719" stroke="#0C4B5F" stroke-width="2"/><rect x="42" y="24" width="14" height="7" rx="1.5" fill="#161719" stroke="#0C4B5F" stroke-width="1.5"/><rect x="68" y="34" width="11" height="5" rx="1" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="1"/><circle cx="58" cy="47" r="12" fill="#0a3d4d" stroke="#00BDFF" stroke-width="2.5"/><circle cx="58" cy="47" r="5" fill="#00BDFF"/><circle cx="55" cy="44" r="1.8" fill="#F4F4F4"/><rect x="40" y="35" width="3" height="3" fill="#D63C3C"/><circle cx="32" cy="50" r="5.5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2"/><circle cx="88" cy="50" r="5.5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2"/>',
    motion: {
      keyframes:
        '@keyframes jup { 0%,26% { opacity:0; transform:translate(20px,40px); } 34%,76% { opacity:1; transform:translate(0,0); } 84%,100% { opacity:0; transform:translate(20px,40px); } }',
      animation: 'jup 4s ease-out infinite',
    },
    children: [
      {
        // The design's flash circle also carries `opacity="0"`, its look
        // before the animation starts; `jflash` sets every frame's
        // opacity from 0% to 100%, so here the layer's alpha does it.
        svg: '<circle cx="73.5" cy="36.5" r="22" fill="#F4F4F4"/>',
        motion: {
          keyframes:
            '@keyframes jflash { 0%,46% { opacity:0; } 48% { opacity:.95; } 56%,100% { opacity:0; } }',
          animation: 'jflash 4s linear infinite',
        },
      },
    ],
  },
];

export const TEAM_ROOM_1_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Jethro stands and films: his figure sways on a slow `bob` while, every
  // 4 s, his lowered camera and hands fade out (`jdown`), the camera rises
  // to his eye with both hands on it (`jup`, sliding in from down-right as
  // it fades in) and its flash fires once (`jflash`, nested inside `jup`'s
  // group in the design, so it's a child layer that moves with it). The two
  // camera groups replace his figure's resting `cameraRaise: 'lowered'` pose.
  'jethro-team-room-1': {
    figure: {
      keyframes: BOB_KEYFRAMES,
      animation: 'bob 2.4s ease-in-out -0.6s infinite',
      transformOrigin: BOB_ORIGIN,
    },
    replaceFigureRestPose: true,
    props: JETHRO_CAMERA_PROPS,
  },
  // Dom runs a lap of the Room (`domrun`, on his outer `<div>`) on a fast
  // running `bob`. The design's `domrun` translates are absolute Stage
  // positions of that `<div>`'s top-left corner; its 0% frame,
  // `translate(955px, 372px)`, is where he stands at rest, over his (4,0)
  // slot. So each stop here is the design's own minus that rest translate,
  // Stage px relative to his slot point; the stops and timing are verbatim.
  'dom-team-room-1': {
    path: {
      keyframes:
        '@keyframes domrun { 0.00% { transform: translate(0px, 0px); } 11.45% { transform: translate(40px, 130px); } 20.48% { transform: translate(70px, 233px); } 31.84% { transform: translate(-40px, 311px); } 47.69% { transform: translate(-210px, 230px); } 60.07% { transform: translate(-330px, 145px); } 73.04% { transform: translate(-305px, -7px); } 86.30% { transform: translate(-150px, -35px); } 94.85% { transform: translate(-60px, 12px); } 100.00% { transform: translate(0px, 0px); } }',
      animation: 'domrun 6s linear infinite',
    },
    figure: {
      keyframes: BOB_KEYFRAMES,
      animation: 'bob .35s ease-in-out infinite',
      transformOrigin: BOB_ORIGIN,
    },
  },
};
