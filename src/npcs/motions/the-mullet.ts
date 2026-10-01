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
const ASHLEY_THROWN_CHICKEN = `<g transform="translate(20 98) scale(${TO_FIGURE})"><ellipse cx="0" cy="2" rx="8" ry="6.5" fill="#F2C12E" stroke="#0C4B5F" stroke-width="1.5"/><circle cx="5" cy="-6" r="4" fill="#F2C12E" stroke="#0C4B5F" stroke-width="1.5"/><polygon points="8.5,-6.5 13,-5 8.5,-3.5" fill="#E07A2F"/><path d="M3 -10 q1.5 -4 3 0" fill="#D63C3C"/></g>`;

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
 * placement and his 0.62 scale.
 */
function cue(lines: string, shiftX = 0): string {
  const shift = shiftX ? `translate(${shiftX} 0) ` : '';
  return `<g transform="${shift}scale(${TO_FIGURE}) translate(-462.8 -440.5)">${lines}</g>`;
}

export const THE_MULLET_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Jason plays the Ms. Pac-Man: his figure jiggles (`translate` `0 0;0.8
  // -0.5;-0.8 0;0 0` Stage px over 0.5s, on the group around his `<svg>`),
  // and both hands are up at the controls, his left working the joystick
  // (`10 -40;4 -42;14 -38;10 -40` over 0.4s) and his right mashing a button
  // (`0 -36;0 -40;0 -36;0 -36` over 0.25s), each an `animateTransform` on
  // its hand's own `<g>` inside his `<svg>`, verbatim. His arms don't move.
  // The two hand layers replace his figure's resting hands
  // (`arcadeHands: 'resting'`). Approximated: the design draws the hands
  // before his collar and head, so his raised left hand tucks under his
  // jaw's edge; a prop layer draws in front of the figure, so it overlaps
  // that edge by about a pixel.
  'jason-mullet': {
    figure: {
      keyframes:
        '@keyframes jasonJiggle { 0%,100% { transform: translate(0,0);} 33.33% { transform: translate(1.29px,-0.81px);} 66.67% { transform: translate(-1.29px,0);} }',
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
  // Marie's `begin="0.3s"` behind Nicole's. 2.5 / 0.62 = 4.03 figure units.
  'nicole-mullet': {
    figure: {
      keyframes:
        '@keyframes coupleGiggle { 0%,20%,40%,100% { transform: translateY(0);} 10%,30% { transform: translateY(-4.03px);} }',
      animation: 'coupleGiggle 1.6s linear infinite',
    },
  },
  'ann-marie-mullet': {
    figure: {
      keyframes:
        '@keyframes coupleGiggle { 0%,20%,40%,100% { transform: translateY(0);} 10%,30% { transform: translateY(-4.03px);} }',
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
  // design does, so each throw lands on its target to within about 2 px
  // (her figure draws at 0.62 here, the design's at 0.58, so her hand sits
  // that much further from her feet). Approximated: the design draws the
  // flying chickens over every character; here they sort with Ashley, who
  // stands in front of all three targets.
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
        '@keyframes ashleyThrowJon { 0%,6.66% { opacity:0; transform: translate(0,0);} 6.67% { opacity:1; transform: translate(0,0);} 6.95% { transform: translate(16.97px,-28.03px);} 7.23% { transform: translate(34.74px,-55.57px);} 7.5% { transform: translate(53.41px,-82.49px);} 7.78% { transform: translate(73.12px,-108.67px);} 8.06% { transform: translate(94.01px,-133.91px);} 8.34% { transform: translate(116.26px,-157.97px);} 8.61% { transform: translate(140.07px,-180.47px);} 8.89% { transform: translate(165.67px,-200.91px);} 9.17% { transform: translate(193.23px,-218.61px);} 9.45% { transform: translate(222.83px,-232.61px);} 9.72% { transform: translate(254.24px,-241.8px);} 10% { transform: translate(286.79px,-245.18px);} 10.28% { transform: translate(319.38px,-242.29px);} 10.56% { transform: translate(350.91px,-233.52px);} 10.83% { transform: translate(380.66px,-219.86px);} 11.11% { opacity:1; transform: translate(408.39px,-202.42px);} 11.12%,100% { opacity:0; transform: translate(408.39px,-202.42px);} }',
        'ashleyThrowJon',
      ),
      // At the Player's Penguin: `M456.8 645.5 Q513.4 410 570 500`, `keyTimes` `0;0.4333;0.4778;1`.
      throwLayer(
        '@keyframes ashleyThrowPenguin { 0%,43.32% { opacity:0; transform: translate(0,0);} 43.33% { opacity:1; transform: translate(0,0);} 43.61% { transform: translate(5.72px,-23.29px);} 43.89% { transform: translate(11.7px,-46.51px);} 44.16% { transform: translate(17.96px,-69.65px);} 44.44% { transform: translate(24.56px,-92.7px);} 44.72% { transform: translate(31.56px,-115.64px);} 45% { transform: translate(39.04px,-138.42px);} 45.28% { transform: translate(47.09px,-161.01px);} 45.56% { transform: translate(55.88px,-183.32px);} 45.83% { transform: translate(65.62px,-205.22px);} 46.11% { transform: translate(76.7px,-226.48px);} 46.39% { transform: translate(89.75px,-246.58px);} 46.67% { transform: translate(106.03px,-264.11px);} 46.95% { transform: translate(127.34px,-274.46px);} 47.22% { transform: translate(150.34px,-269.57px);} 47.5% { transform: translate(168.44px,-254.01px);} 47.78% { opacity:1; transform: translate(182.58px,-234.68px);} 47.79%,100% { opacity:0; transform: translate(182.58px,-234.68px);} }',
        'ashleyThrowPenguin',
      ),
      // At Brandon: `M536.8 755.5 Q799.4 590 1062 680`, `keyTimes` `0;0.7278;0.7722;1`.
      throwLayer(
        '@keyframes ashleyThrowBrandon { 0%,72.77% { opacity:0; transform: translate(0,0);} 72.78% { opacity:1; transform: translate(0,0);} 73.06% { transform: translate(47.49px,-28.63px);} 73.33% { transform: translate(96.12px,-55.27px);} 73.61% { transform: translate(145.88px,-79.72px);} 73.89% { transform: translate(196.76px,-101.77px);} 74.17% { transform: translate(248.69px,-121.21px);} 74.45% { transform: translate(301.58px,-137.84px);} 74.72% { transform: translate(355.34px,-151.43px);} 75% { transform: translate(409.8px,-161.83px);} 75.28% { transform: translate(464.79px,-168.86px);} 75.55% { transform: translate(520.12px,-172.44px);} 75.83% { transform: translate(575.57px,-172.49px);} 76.11% { transform: translate(630.9px,-169.03px);} 76.39% { transform: translate(685.91px,-162.1px);} 76.67% { transform: translate(740.39px,-151.81px);} 76.94% { transform: translate(794.17px,-138.3px);} 77.22% { opacity:1; transform: translate(847.1px,-121.77px);} 77.23%,100% { opacity:0; transform: translate(847.1px,-121.77px);} }',
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
  // Dom runs his lap of the Room (the 12-corner path, 9.4s, paced; his
  // bubble and nameplate with him) on a quick running bob (`0 0;0 -5;0 0`
  // over 0.35s on his `<svg>`'s group: 5 / 0.62 = 8.06 figure units). His
  // slot `offset` puts him on the path's first point, (860, 478.26), so each
  // stop is the design's point minus that one.
  'dom-mullet': {
    path: {
      keyframes: lap('domLap', -30, 13),
      animation: 'domLap 9.4s linear infinite',
    },
    figure: {
      keyframes:
        '@keyframes domBob { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-8.06px);} }',
      animation: 'domBob .35s linear infinite',
    },
  },
};
