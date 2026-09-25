import { MINIGAME_RULES } from '../../persistence/minigame-rules';
import type { Minigame, MinigameContext } from '../minigame';
import type { StubMinigameTestHooks } from '../stub-minigame';
import {
  CELL_COUNT,
  CELL_KEYS,
  createBugSquashEngine,
  MAX_LIGHTS,
  type BugSquashEngine,
} from './bug-squash-engine';
import './bug-squash.css';

const DURATION_SEC = MINIGAME_RULES['bug-squash'].durationSeconds;

/** The engine's own tick granularity, run on a real `setInterval` while the
 *  round is playing and unpaused (`bug-squash-engine.ts`'s `STEP_MS`,
 *  duplicated here since the engine doesn't export its DOM-timing choice). */
const TICK_MS = 100;

/** The design's 16 code-line snippets, one per cell, in cell-index order.
 *  Purely cosmetic (`design/Minigame Bug Squash.dc.html`'s `LINES`). */
const CODE_LINES: readonly string[] = [
  'npm test',
  'it("ships")',
  'expect(true)',
  'CI: 141 / 142',
  'flaky ✓',
  'retry…',
  'TODO: fix',
  '// wat',
  'build ok',
  'lint clean',
  'deploy?',
  'main ← pr #42',
  'assert()',
  'snapshot',
  'mock.fs',
  'coverage 91%',
];

/**
 * Bug Squash: a grid of 16 test cells that spawn bugs to click (or press the
 * cell's key) before they crawl away. Reproduces
 * `design/Minigame Bug Squash.dc.html`'s play-area chrome (cells, bugs,
 * build lights) inside the shell's play area; the shell (#37) owns the
 * round's timer, pause state and phase transitions, and the how-to-play/done
 * screens.
 *
 * The DOM layer here is thin: all scoring/spawn/escape logic lives in
 * `createBugSquashEngine` (`bug-squash-engine.ts`), driven by this module's
 * own 100ms interval (started on `start`/`resume`, stopped on
 * `pause`/`end`) so the ramp only ever advances during unpaused play.
 *
 * Producer: #38. Replaces the #37 stub in `createDefaultMinigameRegistry`
 * (`minigame-registry.ts`).
 */
export function createBugSquashMinigame(): Minigame<'bug-squash'> & StubMinigameTestHooks {
  let engine: BugSquashEngine = createBugSquashEngine();
  let context: MinigameContext<'bug-squash'> | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let cellEls: HTMLButtonElement[] = [];
  let bugEls: HTMLElement[] = [];
  let lightEls: HTMLElement[] = [];
  let running = false;

  function report(): void {
    const stats = engine.getStats();
    context?.setScore(stats.score);
    context?.setStats(stats);
  }

  function renderCell(index: number): void {
    const cell = cellEls[index];
    const bugEl = bugEls[index];
    if (!cell || !bugEl) return;
    const cellState = engine.getState().cells[index];
    const bug = cellState.bug;
    cell.classList.toggle('bug-squash__cell--cyan', !!bug && !bug.flaky);
    cell.classList.toggle('bug-squash__cell--flaky', !!bug && bug.flaky);
    bugEl.hidden = !bug;
  }

  function renderLights(): void {
    const { lights } = engine.getState();
    lightEls.forEach((el, i) => {
      el.classList.toggle('bug-squash__light--lit', i < lights);
    });
  }

  function renderAll(): void {
    for (let i = 0; i < CELL_COUNT; i++) renderCell(i);
    renderLights();
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
      engine.tick(TICK_MS / 1000);
      renderAll();
      report();
      if (engine.getState().ended) {
        stopTicking();
        context?.finish();
      }
    }, TICK_MS);
  }

  function squash(index: number): void {
    if (!running) return;
    engine.hit(index);
    renderCell(index);
    report();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const index = CELL_KEYS.indexOf(event.key.toUpperCase());
    if (index === -1) return;
    event.preventDefault();
    squash(index);
  }

  return {
    id: 'bug-squash',
    title: 'BUG SQUASH',
    durationSec: DURATION_SEC,
    howToPlay: [
      'Bugs pop out of the 16 test cells at random and crawl away after a moment. The later it gets, the faster they come.',
      'Click a bug, or press its cell key (1-9, 0, Q W E R T Y). Cyan bugs take 1 hit for +10; white flaky bugs take 2 hits for +25. Consecutive squashes build a combo multiplier up to x4.',
      'Every bug that escapes costs a build light. Lose all three and CI fails. Clicking an empty cell resets your combo. 500 points unlocks the Exterminator badge.',
    ],
    statLabels: { squashed: 'SQUASHED' },

    start(container, ctx) {
      context = ctx;
      engine = createBugSquashEngine();
      running = true;

      const root = document.createElement('div');
      root.className = 'bug-squash';

      const lights = document.createElement('div');
      lights.className = 'bug-squash__lights';
      lightEls = [];
      for (let i = 0; i < MAX_LIGHTS; i++) {
        const light = document.createElement('span');
        light.className = 'bug-squash__light bug-squash__light--lit';
        lights.append(light);
        lightEls.push(light);
      }

      const grid = document.createElement('div');
      grid.className = 'bug-squash__grid';
      cellEls = [];
      bugEls = [];
      for (let i = 0; i < CELL_COUNT; i++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'bug-squash__cell';

        const keyEl = document.createElement('span');
        keyEl.className = 'bug-squash__cell-key';
        keyEl.textContent = CELL_KEYS[i];

        const bugEl = document.createElement('span');
        bugEl.className = 'bug-squash__bug';
        bugEl.hidden = true;
        bugEl.setAttribute('aria-hidden', 'true');

        const lineEl = document.createElement('span');
        lineEl.className = 'bug-squash__cell-line';
        lineEl.textContent = CODE_LINES[i];

        cell.append(keyEl, bugEl, lineEl);
        cell.addEventListener('click', () => squash(i));
        grid.append(cell);
        cellEls.push(cell);
        bugEls.push(bugEl);
      }

      root.append(lights, grid);
      container.replaceChildren(root);

      window.addEventListener('keydown', handleKeydown);
      renderAll();
      report();
      startTicking();
    },

    pause() {
      running = false;
      stopTicking();
    },

    resume() {
      running = true;
      startTicking();
    },

    end() {
      running = false;
      stopTicking();
      window.removeEventListener('keydown', handleKeydown);
      return { score: engine.getStats().score, stats: engine.getStats() };
    },

    debugSetScore(score) {
      engine.debugSetScore(score);
      report();
    },

    debugFinishNow() {
      context?.finish();
    },
  };
}
