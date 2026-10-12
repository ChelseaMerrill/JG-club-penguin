import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Mullet's NPC motions (owner request, 2026-10-01, Track D: "the right
 * characters are in the mullet, however, the characters are missing their
 * actions"), from `design/The Mullet.dc.html`.
 *
 * That design animates its characters with SMIL (`<animate>`,
 * `<animateTransform>`, `<animateMotion>`), not CSS, so each is re-expressed
 * here as the equivalent `@keyframes` rule, mechanically, as Team Room 4's
 * port did: `values` spaced evenly (SMIL's default `calcMode="linear"`, so
 * `linear` timing) or placed at their `keyTimes`, the same `dur`, and a
 * `begin` written as the same phase offset as a negative `animation-delay`
 * (`begin="1.2s"` over a 4.8s cycle is `-3.6s`). A `calcMode="discrete"`
 * opacity becomes a hard switch between two stops 0.01% apart. The keyframe
 * names are ours; SMIL has none.
 *
 * `<animateMotion>` has no CSS equivalent, so its `path` is turned into
 * `translate()` stops, computed once by a throwaway arc-length sampler and
 * recorded here: a straight polyline, played `calcMode="paced"` (SMIL's
 * default for `animateMotion`, constant speed), gets one stop per corner at
 * its share of the path's length, which is exact; a curve (the ping-pong
 * ball, the thrown chickens) is sampled by arc length into enough stops that
 * the straight chords between them stay within about 1.3 Stage px of it.
 * None uses `rotate="auto"`.
 *
 * Units: a translate on a group outside a figure's `<svg>` is in Stage px.
 * On the NPC's outer group it is a `path` (Stage px from the slot point);
 * moving just the figure, it is a `figure` track, inside `npc-sprite.ts`'s
 * 0.62 scaled wrapper, so divided by 0.62 to move the same Stage px (Team
 * Room 1's `bob` precedent); moving the figure and its nameplate but not
 * its feet off their spot, it is a `stage` track. Transforms inside a
 * figure's `<svg>` are figure viewBox units already, verbatim.
 *
 * Left out, because they don't belong to an NPC (the Dev Pit's precedent,
 * `dev-pit.ts`): the after-party `confetti` and the HUD's `blink` exit pills,
 * both CSS, are hidden from the baked Room art (`scripts/export-room-art.ts`)
 * and not drawn at all; the Ms. Pac-Man's wobbling joystick (an
 * `animateTransform` rotate on the cabinet, outside Jason's group) is the
 * cabinet's, baked still into `public/rooms/the-mullet.png`. The design's
 * "You" Penguin is the local Player's own, never an NPC.
 */

/** Stage px to figure units inside `npc-sprite.ts`'s scaled wrapper (Human NPCs draw at 0.62). */
const TO_FIGURE = '1.612903';

/** A paddle's swing: the design's `rotate` `0;±35;0` about the hand, 2.4s. */
function paddleSwing(name: string, deg: number): string {
  return `@keyframes ${name} { 0%,100% { transform: rotate(0deg);} 50% { transform: rotate(${deg}deg);} }`;
}

/** The design's ping-pong paddle, verbatim from inside each player's `<svg>`, in the hand at `cx`. */
function paddle(cx: number): string {
  return `<rect x="${cx - 2.5}" y="88" width="5" height="14" rx="2" fill="#8B5A2B" stroke="#0C4B5F" stroke-width="1.5"/><circle cx="${cx}" cy="76" r="14" fill="#D9534F" stroke="#0C4B5F" stroke-width="2"/>`;
}

/**
 * Tony's cue, one of the design's two cue `<g>`s, verbatim: its lines are in
 * the same Stage px as his `<svg x="462.8" y="440.5">` (both inside his walk
 * group), so they're mapped into his figure's units with that `<svg>`'s own
 * placement and his 0.62 scale.
 */
