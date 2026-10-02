import type { NpcId } from '../npcs';
import type { NpcMotionSpec, NpcPropLayer } from './types';

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
 * scaled wrapper, so divided by the NPC's draw scale to move the same Stage px
 * (Team Room 1's `bob` precedent); moving the figure and its nameplate but not
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

/**
 * Stage px to figure units inside `npc-sprite.ts`'s scaled wrapper: 1 over the
 * NPC's draw scale (`npcs.ts`: Jason, Nicole and Ann Marie draw at 0.5, Jory,
 * Ashley, Jon, Brandon and Dom at 0.58, Tony at the Human default, 0.62).
 */
const TO_FIGURE_058 = (1 / 0.58).toFixed(6);
const TO_FIGURE_062 = (1 / 0.62).toFixed(6);

/**
 * The lap Dom and Jory both run: Dom's 12-corner `animateMotion` path, 9.4s,
 * paced (Jory's is the same path minus (450, 150), and her figure is drawn
 * 450, 150 further right and down, so both run one loop of the Room). Its
 * stops sit at each corner's share of the 1565.6 px path; `dx`/`dy`
 * re-express Dom's path points relative to the NPC's slot point.
 */
function lap(name: string, dx: number, dy: number): string {
  const corners: [number, number, number][] = [
    [0, 30, -13],
    [5.89, 50, -103],
    [16.11, 210, -98],
    [27.4, 370, -23],
    [35.12, 420, 87],
    [42.21, 435, 197],
    [51.04, 330, 287],
    [57.68, 230, 315],
    [64.99, 120, 347],
    [74.91, -30, 307],
    [81.74, -68, 207],
    [93.24, -68, 27],
    [100, 30, -13],
  ];
  const stops = corners.map(
    ([at, x, y]) =>
      `${at}% { transform: translate(${+(x + dx).toFixed(2)}px,${+(y + dy).toFixed(2)}px);}`,
  );
  return `@keyframes ${name} { ${stops.join(' ')} }`;
}

/** A paddle's swing: the design's `rotate` `0;±35;0` about the hand, 2.4s. */
function paddleSwing(name: string, deg: number): string {
  return `@keyframes ${name} { 0%,100% { transform: rotate(0deg);} 50% { transform: rotate(${deg}deg);} }`;
}

/** The design's ping-pong paddle, verbatim from inside each player's `<svg>`, in the hand at `cx`. */
function paddle(cx: number): string {
  return `<rect x="${cx - 2.5}" y="88" width="5" height="14" rx="2" fill="#8B5A2B" stroke="#0C4B5F" stroke-width="1.5"/><circle cx="${cx}" cy="76" r="14" fill="#D9534F" stroke="#0C4B5F" stroke-width="2"/>`;
}

/**
 * Clucknelius, verbatim from Ashley's own `<svg>`, minus its discrete
 * `<animate>` opacity (the keyframes own it now).
 */
const ASHLEY_HELD_CHICKEN =
  '<ellipse cx="20" cy="98" rx="11" ry="9" fill="#F2C12E" stroke="#0C4B5F" stroke-width="2"/><path d="M14 90 Q10 74 18 70 Q24 76 22 90" fill="#F2C12E" stroke="#0C4B5F" stroke-width="2"/><circle cx="19" cy="73" r="6" fill="#F2C12E" stroke="#0C4B5F" stroke-width="2"/><polygon points="24,73 32,75 24,77" fill="#E07A2F"/><path d="M17 67 q2 -6 5 0 q2 -5 4 1" fill="#D63C3C"/><circle cx="21" cy="72" r="1.3" fill="#161719"/><path d="M8 106 l-4 6 M12 106 l-2 7" stroke="#E07A2F" stroke-width="2.5" stroke-linecap="round"/>';

/**
 * The thrown chicken, verbatim from the design's three flying `<g>`s (drawn
 * about its own (0, 0) in Stage px), placed on the held chicken's body,
 * figure (20, 98), at Stage size: each throw leaves from Ashley's hand.
 */
const ASHLEY_THROWN_CHICKEN = `<g transform="translate(20 98) scale(${TO_FIGURE_058})"><ellipse cx="0" cy="2" rx="8" ry="6.5" fill="#F2C12E" stroke="#0C4B5F" stroke-width="1.5"/><circle cx="5" cy="-6" r="4" fill="#F2C12E" stroke="#0C4B5F" stroke-width="1.5"/><polygon points="8.5,-6.5 13,-5 8.5,-3.5" fill="#E07A2F"/><path d="M3 -10 q1.5 -4 3 0" fill="#D63C3C"/></g>`;

/**
 * One throw: the design's flying `<g>`, its discrete opacity (shown only in
 * flight) and its `animateMotion` along a quadratic curve (`keyPoints`
 * `0;0;1;1`, linear, so constant speed between its `keyTimes`), sampled
 * into 16 chords and re-expressed in figure units from its start point;
 * inside it, the design's own spin (`rotate` `0;360` over 0.5s) about the
 * chicken's centre. Each throw goes while Ashley stands still at one of her
 * three stops, from exactly where the design draws her hand there, so it
 * runs on her path's clock.
 */
function throwLayer(keyframes: string, name: string): NpcPropLayer {
  return {
    svg: '',
    pathClock: true,
    motion: { keyframes, animation: `${name} 18s linear infinite` },
    children: [
      {
        svg: ASHLEY_THROWN_CHICKEN,
        motion: {
          keyframes:
            '@keyframes ashleyChickenSpin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }',
          animation: 'ashleyChickenSpin .5s linear infinite',
          transformOrigin: '20px 98px',
        },
      },
    ],
  };
}

/**
 * Tony's cue, one of the design's two cue `<g>`s, verbatim: its lines are in
 * the same Stage px as his `<svg x="462.8" y="440.5">` (both inside his walk
 * group), so they're mapped into his figure's units with that `<svg>`'s own
 * placement and his 0.62 scale (Tony keeps the Human default).
 */
function cue(lines: string, shiftX = 0): string {
  const shift = shiftX ? `translate(${shiftX} 0) ` : '';
  return `<g transform="${shift}scale(${TO_FIGURE_062}) translate(-462.8 -440.5)">${lines}</g>`;
}

export const THE_MULLET_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Jason plays the Ms. Pac-Man: his figure jiggles (`translate` `0 0;0.8
  // -0.5;-0.8 0;0 0` Stage px over 0.5s, on the group around his `<svg>`),
  // and both hands are up at the controls, his left working the joystick
  // (`10 -40;4 -42;14 -38;10 -40` over 0.4s) and his right mashing a button
  // (`0 -36;0 -40;0 -36;0 -36` over 0.25s), each an `animateTransform` on
  // its hand's own `<g>` inside his `<svg>`, verbatim. His arms don't move.
  // The two hand layers replace his figure's hands raised at rest
  // (`arcadeHands: 'resting'`, drawn too under reduced motion). Approximated: the design draws the hands
  // before his collar and head, so his raised left hand tucks under his
  // jaw's edge; a prop layer draws in front of the figure, so it overlaps
  // that edge by about a pixel.
  'jason-mullet': {
    figure: {
      keyframes:
        '@keyframes jasonJiggle { 0%,100% { transform: translate(0,0);} 33.33% { transform: translate(1.6px,-1px);} 66.67% { transform: translate(-1.6px,0);} }',
      animation: 'jasonJiggle .5s linear infinite',
    },
    replaceFigureRestPose: true,
    props: [
      {
        svg: '<circle cx="30" cy="101" r="5.5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2"/>',
        motion: {
          keyframes:
            '@keyframes jasonJoystick { 0%,100% { transform: translate(10px,-40px);} 33.33% { transform: translate(4px,-42px);} 66.67% { transform: translate(14px,-38px);} }',
          animation: 'jasonJoystick .4s linear infinite',
        },
      },
      {
        svg: '<circle cx="90" cy="101" r="5.5" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="2"/>',
        motion: {
          keyframes:
            '@keyframes jasonButton { 0%,66.67%,100% { transform: translate(0,-36px);} 33.33% { transform: translate(0,-40px);} }',
          animation: 'jasonButton .25s linear infinite',
        },
      },
    ],
  },
  // Nicole and Ann Marie giggle on the couch: two quick 2.5 Stage px hops
  // (`values` `0 0;0 -2.5;0 0;0 -2.5;0 0;0 0` at `keyTimes`
  // `0;0.1;0.2;0.3;0.4;1` over 1.6s, on the group around each `<svg>`), Ann
  // Marie's `begin="0.3s"` behind Nicole's. They draw at 0.5, so 2.5 / 0.5 = 5
  // figure units.
  'nicole-mullet': {
    figure: {
      keyframes:
        '@keyframes coupleGiggle { 0%,20%,40%,100% { transform: translateY(0);} 10%,30% { transform: translateY(-5px);} }',
      animation: 'coupleGiggle 1.6s linear infinite',
    },
  },
  'ann-marie-mullet': {
    figure: {
      keyframes:
        '@keyframes coupleGiggle { 0%,20%,40%,100% { transform: translateY(0);} 10%,30% { transform: translateY(-5px);} }',
      animation: 'coupleGiggle 1.6s linear -1.3s infinite',
    },
  },
  // Jory runs Dom's lap of the Room half a cycle (`begin="-4.7s"`) behind
  // him, her nameplate and bubble with her: her feet are at (830, 491.26)
  // plus Dom's path point, like his. Her slot stays on the floor at (13,6),
  // (1150, 748): an `offset` to the design's t=0 point, (1172.4, 767.6),
  // would stand her just off the floor under reduced motion, so each stop
  // is re-expressed relative to that slot instead (dx, dy = 830 - 1150,
  // 491.26 - 748).
  'jory-mullet': {
    path: {
      keyframes: lap('joryLap', -320, -256.74),
      animation: 'joryLap 9.4s linear -4.7s infinite',
    },
  },
  // Ashley paces between three spots (`animateMotion` `M0 0 L-140 -40 L-60
  // 70 L0 0`, `keyPoints` `0;0;0.3895;0.3895;0.7534;0.7534;1` -- exactly
  // its corners -- at sixths of 18s, linear), bobbing on the way (`0 0;0
  // -3;0 0` over 0.9s, on a group holding her figure, nameplate and bubble:
  // a `stage` track). At each stop she throws Clucknelius: the chicken in her
  // hand vanishes (a discrete opacity, `1;0;1;0;1;0;1` at `keyTimes`
  // `0;0.0667;0.1278;0.4333;0.4944;0.7278;0.7889`) while a chicken spins
  // from her hand to Jon, to where the design stands the Player's Penguin
  // (570, 500), then to Brandon. Her slot `offset` puts her exactly where the
  // design does and she draws at the design's 0.58, so each throw leaves
  // from her hand's design position and lands on its target, give or take her
  // 3 px bob at that moment. Approximated: the design draws the flying
  // chickens over every character; here they sort with Ashley, who stands in
  // front of all three targets.
  'ashley-mullet': {
    path: {
      keyframes:
        '@keyframes ashleyPace { 0%,16.67% { transform: translate(0,0);} 33.33%,50% { transform: translate(-140px,-40px);} 66.67%,83.33% { transform: translate(-60px,70px);} 100% { transform: translate(0,0);} }',
      animation: 'ashleyPace 18s linear infinite',
    },
    stage: {
      keyframes:
        '@keyframes ashleyBob { 0%,100% { transform: translate(0,0);} 50% { transform: translate(0,-3px);} }',
      animation: 'ashleyBob .9s linear infinite',
    },
    // The held chicken layer is the moving version of her `chicken` prop.
    replaceFigureProp: true,
    props: [
      {
        svg: ASHLEY_HELD_CHICKEN,
        pathClock: true,
        motion: {
          keyframes:
            '@keyframes ashleyHeldChicken { 0%,6.66% { opacity:1;} 6.67%,12.77% { opacity:0;} 12.78%,43.32% { opacity:1;} 43.33%,49.43% { opacity:0;} 49.44%,72.77% { opacity:1;} 72.78%,78.88% { opacity:0;} 78.89%,100% { opacity:1;} }',
          animation: 'ashleyHeldChicken 18s linear infinite',
        },
      },
      // At Jon: `M596.8 685.5 Q723.4 470 850 560`, `keyTimes` `0;0.0667;0.1111;1`.
      throwLayer(
        '@keyframes ashleyThrowJon { 0%,6.66% { opacity:0; transform: translate(0,0);} 6.67% { opacity:1; transform: translate(0,0);} 6.95% { transform: translate(18.14px,-29.96px);} 7.23% { transform: translate(37.14px,-59.4px);} 7.5% { transform: translate(57.09px,-88.18px);} 7.78% { transform: translate(78.16px,-116.16px);} 8.06% { transform: translate(100.49px,-143.15px);} 8.34% { transform: translate(124.28px,-168.86px);} 8.61% { transform: translate(149.73px,-192.92px);} 8.89% { transform: translate(177.1px,-214.77px);} 9.17% { transform: translate(206.56px,-233.69px);} 9.45% { transform: translate(238.2px,-248.65px);} 9.72% { transform: translate(271.77px,-258.48px);} 10% { transform: translate(306.57px,-262.09px);} 10.28% { transform: translate(341.41px,-259px);} 10.56% { transform: translate(375.11px,-249.62px);} 10.83% { transform: translate(406.91px,-235.02px);} 11.11% { opacity:1; transform: translate(436.55px,-216.38px);} 11.12%,100% { opacity:0; transform: translate(436.55px,-216.38px);} }',
        'ashleyThrowJon',
      ),
      // At the Player's Penguin: `M456.8 645.5 Q513.4 410 570 500`, `keyTimes` `0;0.4333;0.4778;1`.
      throwLayer(
        '@keyframes ashleyThrowPenguin { 0%,43.32% { opacity:0; transform: translate(0,0);} 43.33% { opacity:1; transform: translate(0,0);} 43.61% { transform: translate(6.11px,-24.9px);} 43.89% { transform: translate(12.51px,-49.72px);} 44.16% { transform: translate(19.2px,-74.45px);} 44.44% { transform: translate(26.25px,-99.09px);} 44.72% { transform: translate(33.74px,-123.62px);} 45% { transform: translate(41.73px,-147.97px);} 45.28% { transform: translate(50.34px,-172.11px);} 45.56% { transform: translate(59.73px,-195.96px);} 45.83% { transform: translate(70.15px,-219.37px);} 46.11% { transform: translate(81.99px,-242.1px);} 46.39% { transform: translate(95.94px,-263.59px);} 46.67% { transform: translate(113.34px,-282.32px);} 46.95% { transform: translate(136.12px,-293.39px);} 47.22% { transform: translate(160.71px,-288.16px);} 47.5% { transform: translate(180.06px,-271.53px);} 47.78% { opacity:1; transform: translate(195.17px,-250.86px);} 47.79%,100% { opacity:0; transform: translate(195.17px,-250.86px);} }',
        'ashleyThrowPenguin',
      ),
      // At Brandon: `M536.8 755.5 Q799.4 590 1062 680`, `keyTimes` `0;0.7278;0.7722;1`.
      throwLayer(
        '@keyframes ashleyThrowBrandon { 0%,72.77% { opacity:0; transform: translate(0,0);} 72.78% { opacity:1; transform: translate(0,0);} 73.06% { transform: translate(50.77px,-30.6px);} 73.33% { transform: translate(102.75px,-59.08px);} 73.61% { transform: translate(155.94px,-85.22px);} 73.89% { transform: translate(210.33px,-108.79px);} 74.17% { transform: translate(265.84px,-129.57px);} 74.45% { transform: translate(322.38px,-147.35px);} 74.72% { transform: translate(379.85px,-161.87px);} 75% { transform: translate(438.06px,-172.99px);} 75.28% { transform: translate(496.84px,-180.51px);} 75.55% { transform: translate(555.99px,-184.33px);} 75.83% { transform: translate(615.26px,-184.39px);} 76.11% { transform: translate(674.41px,-180.69px);} 76.39% { transform: translate(733.21px,-173.28px);} 76.67% { transform: translate(791.45px,-162.28px);} 76.94% { transform: translate(848.94px,-147.84px);} 77.22% { opacity:1; transform: translate(905.52px,-130.17px);} 77.23%,100% { opacity:0; transform: translate(905.52px,-130.17px);} }',
        'ashleyThrowBrandon',
      ),
    ],
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
    // The paddle layer is the moving version of his figure's resting `paddle`.
    replaceFigureRestPose: true,
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
        svg: `<g transform="translate(60 120) scale(${TO_FIGURE_058}) translate(30 14)"><circle cx="0" cy="0" r="3.5" fill="#F4F4F4" stroke="#0C4B5F" stroke-width="1"/></g>`,
        motion: {
          keyframes:
            '@keyframes jonBall { 0% { transform: translate(0,0);} 2.08% { transform: translate(21.71px,-4.5px);} 4.17% { transform: translate(44px,-5.36px);} 6.25% { transform: translate(66.32px,-2.52px);} 8.33% { transform: translate(88.18px,3.72px);} 10.42% { transform: translate(109.23px,12.91px);} 12.5% { transform: translate(129.3px,24.54px);} 14.58% { transform: translate(148.36px,38.15px);} 16.67% { transform: translate(166.42px,53.32px);} 18.75% { transform: translate(183.55px,69.77px);} 20.83% { transform: translate(199.83px,87.24px);} 22.92% { transform: translate(215.35px,105.56px);} 25% { transform: translate(230.17px,124.57px);} 27.08% { transform: translate(210.61px,107.93px);} 29.17% { transform: translate(190.35px,91.98px);} 31.25% { transform: translate(169.32px,76.88px);} 33.33% { transform: translate(147.45px,62.81px);} 35.42% { transform: translate(130.04px,47.3px);} 37.5% { transform: translate(111.63px,33.38px);} 39.58% { transform: translate(92.21px,21.43px);} 41.67% { transform: translate(71.8px,11.92px);} 43.75% { transform: translate(50.58px,5.34px);} 45.83% { transform: translate(28.92px,2.19px);} 47.92% { transform: translate(7.27px,2.72px);} 50% { transform: translate(-13.79px,6.89px);} 52.08% { transform: translate(13.31px,-0.3px);} 54.17% { transform: translate(40.98px,-3.85px);} 56.25% { transform: translate(68.69px,-3.71px);} 58.33% { transform: translate(95.94px,-0.15px);} 60.42% { transform: translate(122.38px,6.34px);} 62.5% { transform: translate(147.84px,15.28px);} 64.58% { transform: translate(172.29px,26.19px);} 66.67% { transform: translate(195.73px,38.66px);} 68.75% { transform: translate(214.58px,54.25px);} 70.83% { transform: translate(232.6px,70.86px);} 72.92% { transform: translate(249.83px,88.32px);} 75% { transform: translate(266.38px,106.47px);} 77.08% { transform: translate(248.55px,88.96px);} 79.17% { transform: translate(230.01px,72.16px);} 81.25% { transform: translate(210.7px,56.2px);} 83.33% { transform: translate(190.55px,41.25px);} 85.42% { transform: translate(169.47px,27.59px);} 87.5% { transform: translate(147.41px,15.5px);} 89.58% { transform: translate(124.32px,5.38px);} 91.67% { transform: translate(100.25px,-2.31px);} 93.75% { transform: translate(75.37px,-7.04px);} 95.83% { transform: translate(50.04px,-8.37px);} 97.92% { transform: translate(24.73px,-6.01px);} 100% { transform: translate(0,0);} }',
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
    // The paddle layer is the moving version of his figure's resting `paddle`.
    replaceFigureRestPose: true,
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
  // Dom runs his lap of the Room (the 12-corner path, 9.4s, paced; his
  // bubble and nameplate with him) on a quick running bob (`0 0;0 -5;0 0`
  // over 0.35s on his `<svg>`'s group: 5 / 0.58 = 8.62 figure units). His
  // slot `offset` puts him on the path's first point, (860, 478.26), so each
  // stop is the design's point minus that one.
  'dom-mullet': {
    path: {
      keyframes: lap('domLap', -30, 13),
      animation: 'domLap 9.4s linear infinite',
    },
    figure: {
      keyframes:
        '@keyframes domBob { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-8.62px);} }',
      animation: 'domBob .35s linear infinite',
    },
  },
};
