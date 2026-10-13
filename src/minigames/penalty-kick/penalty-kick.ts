import type { Minigame, MinigameContext, MinigameDoneSummary } from '../minigame';
import {
  createPenaltyKickEngine,
  resultLine,
  resultTitle,
  scored,
  SHOTS_PER_ROUND,
  TICK_MS,
  type KeeperZone,
  type PenaltyKickEngine,
  type PenaltyKickStats,
  type PenaltyKickView,
  type PenaltyOutcome,
} from './penalty-kick-engine';
import './penalty-kick.css';

/** The host's name, standing in for the design's generic "Coach" (owner
 *  decision, ticket #220): his trigger-card line is `PENALTY_KICK_DIALOG`
 *  (`src/npcs/npcs.ts`); this is only his in-play/result-screen voice. */
const HOST_NAME = 'Chrystian';

/**
 * The shell's round clock for one round. Like Beystadium, Penalty Kick isn't
 * really timed (five shots, each a couple of seconds including the result
 * pause, comfortably finish in well under a minute); this is a generous
 * ceiling the game calls `context.finish()` well before reaching, once the
 * 5th shot's result clears.
 */
export const PENALTY_KICK_ROUND_SECONDS = 60;

export interface PenaltyKickOptions {
  /** Test-only: a pre-built engine instead of a fresh `createPenaltyKickEngine()`. */
  engine?: PenaltyKickEngine;
}

/** Test-only hooks `dev-minigame-hook.ts` drives from `window.__minigameTest`
 *  (`?minigame=penalty-kick`), the same shape as the other games'. Not part
 *  of the `Minigame` interface. */
export interface PenaltyKickTestHooks {
  /** Takes the current shot with a forced outcome, bypassing the aim sweep
   *  and the keeper's RNG entirely -- e2e drives real wall-clock time and
   *  has no reason to fight a 16 ms-tick sweep to land an exact outcome. */
  debugForceShot(outcome: PenaltyOutcome): void;
}