function cue(lines: string, shiftX = 0): string {
  const shift = shiftX ? `translate(${shiftX} 0) ` : '';
  return `<g transform="${shift}scale(${TO_FIGURE}) translate(-462.8 -440.5)">${lines}</g>`;
}

export const THE_MULLET_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Abby Rivera (owner request, 2026-10-02, Track D) paints the wall beside
  // her: her right arm is raised to it with her card's own brush, and every
  // 8 s she paints four stripes in her palette's colours, one under the
  // next, each brushed back and forth along the wall's slope (the arm turns
  // about her shoulder, (90, 74), to reach each one), then they fade and she
  // starts again. Her figure keeps her card's own 2.3 s bob; the stripes and
  // arm are props, so they bob with her. Authored, not from a Room design.
  'abby-rivera': {
    figure: {
      keyframes:
        '@keyframes bobAbby { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3.41px);} }',
      animation: 'bobAbby 2.3s ease-in-out infinite',
    },
    props: [
      {
        svg: '<path d="M107 22.5 L137 37.5" stroke="#00BDFF" stroke-width="6.5" stroke-linecap="round" opacity=".9"/>',
        motion: {
          keyframes:
            '@keyframes abbyStripe1 { 0%,7% { opacity:0;} 20%,90% { opacity:1;} 97%,100% { opacity:0;} }',
          animation: 'abbyStripe1 8s linear infinite',
        },
      },
      {
        svg: '<path d="M114.2 28.7 L144.2 43.7" stroke="#E8C547" stroke-width="6.5" stroke-linecap="round" opacity=".9"/>',
        motion: {
          keyframes:
            '@keyframes abbyStripe2 { 0%,27% { opacity:0;} 40%,90% { opacity:1;} 97%,100% { opacity:0;} }',
          animation: 'abbyStripe2 8s linear infinite',
        },
      },
      {
        svg: '<path d="M120.1 36.1 L150.1 51.1" stroke="#D6262E" stroke-width="6.5" stroke-linecap="round" opacity=".9"/>',
        motion: {
          keyframes:
            '@keyframes abbyStripe3 { 0%,47% { opacity:0;} 60%,90% { opacity:1;} 97%,100% { opacity:0;} }',
          animation: 'abbyStripe3 8s linear infinite',
        },
      },
      {
        svg: '<path d="M124.7 44.4 L154.7 59.4" stroke="#3F8A45" stroke-width="6.5" stroke-linecap="round" opacity=".9"/>',
        motion: {
          keyframes:
            '@keyframes abbyStripe4 { 0%,67% { opacity:0;} 80%,90% { opacity:1;} 97%,100% { opacity:0;} }',
          animation: 'abbyStripe4 8s linear infinite',
        },
      },
      {
        svg: '<rect x="84" y="70" width="12" height="30" rx="6" fill="#EADBC8" stroke="#0C4B5F" stroke-width="2.5" transform="rotate(-135 90 74)"/><path d="M107 57 L119 36" stroke="#7A4A26" stroke-width="3" stroke-linecap="round"/><path d="M117 39 L119 35 L121 30 Q124 27 123 33 L120 38 Z" fill="#00BDFF" stroke="#0C4B5F" stroke-width="1.5"/><circle cx="108.4" cy="55.6" r="5.5" fill="#A8714A" stroke="#0C4B5F" stroke-width="2"/>',
        motion: {
          keyframes:
            '@keyframes abbyBrush { 0% { transform: rotate(0deg) translate(0,0);} 5% { transform: rotate(0deg) translate(-6px,-3px);} 8.75% { transform: rotate(0deg) translate(6px,3px);} 12.5% { transform: rotate(0deg) translate(-6px,-3px);} 16.25% { transform: rotate(0deg) translate(6px,3px);} 20% { transform: rotate(0deg) translate(0px,0px);} 25% { transform: rotate(10deg) translate(-6px,-3px);} 28.75% { transform: rotate(10deg) translate(6px,3px);} 32.5% { transform: rotate(10deg) translate(-6px,-3px);} 36.25% { transform: rotate(10deg) translate(6px,3px);} 40% { transform: rotate(10deg) translate(0px,0px);} 45% { transform: rotate(20deg) translate(-6px,-3px);} 48.75% { transform: rotate(20deg) translate(6px,3px);} 52.5% { transform: rotate(20deg) translate(-6px,-3px);} 56.25% { transform: rotate(20deg) translate(6px,3px);} 60% { transform: rotate(20deg) translate(0px,0px);} 65% { transform: rotate(30deg) translate(-6px,-3px);} 68.75% { transform: rotate(30deg) translate(6px,3px);} 72.5% { transform: rotate(30deg) translate(-6px,-3px);} 76.25% { transform: rotate(30deg) translate(6px,3px);} 80% { transform: rotate(30deg) translate(0px,0px);} 90% { transform: rotate(30deg) translate(0,0);} 100% { transform: rotate(0deg) translate(0,0);} }',
          animation: 'abbyBrush 8s ease-in-out infinite',
          transformOrigin: '90px 74px',
        },
      },
    ],
  },
  // Adam Wilson-Hwang and Bryan Sambrook (owner request, 2026-10-02, Track
  // D) walk laps of the open floor, each on his card's own bob: Adam from
  // (11,1) south to (11,4), east to (13,4), north to (13,1) and home; Bryan
  // from (7,10) north to (7,8), east to (12,8), past the front of the
  // ping-pong table, south to (12,10) and home. Each lap keeps to walkable tiles
  // clear of every fixture and other NPC's slot; `translate()`s are
  // `tileToScreen` deltas (100/50 tiles) from his own tile, timed by each
  // leg's length with a short pause at each corner. Authored.
  'adam-wilson-hwang': {
    path: {
      keyframes:
        '@keyframes adamLap { 0%,3% { transform: translate(0,0);} 29.4%,32.4% { transform: translate(-150px,75px);} 50%,53% { transform: translate(-50px,125px);} 79.4%,82.4% { transform: translate(100px,50px);} 100% { transform: translate(0,0);} }',
      animation: 'adamLap 22s ease-in-out infinite',
    },
    figure: {
      keyframes:
        '@keyframes bobAdam { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3.41px);} }',
      animation: 'bobAdam 2.6s ease-in-out infinite',
    },
  },
  'bryan-sambrook': {
    path: {
      keyframes:
        '@keyframes bryanLap { 0%,3% { transform: translate(0,0);} 15.57%,18.57% { transform: translate(100px,-50px);} 50%,53% { transform: translate(350px,75px);} 65.57%,68.57% { transform: translate(250px,125px);} 100% { transform: translate(0,0);} }',
      animation: 'bryanLap 26s ease-in-out infinite',
    },
    figure: {
      keyframes:
        '@keyframes bobBryan { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-3.41px);} }',
      animation: 'bobBryan 2.4s ease-in-out infinite',
    },
  },
  // Tony lines up a shot, walks round the pool table, and shoots again from
  // the far side, then walks back (`animateMotion` `M0 0 L0 83 L150 153 L210
  // 133`, `keyPoints` `0;0;1;1;0` at `keyTimes` `0;0.3333;0.5;0.8333;1` of
  // 12s, linear: constant speed, so the corners fall at their 26.6% and
  // 79.7% shares of the 311.8 px path). His slot `offset` puts him where the
  // design does. While he stands at each end, one of the design's two cues
  // shows (a discrete opacity: `1;0` at `0;0.3333`, then `0;1;0` at
  // `0;0.5;0.8333`) and strokes (`0 0;-12 -1.4;0 0;0 0`, and `0 0;12 6.4;0
  // 0;0 0`, at `keyTimes` `0;0.4;0.5;1` of 1.6s; Stage px, so / 0.62), on
  // his path's clock. The first cue reaches 294 figure units right of his
  // figure, past the 190 a prop texture's frame holds, so it is drawn 115
  // units left and its visibility layer carries it back.
  tony: {
    path: {
      keyframes:
        '@keyframes tonyRound { 0%,33.33% { transform: translate(0,0);} 37.77% { transform: translate(0,83px);} 46.62% { transform: translate(150px,153px);} 50%,83.33% { transform: translate(210px,133px);} 86.71% { transform: translate(150px,153px);} 95.56% { transform: translate(0,83px);} 100% { transform: translate(0,0);} }',
      animation: 'tonyRound 12s linear infinite',
    },
    props: [
      {
        svg: '',
        pathClock: true,
        motion: {
          keyframes:
            '@keyframes tonyCueNear { 0%,33.32% { opacity:1; transform: translate(115px,0);} 33.33%,100% { opacity:0; transform: translate(115px,0);} }',
          animation: 'tonyCueNear 12s linear infinite',
        },
        children: [
          {
            svg: cue(
              '<line x1="505" y1="496" x2="645" y2="512" stroke="#d9dcdf" stroke-width="3" stroke-linecap="round"/><line x1="505" y1="496" x2="528" y2="499" stroke="#161719" stroke-width="4" stroke-linecap="round"/>',
              -115,
            ),
            motion: {
              keyframes:
                '@keyframes tonyStrokeNear { 0% { transform: translate(0,0);} 40% { transform: translate(-19.35px,-2.26px);} 50%,100% { transform: translate(0,0);} }',
              animation: 'tonyStrokeNear 1.6s linear infinite',
            },
          },
        ],
      },
      {
        svg: '',
        pathClock: true,
        motion: {
          keyframes:
            '@keyframes tonyCueFar { 0%,49.99% { opacity:0;} 50%,83.32% { opacity:1;} 83.33%,100% { opacity:0;} }',
          animation: 'tonyCueFar 12s linear infinite',
        },
        children: [
          {
            svg: cue(
              '<line x1="515" y1="498" x2="440" y2="458" stroke="#d9dcdf" stroke-width="3" stroke-linecap="round"/><line x1="515" y1="498" x2="495" y2="487" stroke="#161719" stroke-width="4" stroke-linecap="round"/>',
            ),
            motion: {
              keyframes:
                '@keyframes tonyStrokeFar { 0% { transform: translate(0,0);} 40% { transform: translate(19.35px,10.32px);} 50%,100% { transform: translate(0,0);} }',
              animation: 'tonyStrokeFar 1.6s linear infinite',
            },
          },
        ],
      },
    ],
  },
  // Jon and Brandon rally across the ping-pong table: each sways on his own
  // feet with his nameplate (`translate` `0 0;22 -11;-6 3;0 0`, and Brandon's
  // `0 0;-18 9;20 -10;0 0` `begin="1.2s"`, over 4.8s, on the group holding
  // his shadow, figure and nameplate: a `stage` track, which keeps playing
  // while his dialog is open, as the ball does) and swings his paddle (the
  // design's `rotate` on it, inside his `<svg>`, verbatim). Brandon's slot
  // `offset` puts him where the design does; Jon's slot is already within
  // 2.4 px of it.
  'jon-mullet': {
    stage: {
      keyframes:
        '@keyframes jonSway { 0%,100% { transform: translate(0,0);} 33.33% { transform: translate(22px,-11px);} 66.67% { transform: translate(-6px,3px);} }',
      animation: 'jonSway 4.8s linear infinite',
    },
    props: [
      {
        svg: paddle(90),
        motion: {
          keyframes: paddleSwing('jonPaddle', 35),
          animation: 'jonPaddle 2.4s linear infinite',
          transformOrigin: '90px 101px',
        },
      },
      // The ball, verbatim, isn't in either player's group: it flies
      // `M880 612 Q950 590 1030 676 Q950 590 880 612` (paced, 2.4s) in Stage
      // coordinates. It rides on Jon's figure here, so it is placed from his
      // (7,6) slot point, (850, 598), and its stops (every 0.1s of two
      // rallies, 4.8s) subtract his sway at that moment, in figure units: it
      // flies exactly the design's path over the baked table.
      {
        svg: `<g transform="translate(60 120) scale(${TO_FIGURE}) translate(30 14)"><circle cx="0" cy="0" r="3.5" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="1"/></g>`,
        motion: {
          keyframes:
            '@keyframes jonBall { 0% { transform: translate(0,0);} 2.08% { transform: translate(20.31px,-4.21px);} 4.17% { transform: translate(41.16px,-5.01px);} 6.25% { transform: translate(62.04px,-2.36px);} 8.33% { transform: translate(82.49px,3.48px);} 10.42% { transform: translate(102.18px,12.08px);} 12.5% { transform: translate(120.96px,22.96px);} 14.58% { transform: translate(138.79px,35.69px);} 16.67% { transform: translate(155.68px,49.88px);} 18.75% { transform: translate(171.71px,65.27px);} 20.83% { transform: translate(186.94px,81.61px);} 22.92% { transform: translate(201.46px,98.75px);} 25% { transform: translate(215.32px,116.53px);} 27.08% { transform: translate(197.02px,100.97px);} 29.17% { transform: translate(178.07px,86.05px);} 31.25% { transform: translate(158.4px,71.92px);} 33.33% { transform: translate(137.94px,58.76px);} 35.42% { transform: translate(121.65px,44.25px);} 37.5% { transform: translate(104.43px,31.23px);} 39.58% { transform: translate(86.26px,20.05px);} 41.67% { transform: translate(67.17px,11.15px);} 43.75% { transform: translate(47.32px,5px);} 45.83% { transform: translate(27.05px,2.05px);} 47.92% { transform: translate(6.8px,2.54px);} 50% { transform: translate(-12.9px,6.45px);} 52.08% { transform: translate(12.45px,-0.28px);} 54.17% { transform: translate(38.34px,-3.6px);} 56.25% { transform: translate(64.26px,-3.47px);} 58.33% { transform: translate(89.75px,-0.14px);} 60.42% { transform: translate(114.48px,5.93px);} 62.5% { transform: translate(138.3px,14.29px);} 64.58% { transform: translate(161.17px,24.5px);} 66.67% { transform: translate(183.1px,36.17px);} 68.75% { transform: translate(200.74px,50.75px);} 70.83% { transform: translate(217.59px,66.29px);} 72.92% { transform: translate(233.71px,82.62px);} 75% { transform: translate(249.19px,99.6px);} 77.08% { transform: translate(232.51px,83.22px);} 79.17% { transform: translate(215.17px,67.5px);} 81.25% { transform: translate(197.11px,52.57px);} 83.33% { transform: translate(178.26px,38.59px);} 85.42% { transform: translate(158.54px,25.81px);} 87.5% { transform: translate(137.9px,14.5px);} 89.58% { transform: translate(116.3px,5.03px);} 91.67% { transform: translate(93.78px,-2.16px);} 93.75% { transform: translate(70.51px,-6.59px);} 95.83% { transform: translate(46.81px,-7.83px);} 97.92% { transform: translate(23.13px,-5.62px);} 100% { transform: translate(0,0);} }',
          animation: 'jonBall 4.8s linear infinite',
        },
      },
    ],
  },
  'brandon-mullet': {
    stage: {
      keyframes:
        '@keyframes brandonSway { 0%,100% { transform: translate(0,0);} 33.33% { transform: translate(-18px,9px);} 66.67% { transform: translate(20px,-10px);} }',
      animation: 'brandonSway 4.8s linear -3.6s infinite',
    },
    props: [
      {
        svg: paddle(30),
        motion: {
          keyframes: paddleSwing('brandonPaddle', -35),
          animation: 'brandonPaddle 2.4s linear -1.2s infinite',
          transformOrigin: '30px 101px',
        },
      },
    ],
  },
};
