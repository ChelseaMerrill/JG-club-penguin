import { MINIGAME_RULES } from '../../persistence/minigame-rules';
import type { Minigame, MinigameContext } from '../minigame';
import {
  createPancakeFlipEngine,
  PAN_COUNT,
  type PancakeFlipEngine,
  type PancakeFlipEngineOptions,
  type PancakeStage,
  type PanIndex,
} from './pancake-flip-engine';
import './pancake-flip.css';

/** How often the DOM layer ticks the engine while playing, matching the
 *  design's own `setInterval(this.tick, 100)` cadence. */
const TICK_MS = 100;
/** How long a flip's result toast (e.g. "GOLDEN +10") stays up. */
const TOAST_MS = 900;

const STAGE_LABEL: Record<PancakeStage, string> = {
  raw: 'RAW',
  'flip-now': 'FLIP NOW',
  golden: 'GOLDEN',
  burnt: 'BURNT',
};

const STAGE_TOAST: Record<PancakeStage, string> = {
  raw: 'RAW',
  'flip-now': 'FLIPPED +5',
  golden: 'GOLDEN +10',
  burnt: 'BURNT',
};

export interface PancakeFlipOptions {
  /** Test-only: a pre-built engine (e.g. with a controllable RNG) instead of
   *  a fresh `createPancakeFlipEngine()`. */
  engine?: PancakeFlipEngine;
  /** Test-only: forwarded to `createPancakeFlipEngine` when `engine` isn't
   *  given, so a test can seed a deterministic batter cadence without
   *  reaching into the engine module directly. */
  engineOptions?: PancakeFlipEngineOptions;
}

/** Test-only hooks `dev-minigame-hook.ts` drives from `window.__minigameTest`
 *  (`?minigame=pancake-flip`), the same shape as `bug-squash`'s
 *  `StubMinigameTestHooks` but named for its own game: the 90s round is too
 *  long to play out for real (or to simulate minute-by-minute with a faked
 *  clock) in e2e. Not part of the `Minigame` interface. */
export interface PancakeFlipTestHooks {
  /** Ends the round now, as if the shell's timer reached 0. */
  debugFinishNow(): void;
}

interface PanRefs {
  root: HTMLElement;
  surface: HTMLButtonElement;
  cookBarFill: HTMLElement;
  label: HTMLElement;
}

/**
 * The real Pancake Flip game (issue #39), replacing `bug-squash`'s stub
 * pattern with `pancake-flip-engine.ts`'s pure simulation underneath a thin
 * DOM layer. Mirrors `design/Minigame Pancake Flip.dc.html`'s griddle, pans,
 * cook bars, and controls into the shell's play area
 * (`createMinigameShell`'s `playAreaEl`); the shell still owns the round's
 * timer, pause/resume, the P key, and `recordRound`.
 *
 * Producer: #39. Consumer: `createDefaultMinigameRegistry`
 * (`minigame-registry.ts`).
 */
