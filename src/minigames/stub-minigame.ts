import { MINIGAME_RULES } from '../persistence/minigame-rules';
import type { Minigame, MinigameContext } from './minigame';

/** Test-only hooks `dev-minigame-hook.ts` drives from `window.__minigameTest`
 *  (`?minigame=bug-squash`). Not part of the `Minigame` interface. */
export interface StubMinigameTestHooks {
  /** Sets the score directly, bypassing clicks (e.g. to reach Bug Squash's
   *  500-point Badge threshold in e2e without 50 clicks). */
  debugSetScore(score: number): void;
  /** Ends the round now, as if the shell's timer reached 0. */
  debugFinishNow(): void;
}

/** Default round length for the stub, before #38 gives Bug Squash a real
 *  game: `MINIGAME_RULES['bug-squash'].durationSeconds`, the same round
 *  length #27's payout rule already assumes. e2e and manual dev testing
 *  skip waiting out the full round via `debugFinishNow()`/`finishNow()`. */
const DEFAULT_DURATION_SEC = MINIGAME_RULES['bug-squash'].durationSeconds;
const POINTS_PER_CLICK = 10;

/**
 * Bug Squash's original placeholder implementation: a single click-to-score
 * button. #38 replaced it in the default Minigame registry
 * (`minigame-registry.ts`) with the real grid-of-bugs game from
 * `design/Minigame Bug Squash.dc.html`; kept here for any framework test
 * that still wants a minimal `Minigame<'bug-squash'>` double. `bestCombo`
 * and `escaped` are always `1`/`0`: this stub has no combo or escape
 * mechanic, just a running `squashed` count.
 *
 * Producer: #37.
 */
export function createStubMinigame(
  options: { durationSec?: number } = {},
): Minigame<'bug-squash'> & StubMinigameTestHooks {
  const durationSec = options.durationSec ?? DEFAULT_DURATION_SEC;

  let score = 0;
  let squashed = 0;
  let context: MinigameContext<'bug-squash'> | undefined;
  let button: HTMLButtonElement | undefined;

  function report(): void {
    context?.setScore(score);
    context?.setStats({ score, squashed, bestCombo: 1, escaped: 0 });
  }

  return {
    id: 'bug-squash',
    title: 'BUG SQUASH',
    durationSec,
    howToPlay: [
      'Click the button as many times as you can before time runs out.',
      `Each click squashes one bug and adds ${POINTS_PER_CLICK} points.`,
    ],
    statLabels: { squashed: 'SQUASHED' },

    start(container, ctx) {
      context = ctx;
      score = 0;
      squashed = 0;
      report();

      button = document.createElement('button');
      button.type = 'button';
      button.className = 'stub-minigame__squash-button';
      button.textContent = 'SQUASH';
      button.addEventListener('click', () => {
        score += POINTS_PER_CLICK;
        squashed += 1;
        report();
      });
      container.replaceChildren(button);
    },

    pause() {
      if (button) button.disabled = true;
    },

    resume() {
      if (button) button.disabled = false;
    },

    end() {
      if (button) button.disabled = true;
      return { score, stats: { score, squashed, bestCombo: 1, escaped: 0 } };
    },

    debugSetScore(nextScore) {
      score = nextScore;
      report();
    },

    debugFinishNow() {
      context?.finish();
    },
  };
}
