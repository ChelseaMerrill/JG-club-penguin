import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * Town Center's NPC motions (#113), copied verbatim from `design/Room 01
 * Town Center.dc.html`'s `<style>` block and each NPC's `animation:` style.
 *
 * Left out, because they don't belong to a placed NPC or need something this
 * system doesn't support:
 * - `cartwheel`, `walkJory`: both `@keyframes` rules exist in the
 *   stylesheet, but neither is ever referenced by an `animation:` anywhere
 *   in the design's markup (confirmed by grepping the design file for each
 *   name) -- dead CSS left over from an earlier design pass, animating
 *   nothing.
 * - `trophyReach`, `trophyShow`: Sydney reaching for, then holding up, a
 *   trophy. Every stop in both `@keyframes` rules sets only `opacity`, never
 *   `transform`, which `css-keyframes.ts` couldn't read when this Room was
 *   ported (it can since 2026-09-30, for `props` layers only); they're
 *   still left out, not re-ported.
 * - `swim`, `feedMe`: Gil the betta fish and his "feed me" bubble, a fish
 *   tank decoration beside Anthony's Roof Deck cameo (see `riders` below),
 *   not an NPC. `swim` also uses `skewY()`, which `css-keyframes.ts` doesn't
 *   support, so it would need to be left out even if it were an NPC's.
 * - `riders`: the cycling cameo silhouettes visible through the elevator's
 *   clip-masked window (Millie/Tony, Anthony/Ian, Casey/Brandon,
 *   Jethro/...are drawn there) -- decoration on the elevator door graphic,
 *   not a Room NPC (these are other Rooms' NPCs, shown riding by).
 * - `hype`: not left out -- see `darrin.props` below.
 */
export const TOWN_CENTER_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Darrin patrols a loop around the floor (`walkDarrin`) while pumping his
  // fists (`pump`, the whole figure). `hype` -- three lines flashing above
  // his head -- is nested inside `pump`'s own group in the design, so it's
  // ported as a `props` layer: `room-npc-motions.ts` parents a prop's
  // container under the figure's own container, so it inherits `pump`'s
  // translate/rotate/scale the same way CSS inheritance does in the design.
  darrin: {
    path: {
      keyframes:
        '@keyframes walkDarrin { 0% { transform: translate(0,0);} 20% { transform: translate(300px,150px);} 40% { transform: translate(150px,225px);} 60% { transform: translate(-100px,150px);} 80% { transform: translate(-50px,50px);} 100% { transform: translate(0,0);} }',
      animation: 'walkDarrin 16s linear infinite',
    },
    figure: {
      keyframes:
        '@keyframes pump { 0%,100% { transform: translateY(0) scaleY(1) rotate(0);} 12% { transform: translateY(4px) scaleY(.9) rotate(0);} 40% { transform: translateY(-40px) scaleY(1.08) rotate(-6deg);} 55% { transform: translateY(-34px) scaleY(1.05) rotate(6deg);} 78% { transform: translateY(0) scaleY(.92) rotate(0);} }',
      animation: 'pump .7s ease-in-out infinite',
      transformOrigin: '60px 70px',
    },
    props: [
      {
        svg: '<path d="M40 6 L44 -4 M60 2 L60 -10 M80 6 L76 -4" stroke="#00BDFF" stroke-width="3" stroke-linecap="round"/>',
        motion: {
          keyframes:
            '@keyframes hype { 0%,100% { opacity:0; transform: scale(.6);} 45% { opacity:1; transform: scale(1);} }',
          animation: 'hype .7s ease-in-out infinite',
          transformOrigin: '60px 10px',
        },
      },
    ],
  },
  // Jory bounces on the couch (`jump`, #150). In the design the animation
  // sits on a Stage-level group holding her figure and her nameplate (her
  // `sayJory` bubble is a sibling outside it, so it stays still), so it's a
  // `stage` track. The design sets no `transform-origin` on that group, so
  // the browser scales about the Stage's top-left corner, and this port
  // leaves the field unset to match (#150 H1): she stretches slightly at
  // 30%, is about 28 px up and squashed at 60%, then falls back.
  jory: {
    stage: {
      keyframes:
        '@keyframes jump { 0%,100% { transform: translateY(0) scaleY(1);} 30% { transform: translateY(-26px) scaleY(1.05);} 60% { transform: translateY(0) scaleY(.94);} }',
      animation: 'jump .9s ease-in-out infinite',
    },
  },
  sydney: {
    path: {
      keyframes:
        '@keyframes walkSyd { 0%,11% { transform: translate(0,0);} 19%,35% { transform: translate(-150px,75px);} 43%,50% { transform: translate(0,0);} 56%,88% { transform: translate(100px,-32px);} 94%,100% { transform: translate(0,0);} }',
      animation: 'walkSyd 24s ease-in-out infinite',
    },
  },
  // Jon patrols a loop (`walkJon`) while a "magic trick" fan of cards spins
  // and arcs above his hand (`trick`), a `props` layer nested inside his
  // group in the design; the design sets no `transform-origin` on it, so
  // this port leaves the field unset (the system's own 0,0 default).
  jon: {
    path: {
      keyframes:
        '@keyframes walkJon { 0% { transform: translate(0,0);} 18%,32% { transform: translate(150px, 75px);} 45% { transform: translate(80px, 110px);} 60%,74% { transform: translate(-70px, 35px);} 100% { transform: translate(0,0);} }',
      animation: 'walkJon 14s linear infinite',
    },
    // The spinning fan is the moving version of his `npcs.ts` `cards`.
    replaceFigureRestPose: true,
    props: [
      {
        svg: '<rect x="0" y="0" width="16" height="22" rx="2" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="1.5"/><rect x="3" y="-3" width="16" height="22" rx="2" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="1.5"/><rect x="6" y="-6" width="16" height="22" rx="2" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="1.5"/><path d="M14 -1 l2 3 l-2 3 l-2 -3 z" fill="#00BDFF"/>',
        motion: {
          keyframes:
            '@keyframes trick { 0%,17% { transform: translate(96px,84px) rotate(-12deg);} 20% { transform: translate(90px,50px) rotate(160deg);} 25% { transform: translate(84px,30px) rotate(340deg);} 30% { transform: translate(96px,84px) rotate(348deg);} 32%,59% { transform: translate(96px,84px) rotate(-12deg);} 62% { transform: translate(90px,50px) rotate(160deg);} 67% { transform: translate(84px,30px) rotate(340deg);} 72%,100% { transform: translate(96px,84px) rotate(-12deg);} }',
          animation: 'trick 14s linear infinite',
        },
      },
    ],
  },
};
