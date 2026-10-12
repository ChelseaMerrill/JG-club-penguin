import { ProgressStoreError, type PitchSubmitResult } from '../persistence/progress-store';
import type { OverlayManager } from '../ui/hud/overlay-manager';
import { formatCountdown } from './coffee-run';
import './pitch-overlay.css';

/** The id the overlay registers with `hud.overlays` (#142). */
export const PITCH_OVERLAY_ID = 'pitch-linda';

/** The overlay's own countdown, from the server's 60 s limit (`start_pitch`). */
export const PITCH_COUNTDOWN_SECONDS = 60;

/** How often the countdown re-renders. */
export const PITCH_TICK_MS = 100;

/** Linda's reaction to an accepted pitch under this many server-clock seconds. */
export const PITCH_FAST_THRESHOLD_SECONDS = 20;

/** Linda's reaction lines (draft copy; BA to edit later, per the ticket). */
export const PITCH_FAST_LINE = 'Closed. Sign here.';
export const PITCH_SLOW_LINE = "Smile. It's working.";
export const PITCH_TIMEOUT_LINE = "Every room is a pitch. That one wasn't.";

/** The overlay's three rows, each with three choices (draft copy; BA to edit later). */
export const PITCH_ROWS = [
  {
    label: 'PROBLEM',
    choices: [
      'CI is always red.',
      'Nobody can find a meeting room.',
      'The coffee pot is always empty.',
    ],
  },
  {
    label: 'SOLUTION',
    choices: [
      'Bug Squash, but for real bugs.',
      'A penguin that books rooms for you.',
      'Coffee Rush, as a service.',
    ],
  },
  {
    label: 'ASK',
    choices: ['Give us Friday.', 'Two interns and a whiteboard.', 'Just the pumpkin spice budget.'],
  },
] as const;

export interface PitchOverlayDeps {
  overlays: OverlayManager;
  /** Opens the attempt: resets the server's 60 s clock (`startPitch`). Rejects on a store failure. */
  start(): Promise<void>;
  /**
   * Scores the pitch (`submitPitch`). Rejects with a `ProgressStoreError`
   * whose `code` is `'pitch_timeout'` for a server-side timeout (the overlay
   * shows the same reaction as its own countdown reaching 0:00); any other
   * rejection is treated as a generic failure.
   */
  submit(problem: number, solution: number, ask: number): Promise<PitchSubmitResult>;
  /** Defaults to `Date.now`; the dev/e2e hooks pass the shared clock `__questsTest.advanceClock` moves (#141). */
  now?: () => number;
}

export interface PitchOverlay {
  /** Opens the overlay and starts a fresh 60 s attempt. */
  open(): void;
  isOpen(): boolean;
  destroy(): void;
}

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

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

type Phase = 'loading' | 'play' | 'passed' | 'timeout' | 'error';

/**
 * The pitch overlay (#142): Linda's "PITCH LINDA" panel, opened from her
 * dialog's "Pitch Linda" action once the Player has talked to her. A 60 s
 * countdown (display only -- the server's own 65 s window, 60 s plus 5 s of
 * grace, is the only one that counts) runs while the Player picks one
 * Problem, one Solution and one Ask; Submit is enabled once all three are
 * picked. The server's own clock decides the reaction: under 20 s accepted
 * is "Closed. Sign here.", otherwise accepted is "Smile. It's working.", and
 * either the overlay's own countdown reaching 0:00 or the server refusing a
 * late submission with `pitch_timeout` shows "Every room is a pitch. That
 * one wasn't." with a Try again button (another `startPitch`).
 */
