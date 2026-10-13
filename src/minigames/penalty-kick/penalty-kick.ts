import type { Minigame, MinigameContext, MinigameDoneSummary } from '../minigame';
import {
  createPenaltyKickEngine,
  resultLine,
  resultTitle,
  scored,
  SHOTS_PER_ROUND,
  TICK_MS,
  type PenaltyKickEngine,
  type PenaltyKickStats,
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

const ZONE_LABEL = ['LEFT', 'CENTRE', 'RIGHT'] as const;

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

    refs.aimX.style.left = `${(view.aimX * 100).toFixed(2)}%`;
    refs.aimX.style.visibility = aiming || view.stage !== 'done' ? 'visible' : 'hidden';
    refs.aimY.style.bottom = `${(view.aimY * 100).toFixed(2)}%`;
    refs.aimX.classList.toggle('penalty-kick__aim-line--active', view.stage === 'aim-x');
    refs.aimY.classList.toggle('penalty-kick__aim-line--active', view.stage === 'aim-y');

    const diving = view.stage === 'kick' || view.stage === 'result';
    refs.keeper.classList.toggle('penalty-kick__keeper--diving', diving);
    for (let zone = 0; zone < 3; zone++) {
      refs.keeper.classList.toggle(
        `penalty-kick__keeper--zone-${zone}`,
        diving && view.keeperZone === zone,
      );
    }
    refs.keeper.dataset.zone = diving && view.keeperZone !== -1 ? ZONE_LABEL[view.keeperZone] : '';

    refs.ball.classList.toggle(
      'penalty-kick__ball--kicked',
      view.stage === 'kick' || view.stage === 'result',
    );
    refs.ball.style.setProperty('--kick-progress', String(view.kickProgress));

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
    const goal = el('div', 'penalty-kick__goal');
    const aimX = el('div', 'penalty-kick__aim-line penalty-kick__aim-line--x');
    const aimY = el('div', 'penalty-kick__aim-line penalty-kick__aim-line--y');
    const keeper = el('div', 'penalty-kick__keeper');
    const ball = el('div', 'penalty-kick__ball');
    goal.append(aimX, aimY, keeper, ball);
    field.append(goal);
    const toast = el('div', 'penalty-kick__toast');
    toast.hidden = true;
    field.append(toast);

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
      aimX,
      aimY,
      keeper,
      ball,
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