const DOT_LETTER: Record<PenaltyOutcome, string> = {
  goal: 'G',
  golazo: 'G',
  save: 'S',
  wide: 'X',
  over: 'X',
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The keeper's three dive targets (x, y, rotation), verbatim from the
// design's own `KZ` array -- the left/centre/right thirds of the goal.
const KZ: ReadonlyArray<readonly [number, number, number]> = [
  [570, 430, -70],
  [800, 395, 0],
  [1030, 430, 70],
];

/** The ball's flight target, verbatim from the design's `renderVals`: the
 *  locked aim point, bent wide/over the bar for a miss, or pulled to the
 *  keeper's own dive point for a save. Cosmetic derivation only (the
 *  engine's `view.outcome`/`view.keeperZone` already decided the shot); kept
 *  out of the engine the same way `carnaval-parade.ts`'s item positioning is. */
function targetPoint(view: PenaltyKickView): { tx: number; ty: number } {
  let tx = 450 + view.aimX * 700;
  let ty = 520 - view.aimY * 270;
  if (view.outcome === 'wide') tx = view.aimX < 0.5 ? 395 : 1205;
  if (view.outcome === 'over') ty = 190;
  if (view.outcome === 'save' && view.keeperZone !== -1) {
    const k = KZ[view.keeperZone];
    tx = k[0] + (view.keeperZone - 1) * -30;
    ty = k[1] - 20;
  }
  return { tx, ty };
}

/** The stadium backdrop, goal/net, keeper and ball, ported from `design/
 *  Minigame Penalty Kick.dc.html`'s static SVG verbatim apart from one
 *  deliberate simplification: the crowd's ~370 individually-placed circles
 *  become one repeating `<pattern>` tile sampling the same row colours/
 *  opacities. The ad boards, floodlights, pitch stripes and penalty-area
 *  lines are copied exactly; the keeper and ball groups are the design's own
 *  markup, left for `render()` to move with their own `transform`. */
function penaltyKickSceneSvg(): string {
  const adBoards: ReadonlyArray<{ x: number; fill: string; text: string; textFill: string }> = [
    { x: 20, fill: '#0C4B5F', text: 'JG', textFill: '#F4F4F4' },
    { x: 218, fill: '#161719', text: 'LATAM', textFill: '#F4F4F4' },
    { x: 416, fill: '#00BDFF', text: 'CLUB JENGUIN', textFill: '#161719' },
    { x: 614, fill: '#161719', text: 'JG', textFill: '#F4F4F4' },
    { x: 812, fill: '#0C4B5F', text: 'JG', textFill: '#F4F4F4' },
    { x: 1010, fill: '#161719', text: 'LATAM', textFill: '#F4F4F4' },
    { x: 1208, fill: '#00BDFF', text: 'CLUB JENGUIN', textFill: '#161719' },
    { x: 1406, fill: '#161719', text: 'JG', textFill: '#F4F4F4' },
  ];
  const ads = adBoards
    .map(
      ({ x, fill, text, textFill }) =>
        `<rect x="${x}" y="332" width="186" height="64" fill="${fill}" stroke="#00BDFF" stroke-width="2"></rect>` +
        `<text x="${x + 93}" y="376" text-anchor="middle" font-family="Anton,sans-serif" font-size="30" letter-spacing="3" fill="${textFill}">${text}</text>`,
    )
    .join('');
  const pitchStripes = [560, 603, 646, 689, 732, 775, 818, 861]
    .map(
      (y, i) =>
        `<rect x="0" y="${y}" width="1600" height="43" fill="${i % 2 === 0 ? '#287046' : '#2f7d4f'}"></rect>`,
    )
    .join('');
  return (
    '<svg class="penalty-kick__scene" viewBox="0 200 1600 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
    '<defs>' +
    '<linearGradient id="pk-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A0C0F"></stop><stop offset="1" stop-color="#0F3441"></stop></linearGradient>' +
    '<pattern id="pk-net" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M0 0H22M0 0V22" stroke="#F4F4F4" stroke-width="1.2" opacity=".4" fill="none"></path></pattern>' +
    '<radialGradient id="pk-fl"><stop offset="0" stop-color="#F4F4F4" stop-opacity=".45"></stop><stop offset="1" stop-color="#F4F4F4" stop-opacity="0"></stop></radialGradient>' +
    '<pattern id="pk-crowd" width="27" height="130" patternUnits="userSpaceOnUse">' +
    '<circle cx="0" cy="0" r="8" fill="#FFD23F" opacity=".55"></circle><circle cx="13.5" cy="13" r="8" fill="#3DDC84" opacity=".67"></circle>' +
    '<circle cx="0" cy="26" r="8" fill="#00BDFF" opacity=".67"></circle><circle cx="13.5" cy="39" r="8" fill="#F4F4F4" opacity=".79"></circle>' +
    '<circle cx="0" cy="52" r="8" fill="#E4572E" opacity=".79"></circle><circle cx="13.5" cy="65" r="8" fill="#FF3DA5" opacity=".55"></circle>' +
    '<circle cx="0" cy="78" r="8" fill="#3DDC84" opacity=".55"></circle><circle cx="13.5" cy="91" r="8" fill="#FFD23F" opacity=".67"></circle>' +
    '<circle cx="0" cy="104" r="8" fill="#F4F4F4" opacity=".67"></circle><circle cx="13.5" cy="117" r="8" fill="#00BDFF" opacity=".79"></circle>' +
    '</pattern>' +
    '</defs>' +
    '<rect width="1600" height="900" fill="url(#pk-sky)"></rect>' +
    '<rect x="0" y="90" width="1600" height="240" fill="#15191c"></rect>' +
    '<rect x="0" y="90" width="1600" height="240" fill="url(#pk-crowd)"></rect>' +
    '<rect x="0" y="310" width="1600" height="250" fill="#1b1f22"></rect>' +
    ads +
    '<ellipse cx="200" cy="130" rx="180" ry="90" fill="url(#pk-fl)"></ellipse>' +
    '<ellipse cx="1400" cy="130" rx="180" ry="90" fill="url(#pk-fl)"></ellipse>' +
    '<rect x="0" y="540" width="1600" height="22" fill="#0C4B5F"></rect>' +
    pitchStripes +
    '<polygon points="330,900 520,640 1080,640 1270,900" fill="none" stroke="#F4F4F4" stroke-width="4" opacity=".7"></polygon>' +
    '<polygon points="560,640 640,740 960,740 1040,640" fill="none" stroke="#F4F4F4" stroke-width="3" opacity=".6"></polygon>' +
    '<ellipse cx="800" cy="770" rx="14" ry="5" fill="#F4F4F4" opacity=".8"></ellipse>' +
    '<rect x="450" y="250" width="700" height="270" fill="#0A0C0F" opacity=".55"></rect>' +
    '<rect x="450" y="250" width="700" height="270" fill="url(#pk-net)"></rect>' +
    '<g class="penalty-kick__keeper">' +
    '<ellipse cx="0" cy="92" rx="40" ry="9" fill="#000" opacity=".35"></ellipse>' +
    '<rect x="-24" y="46" width="18" height="46" rx="6" fill="#161719" stroke="#0C4B5F" stroke-width="3"></rect>' +
    '<rect x="6" y="46" width="18" height="46" rx="6" fill="#161719" stroke="#0C4B5F" stroke-width="3"></rect>' +
    '<rect x="-32" y="-34" width="64" height="86" rx="16" fill="#FFD23F" stroke="#0C4B5F" stroke-width="3.5"></rect>' +
    '<text x="0" y="22" text-anchor="middle" font-family="Anton,sans-serif" font-size="26" fill="#161719">1</text>' +
    '<path d="M-30 -26 L-62 -66 M30 -26 L62 -66" stroke="#0C4B5F" stroke-width="22" stroke-linecap="round"></path>' +
    '<path d="M-30 -26 L-62 -66 M30 -26 L62 -66" stroke="#FFD23F" stroke-width="15" stroke-linecap="round"></path>' +
    '<circle cx="-66" cy="-72" r="12" fill="#00BDFF" stroke="#0C4B5F" stroke-width="3"></circle>' +
    '<circle cx="66" cy="-72" r="12" fill="#00BDFF" stroke="#0C4B5F" stroke-width="3"></circle>' +
    '<circle cx="0" cy="-58" r="24" fill="#F6DCC6" stroke="#0C4B5F" stroke-width="3.5"></circle>' +
    '<path d="M-24 -62 C-26 -86 -8 -88 4 -86 C20 -86 28 -76 24 -62 C16 -68 4 -72 -6 -68 C-12 -66 -18 -64 -24 -62 Z" fill="#2b2118" stroke="#0C4B5F" stroke-width="3"></path>' +
    '<circle cx="-8" cy="-56" r="3" fill="#161719"></circle>' +
    '<circle cx="8" cy="-56" r="3" fill="#161719"></circle>' +
    '<path d="M-7 -46 Q0 -41 7 -46" fill="none" stroke="#0C4B5F" stroke-width="2.5" stroke-linecap="round"></path>' +
    '</g>' +
    '<path d="M450 520 V250 H1150 V520" fill="none" stroke="#F4F4F4" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"></path>' +
    '<line class="penalty-kick__aim-line penalty-kick__aim-line--x" x1="800" y1="250" x2="800" y2="520" stroke="#00BDFF" stroke-width="5"></line>' +
    '<line class="penalty-kick__aim-line penalty-kick__aim-line--y" x1="450" y1="385" x2="1150" y2="385" stroke="#00BDFF" stroke-width="5"></line>' +
    '<circle class="penalty-kick__aim-dot" cx="800" cy="385" r="18" fill="none" stroke="#F4F4F4" stroke-width="4"></circle>' +
    '<ellipse class="penalty-kick__ball-shadow" cx="800" cy="775" rx="24" ry="8" fill="#000" opacity=".35"></ellipse>' +
    '<g class="penalty-kick__ball">' +
    '<circle r="22" fill="#F4F4F4" stroke="#161719" stroke-width="3"></circle>' +
    '<polygon points="0,-12 11,-4 7,10 -7,10 -11,-4" fill="#161719"></polygon>' +
    '<path d="M0 -12 V-22 M11 -4 L21 -8 M7 10 L14 19 M-7 10 L-14 19 M-11 -4 L-21 -8" stroke="#161719" stroke-width="2.5"></path>' +
    '</g>' +
    '</svg>'
  );
}

/**
 * Penalty Kick: five solo penalties against a keeper, the pure
 * `penalty-kick-engine.ts` under a thin DOM layer ported from `design/
 * Minigame Penalty Kick.dc.html`'s play screen into the shell's play area
 * (`createMinigameShell`'s `playAreaEl`). The shell owns the how-to-play
 * screen, the round clock (a generous ceiling -- this game ends itself via
 * `context.finish()` once the 5th shot resolves), PAUSE/P, QUIT and
 * `recordRound`; its done screen shows this game's FULL TIME headings via
 * `doneSummary()`.
 *
 * The stadium, goal/net, keeper and ball are one inline SVG
 * (`penaltyKickSceneSvg()`) in the design's own 1600x900 coordinate space;
 * `render()` moves the keeper/ball/aim-line elements with the same formulas
 * the design's own `renderVals()` uses (`targetPoint`, the easing on
 * `view.kickProgress`), reading only the engine's public `view` -- the
 * engine itself is untouched.
 *
 * Not ported: the design's trigger screen (the host's challenge, the "HOW TO
 * PLAY" cards) -- those are Chrystian Rissoli's NPC dialog and the shell's
 * own generic how-to-play screen (`howToPlay`), same split every other
 * Minigame makes.
 *
 * Producer: this game. Consumer: `createDefaultMinigameRegistry`
 * (`minigame-registry.ts`).
 */
export function createPenaltyKick(
  options: PenaltyKickOptions = {},
): Minigame<'penalty-kick'> & PenaltyKickTestHooks {
  const engine = options.engine ?? createPenaltyKickEngine();

  let context: MinigameContext<'penalty-kick'> | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let keydownHandler: ((event: KeyboardEvent) => void) | undefined;
  let finished = false;

  const refs: Record<string, HTMLElement> = {};
  const svgRefs: Record<string, SVGElement> = {};
  const dotEls: HTMLElement[] = [];

  function report(): void {
    const stats = engine.stats();
    context?.setScore(scored(stats));
    context?.setStats(stats);
  }

  function stopTicking(): void {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  }

  function startTicking(): void {
    stopTicking();
    intervalId = setInterval(() => {
      const before = engine.view.shot;
      const beforeStage = engine.view.stage;
      engine.tick();
      if (engine.view.shot !== before || engine.view.stage !== beforeStage) report();
      render();
      if (engine.view.stage === 'done' && !finished) {
        finished = true;
        stopTicking();
        context?.finish();
      }
    }, TICK_MS);
  }

  function render(): void {
    const view = engine.view;
    const aiming = view.stage === 'aim-x' || view.stage === 'aim-y';
    const diving = view.stage === 'kick' || view.stage === 'result';
    const p = view.kickProgress;
    const ease = 1 - Math.pow(1 - p, 2);

    // The two sweeping aim lines and their intersection dot, verbatim from
    // the design's own `vx`/`hy`/`vOp`/`hOp`.
    const vx = 450 + view.aimX * 700;
    const hy = 520 - view.aimY * 270;
    svgRefs.aimLineX.setAttribute('x1', vx.toFixed(1));
    svgRefs.aimLineX.setAttribute('x2', vx.toFixed(1));
    svgRefs.aimLineX.setAttribute('opacity', aiming ? '1' : '0');
    svgRefs.aimLineY.setAttribute('y1', hy.toFixed(1));
    svgRefs.aimLineY.setAttribute('y2', hy.toFixed(1));
    svgRefs.aimLineY.setAttribute('opacity', view.stage === 'aim-y' ? '1' : '0');
    svgRefs.aimDot.setAttribute('cx', vx.toFixed(1));
    svgRefs.aimDot.setAttribute('cy', hy.toFixed(1));
    svgRefs.aimDot.setAttribute('opacity', view.stage === 'aim-y' ? '1' : '0');

    // The keeper's dive to its `KZ` zone, verbatim from the design's own
    // `kx`/`ky`/`kr`.
    let kx = 800;
    let ky = 470;
    let kr = 0;
    if (diving && view.keeperZone !== -1) {
      const zone: KeeperZone = view.keeperZone;
      const k = KZ[zone];
      kx = 800 + (k[0] - 800) * ease;
      ky = 470 + (k[1] - 470) * ease + (zone === 1 ? 0 : -Math.sin(p * Math.PI) * 30);
      kr = k[2] * ease;
    }
    svgRefs.keeper.setAttribute(
      'transform',
      `translate(${kx.toFixed(1)} ${ky.toFixed(1)}) rotate(${kr.toFixed(1)})`,
    );

    // The ball's flight and its shrinking shadow, verbatim from the design's
    // own `bx`/`by`/`bsc`/`shx`/`shy`/`shr`.
    const { tx, ty } = targetPoint(view);
    const launched = diving;
    const bx = launched ? 800 + (tx - 800) * p : 800;
    const by = launched ? 770 + (ty - 770) * p - Math.sin(p * Math.PI) * 70 : 770;
    const bsc = launched ? 1 - 0.5 * p : 1;
    svgRefs.ball.setAttribute(
      'transform',
      `translate(${bx.toFixed(1)} ${by.toFixed(1)}) scale(${bsc.toFixed(3)})`,
    );
    const shy = launched ? 770 + (ty - 770) * p : 775;
    svgRefs.ballShadow.setAttribute('cx', bx.toFixed(1));
    svgRefs.ballShadow.setAttribute('cy', shy.toFixed(1));
    svgRefs.ballShadow.setAttribute('rx', (24 * bsc).toFixed(1));

    refs.subline.textContent =
      view.stage === 'aim-x'
        ? 'SPACE LOCKS THE SIDE'
        : view.stage === 'aim-y'
          ? 'SPACE LOCKS THE HEIGHT AND SHOOTS'
          : '…';
    refs.shot.textContent = `${Math.min(SHOTS_PER_ROUND, view.shot + 1)} / ${SHOTS_PER_ROUND}`;
    refs.goals.textContent = `${scored(engine.stats())} / ${SHOTS_PER_ROUND}`;
    const stats = engine.stats();
    refs.tips.textContent = `+${30 * stats.goals + 50 * stats.golazos}`;

    dotEls.forEach((dot, i) => {
      const result = view.results[i];
      dot.textContent = result ? DOT_LETTER[result] : '';
      dot.classList.toggle('penalty-kick__dot--scored', result === 'goal' || result === 'golazo');
      dot.classList.toggle('penalty-kick__dot--saved', result === 'save');
      dot.classList.toggle('penalty-kick__dot--missed', result === 'wide' || result === 'over');
      dot.classList.toggle('penalty-kick__dot--current', i === view.shot && view.stage !== 'done');
    });

    if (view.toast) {
      refs.toast.textContent = view.toast;
      refs.toast.style.setProperty('--toast-bg', view.toastBg);
      refs.toast.hidden = false;
    } else {
      refs.toast.hidden = true;
    }

    refs.coach.textContent = `${HOST_NAME}: ${view.coachLine}`;
  }

  function handleAction(): void {
    if (finished) return;
    engine.act();
    render();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (event.repeat) return;
    handleAction();
  }

  function buildDom(container: HTMLElement): void {
    const root = el('div', 'penalty-kick');
    root.addEventListener('click', handleAction);

    const header = el('div', 'penalty-kick__dots');
    dotEls.length = 0;
    for (let i = 0; i < SHOTS_PER_ROUND; i++) {
      const dot = el('div', 'penalty-kick__dot');
      header.append(dot);
      dotEls.push(dot);
    }

    const field = el('div', 'penalty-kick__field');
    field.innerHTML = penaltyKickSceneSvg();
    const toast = el('div', 'penalty-kick__toast');
    toast.hidden = true;
    field.append(toast);
    Object.assign(svgRefs, {
      aimLineX: field.querySelector('.penalty-kick__aim-line--x')!,
      aimLineY: field.querySelector('.penalty-kick__aim-line--y')!,
      aimDot: field.querySelector('.penalty-kick__aim-dot')!,
      keeper: field.querySelector('.penalty-kick__keeper')!,
      ball: field.querySelector('.penalty-kick__ball')!,
      ballShadow: field.querySelector('.penalty-kick__ball-shadow')!,
    });

    const counters = el('div', 'penalty-kick__counters');
    const goalsCounter = el('div', 'penalty-kick__counter');
    goalsCounter.append(
      el('div', 'penalty-kick__counter-label', 'GOALS'),
      el('div', 'penalty-kick__counter-value'),
    );
    const shotCounter = el('div', 'penalty-kick__counter');
    shotCounter.append(
      el('div', 'penalty-kick__counter-label', 'SHOT'),
      el('div', 'penalty-kick__counter-value'),
    );
    const tipsCounter = el('div', 'penalty-kick__counter');
    tipsCounter.append(
      el('div', 'penalty-kick__counter-label', 'TIPS'),
      el('div', 'penalty-kick__counter-value'),
    );
    counters.append(goalsCounter, shotCounter, tipsCounter);

    const subline = el('div', 'penalty-kick__subline');
    const footer = el('div', 'penalty-kick__footer');
    const coach = el('div', 'penalty-kick__coach');
    footer.append(coach);

    root.append(header, counters, subline, field, footer);
    container.replaceChildren(root);

    Object.assign(refs, {
      toast,
      subline,
      coach,
      goals: goalsCounter.querySelector('.penalty-kick__counter-value')!,
      shot: shotCounter.querySelector('.penalty-kick__counter-value')!,
      tips: tipsCounter.querySelector('.penalty-kick__counter-value')!,
    });
  }

  function doneSummary(): MinigameDoneSummary {
    const stats: PenaltyKickStats = engine.stats();
    return {
      kicker: 'FULL TIME',
      title: resultTitle(stats),
      scoreLabel: 'GOALS',
      rows: [
        { key: 'saved', label: 'SAVED', value: String(stats.saved) },
        { key: 'missed', label: 'MISSED', value: String(stats.wide + stats.over) },
        { key: 'tips', label: 'TIPS', value: `+${30 * stats.goals + 50 * stats.golazos}` },
      ],
      quote: `${HOST_NAME}: "${resultLine(stats)}"`,
    };
  }

  return {
    id: 'penalty-kick',
    title: 'PENALTY KICK',
    durationSec: PENALTY_KICK_ROUND_SECONDS,
    howToSubtitle: 'PENALTY KICK · 5 SHOTS · SOLO',
    howToPlay: [
      'PICK A SIDE (SPACE or click). A line sweeps across the goal, fast. Lock it close to a post and the shot goes wide.',
      'SET THE HEIGHT (SPACE or click again). A second line sweeps up and down. Too high is over the bar; low shots are easy to save.',
      'BEAT THE KEEPER. The keeper reads you and dives. Only a top corner is hard to save. The sweep gets faster every kick.',
      `${HOST_NAME}: "Cinco pênaltis. Pick a corner and mean it. Score four and the Goleador badge is yours."`,
    ],
    statLabels: { goals: 'GOALS', golazos: 'GOLAZOS', saved: 'SAVED' },

    start(container, ctx) {
      context = ctx;
      buildDom(container);
      report();
      render();
      keydownHandler = handleKeydown;
      window.addEventListener('keydown', keydownHandler);
      startTicking();
    },

    pause() {
      stopTicking();
    },

    resume() {
      if (!finished) startTicking();
    },

    end() {
      stopTicking();
      finished = true;
      if (keydownHandler) {
        window.removeEventListener('keydown', keydownHandler);
        keydownHandler = undefined;
      }
      const stats = engine.stats();
      return { score: scored(stats), stats };
    },

    doneSummary,

    debugForceShot(outcome) {
      engine.debugForceShot(outcome);
      render();
    },
  };
}