export function createPitchOverlay(root: HTMLElement, deps: PitchOverlayDeps): PitchOverlay {
  const now = deps.now ?? (() => Date.now());

  const overlay = el('div', 'pitch-overlay');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Pitch Linda');

  const panel = el('div', 'pitch-overlay__panel');
  const header = el('div', 'pitch-overlay__header');
  header.append(
    el('div', 'pitch-overlay__title', 'PITCH LINDA'),
    el('div', 'pitch-overlay__kicker', 'THE ICEBOX · 60 SECONDS'),
  );
  const countdown = el('div', 'pitch-overlay__countdown');
  header.append(countdown);

  const play = el('div', 'pitch-overlay__play');
  const rows = PITCH_ROWS.map((row) => {
    const rowEl = el('div', 'pitch-overlay__row');
    rowEl.append(el('div', 'pitch-overlay__row-label', row.label));
    const choiceList = el('div', 'pitch-overlay__choices');
    const choiceButtons = row.choices.map((text, index) => {
      const choiceButton = button('pitch-overlay__choice', text, () => selectChoice(rowEl, index));
      choiceList.append(choiceButton);
      return choiceButton;
    });
    rowEl.append(choiceList);
    play.append(rowEl);
    return { rowEl, choiceButtons, selected: null as number | null };
  });
  const submitButton = button(
    'pitch-overlay__button pitch-overlay__button--primary',
    'SUBMIT',
    () => void submit(),
  );
  submitButton.disabled = true;
  const playFooter = el('div', 'pitch-overlay__footer');
  playFooter.append(
    button('pitch-overlay__button pitch-overlay__button--secondary', 'CANCEL', () => close()),
    submitButton,
  );
  play.append(playFooter);

  const result = el('div', 'pitch-overlay__result');
  const resultLine = el('div', 'pitch-overlay__result-line');
  const resultActions = el('div', 'pitch-overlay__footer');
  result.append(resultLine, resultActions);

  const message = el('div', 'pitch-overlay__message');

  panel.append(header, play, result, message);
  overlay.append(panel);
  root.append(overlay);

  let phase: Phase = 'loading';
  let deadlineMs: number | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  /** Bumped by every open and close, so a late server reply is dropped. */
  let generation = 0;

  function selectedRow(rowEl: HTMLElement): (typeof rows)[number] {
    const found = rows.find((row) => row.rowEl === rowEl);
    if (!found) throw new Error('unknown pitch-overlay row');
    return found;
  }

  function selectChoice(rowEl: HTMLElement, index: number): void {
    if (phase !== 'play') return;
    const row = selectedRow(rowEl);
    row.selected = index;
    row.choiceButtons.forEach((choiceButton, choiceIndex) => {
      choiceButton.classList.toggle('pitch-overlay__choice--selected', choiceIndex === index);
    });
    submitButton.disabled = !rows.every((r) => r.selected !== null);
  }

  function show(next: Phase): void {
    phase = next;
    play.hidden = next !== 'play';
    result.hidden = next !== 'passed' && next !== 'timeout';
    message.hidden = next !== 'loading' && next !== 'error';
    countdown.hidden = next !== 'play';
  }

  function stopTicker(): void {
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
  }

  function secondsLeft(): number {
    if (deadlineMs === null) return 0;
    return Math.max(0, (deadlineMs - now()) / 1000);
  }

  function renderCountdown(): void {
    countdown.textContent = formatCountdown(secondsLeft());
  }

  function tick(): void {
    renderCountdown();
    if (secondsLeft() <= 0) showTimeout();
  }

  function resetChoices(): void {
    for (const row of rows) {
      row.selected = null;
      row.choiceButtons.forEach((choiceButton) =>
        choiceButton.classList.remove('pitch-overlay__choice--selected'),
      );
    }
    submitButton.disabled = true;
  }

  function showTimeout(): void {
    stopTicker();
    resultLine.textContent = PITCH_TIMEOUT_LINE;
    resultActions.replaceChildren(
      button(
        'pitch-overlay__button pitch-overlay__button--primary',
        'TRY AGAIN',
        () => void startAttempt(),
      ),
      button('pitch-overlay__button pitch-overlay__button--secondary', 'BACK TO THE ICEBOX', () =>
        close(),
      ),
    );
    show('timeout');
  }

  function showPassed(seconds: number): void {
    stopTicker();
    resultLine.textContent =
      seconds < PITCH_FAST_THRESHOLD_SECONDS ? PITCH_FAST_LINE : PITCH_SLOW_LINE;
    resultActions.replaceChildren(
      button('pitch-overlay__button pitch-overlay__button--primary', 'BACK TO THE ICEBOX', () =>
        close(),
      ),
    );
    show('passed');
  }

  async function startAttempt(): Promise<void> {
    const mine = generation;
    resetChoices();
    message.textContent = 'Linda is waiting…';
    show('loading');
    try {
      await deps.start();
    } catch (err) {
      console.error('[pitch-overlay] start failed', err);
      if (mine !== generation) return;
      message.textContent = "Couldn't reach the server. Try again in a moment.";
      show('error');
      return;
    }
    if (mine !== generation) return;
    deadlineMs = now() + PITCH_COUNTDOWN_SECONDS * 1000;
    show('play');
    renderCountdown();
    stopTicker();
    ticker = setInterval(tick, PITCH_TICK_MS);
  }

  async function submit(): Promise<void> {
    if (phase !== 'play' || rows.some((row) => row.selected === null)) return;
    const [problem, solution, ask] = rows.map((row) => row.selected!);
    const mine = generation;
    submitButton.disabled = true;
    stopTicker();
    let outcome: PitchSubmitResult;
    try {
      outcome = await deps.submit(problem, solution, ask);
    } catch (err) {
      if (mine !== generation) return;
      if (err instanceof ProgressStoreError && err.code === 'pitch_timeout') {
        showTimeout();
        return;
      }
      console.error('[pitch-overlay] submit failed', err);
      message.textContent = "Couldn't reach the server. Try again in a moment.";
      show('error');
      return;
    }
    if (mine !== generation) return;
    showPassed(outcome.seconds);
  }

  function close(): void {
    deps.overlays.close(PITCH_OVERLAY_ID);
  }

  function hide(): void {
    generation += 1;
    stopTicker();
    overlay.hidden = true;
    deadlineMs = null;
  }

  return {
    open() {
      generation += 1;
      overlay.hidden = false;
      deps.overlays.open(PITCH_OVERLAY_ID, hide);
      void startAttempt();
    },
    isOpen() {
      return !overlay.hidden;
    },
    destroy() {
      stopTicker();
      overlay.remove();
    },
  };
}