export function createPancakeFlip(
  options: PancakeFlipOptions = {},
): Minigame<'pancake-flip'> & PancakeFlipTestHooks {
  const engine = options.engine ?? createPancakeFlipEngine(options.engineOptions);
  const durationSec = MINIGAME_RULES['pancake-flip'].durationSeconds;

  let context: MinigameContext<'pancake-flip'> | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let toastTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let keydownHandler: ((event: KeyboardEvent) => void) | undefined;

  const panRefs: PanRefs[] = [];
  let streakValueEl: HTMLElement | undefined;
  let toastEl: HTMLElement | undefined;

  function report(): void {
    context?.setScore(engine.score);
    context?.setStats({ ...engine.stats });
  }

  function render(): void {
    for (let i = 0; i < PAN_COUNT; i++) {
      const refs = panRefs[i];
      if (!refs) continue;
      const pan = engine.panAt(i as PanIndex);
      const isSelected = engine.selected === i;
      refs.root.classList.toggle('pancake-flip__pan--selected', isSelected);

      if (pan) {
        refs.root.classList.add('pancake-flip__pan--filled');
        refs.root.dataset.stage = pan.stage;
        refs.cookBarFill.style.width = `${Math.round(pan.cookFraction * 100)}%`;
        refs.label.textContent = STAGE_LABEL[pan.stage];
      } else {
        refs.root.classList.remove('pancake-flip__pan--filled');
        delete refs.root.dataset.stage;
        refs.cookBarFill.style.width = '0%';
        refs.label.textContent = isSelected ? 'EMPTY · SELECTED' : 'EMPTY';
      }
    }
    if (streakValueEl) streakValueEl.textContent = String(engine.streak);
  }

  function showToast(text: string, tone: 'good' | 'bad'): void {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.dataset.tone = tone;
    toastEl.hidden = false;
    if (toastTimeoutId !== undefined) clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
      if (toastEl) toastEl.hidden = true;
    }, TOAST_MS);
  }

  function doFlip(): void {
    const outcome = engine.flip();
    if (outcome === 'empty') return;
    report();
    render();
    showToast(
      STAGE_TOAST[outcome],
      outcome === 'golden' || outcome === 'flip-now' ? 'good' : 'bad',
    );
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.repeat) return;
    switch (event.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        event.preventDefault();
        engine.selectDelta(-1);
        render();
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        event.preventDefault();
        engine.selectDelta(1);
        render();
        break;
      case ' ':
      case 'Enter':
        event.preventDefault();
        doFlip();
        break;
      default:
        break;
    }
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
      const { burnedOff } = engine.tick(TICK_MS / 1000);
      if (burnedOff.length > 0) showToast('BURNT', 'bad');
      report();
      render();
    }, TICK_MS);
  }

  function buildDom(container: HTMLElement): void {
    const root = document.createElement('div');
    root.className = 'pancake-flip';

    const board = document.createElement('div');
    board.className = 'pancake-flip__board';

    const griddle = document.createElement('div');
    griddle.className = 'pancake-flip__griddle';

    panRefs.length = 0;
    for (let i = 0; i < PAN_COUNT; i++) {
      const panEl = document.createElement('div');
      panEl.className = 'pancake-flip__pan';
      panEl.dataset.pan = String(i);

      const cookBar = document.createElement('div');
      cookBar.className = 'pancake-flip__cook-bar';
      const cookBarFill = document.createElement('div');
      cookBarFill.className = 'pancake-flip__cook-bar-fill';
      cookBar.append(cookBarFill);

      const surface = document.createElement('button');
      surface.type = 'button';
      surface.className = 'pancake-flip__pan-surface';
      surface.setAttribute('aria-label', `Pan ${i + 1}`);
      surface.addEventListener('click', () => {
        engine.select(i as PanIndex);
        render();
      });

      const label = document.createElement('div');
      label.className = 'pancake-flip__pan-label';

      panEl.append(cookBar, surface, label);
      griddle.append(panEl);
      panRefs.push({ root: panEl, surface, cookBarFill, label });
    }

    const toast = document.createElement('div');
    toast.className = 'pancake-flip__toast';
    toast.hidden = true;
    griddle.append(toast);
    toastEl = toast;

    const controls = document.createElement('div');
    controls.className = 'pancake-flip__controls';
    const hint = document.createElement('span');
    hint.className = 'pancake-flip__hint';
    hint.textContent = '← / → · A / D — PICK A PAN';
    const flipButton = document.createElement('button');
    flipButton.type = 'button';
    flipButton.className = 'pancake-flip__flip-button';
    flipButton.textContent = 'SPACE / ENTER · FLIP';
    flipButton.addEventListener('click', doFlip);
    controls.append(hint, flipButton);

    board.append(griddle, controls);

    const side = document.createElement('div');
    side.className = 'pancake-flip__side';

    const streakLabel = document.createElement('div');
    streakLabel.className = 'pancake-flip__side-label';
    streakLabel.textContent = 'STREAK';
    const streakValue = document.createElement('div');
    streakValue.className = 'pancake-flip__streak-value';
    streakValue.textContent = '0';
    streakValueEl = streakValue;

    const legend = document.createElement('div');
    legend.className = 'pancake-flip__legend';
    const legendRows: Array<[string, string, string]> = [
      ['golden', 'GOLDEN', '+10'],
      ['flip-now', 'FLIP NOW', '+5'],
      ['bad', 'RAW / BURNT', '0 / -5'],
    ];
    for (const [tone, label, value] of legendRows) {
      const row = document.createElement('div');
      row.className = 'pancake-flip__legend-row';
      row.dataset.tone = tone;
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      const valueEl = document.createElement('span');
      valueEl.textContent = value;
      row.append(labelEl, valueEl);
      legend.append(row);
    }

    side.append(streakLabel, streakValue, legend);
    root.append(board, side);
    container.replaceChildren(root);
  }

  return {
    id: 'pancake-flip',
    title: 'PANCAKE FLIP',
    durationSec,
    howToPlay: [
      'Four pans. Batter drops in on its own — watch each pancake cook RAW -> FLIP NOW -> GOLDEN -> BURNT. The bar above the pan shows how far along it is.',
      '← / → (or A / D, or clicking a pan) picks a pan; the cyan ring shows which one.',
      'SPACE or ENTER flips it. GOLDEN pays +10, FLIP NOW pays +5, RAW pays nothing, and BURNT costs -5 — including one left to burn off the pan.',
    ],
    statLabels: { stacked: 'STACKED', golden: 'GOLDEN', burnt: 'BURNT' },

    start(container, ctx) {
      context = ctx;
      buildDom(container);
      report();
      render();
      startTicking();
      keydownHandler = handleKeydown;
      window.addEventListener('keydown', keydownHandler);
    },

    pause() {
      stopTicking();
    },

    resume() {
      startTicking();
    },

    end() {
      stopTicking();
      if (toastTimeoutId !== undefined) {
        clearTimeout(toastTimeoutId);
        toastTimeoutId = undefined;
      }
      if (keydownHandler) {
        window.removeEventListener('keydown', keydownHandler);
        keydownHandler = undefined;
      }
      return { score: engine.score, stats: { ...engine.stats } };
    },

    debugFinishNow() {
      context?.finish();
    },
  };
}
