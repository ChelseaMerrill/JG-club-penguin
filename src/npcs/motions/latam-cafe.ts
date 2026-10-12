import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The LATAM Café's seven JGers (`design/Latam Cafe.dc.html`, owner request,
 * 2026-10-09), ported mechanically from that design's own SMIL
 * `<animateTransform>`s, the same "the same `dur`, linear timing" convention
 * The Mullet's port used (`motions/the-mullet.ts`'s own header comment):
 *
 * Five stand still and only bob: Alexandre Nunes, Ygor Azevedo, Fernanda
 * Gioiosa and Jean Rodrigues share the design's `translate(0,0;0,-1.5;0,0)`
 * over 3.1s (Sander Nonaka's own is 3.4s); the bob plays on a `<g>` *outside*
 * the design's own `scale(0.58)` (Sander's own `scale(.72)`) figure wrapper,
 * i.e. in Stage px, so it is divided by that same scale to land in the
 * `figure` track's viewBox units: 1.5 / 0.58 = 2.59px (five of them), 1.5 /
 * 0.72 = 2.08px (Sander).
 *
 * Joao Vitor Amorim and Vinicius Martins walk a straight line back and forth
 * (the design's own `values="A;B;A"` over one `dur`, a round trip, needs no
 * intermediate corner the way The Mullet's L-shaped laps do): Joao between
 * his `npcSlots` tile `(1,2)` (design point `740,355`) and `1190,580`, over
 * 16s; Vinicius between his tile `(11,5)` (`1060,670`) and `570,425`, over
 * 18s. Each `path` delta is the second design point minus the first (the
 * `offset` each slot already carries cancels out). Their faster walking bob
 * (`values="0,0;0,-4;0,0"` over .6s, outside the same `scale(0.58)`) becomes
 * 4 / 0.58 = 6.90px.
 */
export const LATAM_CAFE_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  'alexandre-nunes': {
    figure: {
      keyframes:
        '@keyframes bobAlexandreNunes { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-2.59px);} }',
      animation: 'bobAlexandreNunes 3.1s linear infinite',
    },
  },
  'ygor-azevedo': {
    figure: {
      keyframes:
        '@keyframes bobYgorAzevedo { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-2.59px);} }',
      animation: 'bobYgorAzevedo 3.1s linear infinite',
    },
  },
  'fernanda-gioiosa': {
    figure: {
      keyframes:
        '@keyframes bobFernandaGioiosa { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-2.59px);} }',
      animation: 'bobFernandaGioiosa 3.1s linear infinite',
    },
  },
  'jean-rodrigues': {
    figure: {
      keyframes:
        '@keyframes bobJeanRodrigues { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-2.59px);} }',
      animation: 'bobJeanRodrigues 3.1s linear infinite',
    },
  },
  'sander-nonaka': {
    figure: {
      keyframes:
        '@keyframes bobSanderNonaka { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-2.08px);} }',
      animation: 'bobSanderNonaka 3.4s linear infinite',
    },
  },
  'joao-vitor-amorim': {
    path: {
      keyframes:
        '@keyframes joaoVitorAmorimWalk { 0% { transform: translate(0,0);} 50% { transform: translate(450px,225px);} 100% { transform: translate(0,0);} }',
      animation: 'joaoVitorAmorimWalk 16s linear infinite',
    },
    figure: {
      keyframes:
        '@keyframes bobJoaoVitorAmorim { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-6.9px);} }',
      animation: 'bobJoaoVitorAmorim .6s linear infinite',
    },
  },
  'vinicius-martins': {
    path: {
      keyframes:
        '@keyframes viniciusMartinsWalk { 0% { transform: translate(0,0);} 50% { transform: translate(-490px,-245px);} 100% { transform: translate(0,0);} }',
      animation: 'viniciusMartinsWalk 18s linear infinite',
    },
    figure: {
      keyframes:
        '@keyframes bobViniciusMartins { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-6.9px);} }',
      animation: 'bobViniciusMartins .6s linear infinite',
    },
  },
};
