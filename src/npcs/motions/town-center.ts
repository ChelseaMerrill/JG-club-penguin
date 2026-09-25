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
 * - `jump` (and its `sayJory` bubble, and the "SURVIVOR" clip-path text):
 *   Jory Hutchins's bounce and nameplate. `town-center.ts` (the Room
 *   definition)'s own `npcSlots` comment already documents why she has no
 *   `NpcId`/slot: her `jump` figure and badge are nested *inside* Sydney's
 *   `walkSyd` group, riding along wherever Sydney's walk cycle currently
 *   places her, so there's no independent position -- and no `NpcId` -- to
 *   hang this motion spec on.
 * - `trophyReach`, `trophyShow`: Sydney reaching for, then holding up, a
 *   trophy. Every stop in both `@keyframes` rules sets only `opacity`, never
 *   `transform` -- exactly the case `css-keyframes.ts`'s own docs call out
 *   as unsupported ("opacity, filter, ... ignored"): with no `transform` to
 *   sample, porting these would show the trophy motionless and permanently
 *   visible instead of the design's brief reach-then-show flash.
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
