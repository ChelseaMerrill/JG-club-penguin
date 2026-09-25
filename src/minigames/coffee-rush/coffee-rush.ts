import { MINIGAME_RULES } from '../../persistence/minigame-rules';
import type { Minigame, MinigameContext } from '../minigame';
import {
  createCoffeeRushEngine,
  CUP_COUNT,
  CUP_VALUE,
  FILL_TARGET_PCT,
  ORDER_QUEUE_SIZE,
  PERFECT_BONUS,
  PERFECT_TOLERANCE_PCT,
  SERVE_TOLERANCE_PCT,
  type CoffeeRushEngine,
  type CoffeeRushEngineOptions,
  type CupIndex,
  type CupSize,
  type PourOutcome,
} from './coffee-rush-engine';
import './coffee-rush.css';

/** How often the DOM layer ticks the engine while playing, matching the
 *  design's own `setInterval(this.tick, 100)` cadence. */
const TICK_MS = 100;
/** How long a pour's result toast (e.g. "PERFECT +10") stays up. */
const TOAST_MS = 900;

const SIZE_LABEL: Record<CupSize, string> = { small: 'SMALL', medium: 'MEDIUM', large: 'LARGE' };

export interface CoffeeRushOptions {
  /** Test-only: a pre-built engine (e.g. with a controllable RNG) instead of
   *  a fresh `createCoffeeRushEngine()`. */
  engine?: CoffeeRushEngine;
  /** Test-only: forwarded to `createCoffeeRushEngine` when `engine` isn't
   *  given, so a test can seed a deterministic order sequence without
   *  reaching into the engine module directly. */
  engineOptions?: CoffeeRushEngineOptions;
}

/** Test-only hooks `dev-minigame-hook.ts` drives from `window.__minigameTest`
 *  (`?minigame=coffee-rush`), the same shape as `pancake-flip`'s
 *  `PancakeFlipTestHooks`: the 90s round is too long to play out for real in
 *  e2e. Not part of the `Minigame` interface. */
export interface CoffeeRushTestHooks {
  /** Ends the round now, as if the shell's timer reached 0. */
  debugFinishNow(): void;
}

interface CupRefs {
  root: HTMLElement;
  fillEl: HTMLElement;
  lineEl: HTMLElement;
  label: HTMLElement;
}

interface TicketRefs {
  root: HTMLElement;
  sizeEl: HTMLElement;
  barFillEl: HTMLElement;
}

/**
 * The real Coffee Rush game (issue #50), mirroring `pancake-flip.ts`'s shape:
 * a pure `coffee-rush-engine.ts` underneath a thin DOM layer ported from
 * `design/Minigame Coffee Rush.dc.html`'s ticket line, cups, and fill-line
 * legend into the shell's generic play area (`createMinigameShell`'s
 * `playAreaEl`). The shell still owns the round's timer, pause/resume, the P
 * key, and `recordRound`.
 *
 * Producer: #50. Consumer: `createDefaultMinigameRegistry`
 * (`minigame-registry.ts`).
 */
export function createCoffeeRush(
  options: CoffeeRushOptions = {},
): Minigame<'coffee-rush'> & CoffeeRushTestHooks {
  const engine = options.engine ?? createCoffeeRushEngine(options.engineOptions);
  const durationSec = MINIGAME_RULES['coffee-rush'].durationSeconds;
  const badgeThreshold = MINIGAME_RULES['coffee-rush'].badgeThreshold;

  let context: MinigameContext<'coffee-rush'> | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let toastTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let keydownHandler: ((event: KeyboardEvent) => void) | undefined;
  let keyupHandler: ((event: KeyboardEvent) => void) | undefined;

  const cupRefs: CupRefs[] = [];
  const ticketRefs: TicketRefs[] = [];
  let toastEl: HTMLElement | undefined;
  let badgeBarFillEl: HTMLElement | undefined;
  let badgeProgressLabelEl: HTMLElement | undefined;

  function report(): void {
    context?.setScore(engine.score);
    context?.setStats({ ...engine.stats });
  }

  function render(): void {
    const orders = engine.orders();
    const head = orders[0];
    const target = head ? FILL_TARGET_PCT[head.size] : 0;

    for (let i = 0; i < ORDER_QUEUE_SIZE; i++) {
      const refs = ticketRefs[i];
      const order = orders[i];
      if (!refs || !order) continue;
      refs.sizeEl.textContent = SIZE_LABEL[order.size];
      refs.barFillEl.style.width = `${Math.round(order.patiencePct)}%`;
      refs.root.classList.toggle('coffee-rush__ticket--urgent', i === 0 && order.patiencePct < 30);
    }

    for (let i = 0; i < CUP_COUNT; i++) {
      const refs = cupRefs[i];
      if (!refs) continue;
      const cup = engine.cupAt(i as CupIndex);
      const isSelected = engine.selected === i;
      refs.root.classList.toggle('coffee-rush__cup--selected', isSelected);
      refs.fillEl.style.height = `${Math.min(100, cup.fillPct)}%`;
      refs.lineEl.style.bottom = `${target}%`;
      refs.label.textContent = isSelected ? (engine.pouring ? 'POURING' : 'READY') : `CUP ${i + 1}`;
    }

    if (badgeBarFillEl) {
      const pct = Math.min(100, (engine.score / badgeThreshold) * 100);
      badgeBarFillEl.style.width = `${pct}%`;
    }
    if (badgeProgressLabelEl) {
      badgeProgressLabelEl.textContent = `BARISTA BADGE · ${engine.score} / ${badgeThreshold}`;
    }
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

  function toastForOutcome(outcome: PourOutcome, size: CupSize | null): void {
    switch (outcome) {
      case 'perfect': {
        const payout = size ? CUP_VALUE[size] + PERFECT_BONUS : 0;
        showToast(`PERFECT +${payout}`, 'good');
        break;
      }
      case 'served': {
        const payout = size ? CUP_VALUE[size] : 0;
        showToast(`SERVED +${payout}`, 'good');
        break;
      }
      case 'spilled':
        showToast('SPILLED', 'bad');
        break;
      case 'rejected':
        showToast('TOO LITTLE', 'bad');
        break;
      case 'none':
        break;
    }
  }

  function doStartPour(): void {
    engine.startPour();
    render();
  }

  function doReleasePour(): void {
    const headSize = engine.orders()[0]?.size ?? null;
    const outcome = engine.releasePour();
    if (outcome === 'none') return;
    report();
    render();
    toastForOutcome(outcome, headSize);
  }

  function handleKeydown(event: KeyboardEvent): void {
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
        event.preventDefault();
        if (!event.repeat) doStartPour();
        break;
      default:
        break;
    }
  }

  function handleKeyup(event: KeyboardEvent): void {
    if (event.key === ' ') {
      event.preventDefault();
      doReleasePour();
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
      const { walkedOut, forceSpilled } = engine.tick(TICK_MS / 1000);
      if (walkedOut) showToast('WALKED OUT', 'bad');
      else if (forceSpilled) showToast('SPILLED', 'bad');
      if (walkedOut || forceSpilled) report();
      render();
    }, TICK_MS);
  }

  function buildDom(container: HTMLElement): void {
    const root = document.createElement('div');
    root.className = 'coffee-rush';

    const board = document.createElement('div');
    board.className = 'coffee-rush__board';

    const ticketRow = document.createElement('div');
    ticketRow.className = 'coffee-rush__tickets';
    ticketRefs.length = 0;
    for (let i = 0; i < ORDER_QUEUE_SIZE; i++) {
      const ticket = document.createElement('div');
      ticket.className = 'coffee-rush__ticket';
      const sizeEl = document.createElement('div');
      sizeEl.className = 'coffee-rush__ticket-size';
      const bar = document.createElement('div');
      bar.className = 'coffee-rush__ticket-bar';
      const barFill = document.createElement('div');
      barFill.className = 'coffee-rush__ticket-bar-fill';
      bar.append(barFill);
      ticket.append(sizeEl, bar);
      ticketRow.append(ticket);
      ticketRefs.push({ root: ticket, sizeEl, barFillEl: barFill });
    }

    const counter = document.createElement('div');
    counter.className = 'coffee-rush__counter';

    const cupsRow = document.createElement('div');
    cupsRow.className = 'coffee-rush__cups';

    cupRefs.length = 0;
    for (let i = 0; i < CUP_COUNT; i++) {
      const cupEl = document.createElement('button');
      cupEl.type = 'button';
      cupEl.className = 'coffee-rush__cup';
      cupEl.dataset.cup = String(i);
      cupEl.setAttribute('aria-label', `Cup ${i + 1}`);
      cupEl.addEventListener('click', () => {
        engine.select(i as CupIndex);
        render();
      });

      const fillEl = document.createElement('div');
      fillEl.className = 'coffee-rush__cup-fill';
      const lineEl = document.createElement('div');
      lineEl.className = 'coffee-rush__cup-line';
      const label = document.createElement('div');
      label.className = 'coffee-rush__cup-label';

      cupEl.append(fillEl, lineEl);
      const wrap = document.createElement('div');
      wrap.className = 'coffee-rush__cup-wrap';
      wrap.append(cupEl, label);
      cupsRow.append(wrap);
      cupRefs.push({ root: wrap, fillEl, lineEl, label });
    }

    const toast = document.createElement('div');
    toast.className = 'coffee-rush__toast';
    toast.hidden = true;
    cupsRow.append(toast);
    toastEl = toast;

    counter.append(cupsRow);

    const controls = document.createElement('div');
    controls.className = 'coffee-rush__controls';
    const hint = document.createElement('span');
    hint.className = 'coffee-rush__hint';
    hint.textContent = 'A / D — PICK A CUP';
    const pourButton = document.createElement('button');
    pourButton.type = 'button';
    pourButton.className = 'coffee-rush__pour-button';
    pourButton.textContent = 'HOLD SPACE (OR THIS) · POUR';
    pourButton.addEventListener('mousedown', doStartPour);
    pourButton.addEventListener('mouseup', doReleasePour);
    pourButton.addEventListener('mouseleave', () => {
      if (engine.pouring) doReleasePour();
    });
    controls.append(hint, pourButton);

    board.append(ticketRow, counter, controls);

    const side = document.createElement('div');
    side.className = 'coffee-rush__side';

    const legendLabel = document.createElement('div');
    legendLabel.className = 'coffee-rush__side-label';
    legendLabel.textContent = 'FILL LINES';
    side.append(legendLabel);

    const legend = document.createElement('div');
    legend.className = 'coffee-rush__legend';
    for (const size of ['small', 'medium', 'large'] as const) {
      const row = document.createElement('div');
      row.className = 'coffee-rush__legend-row';
      const name = document.createElement('span');
      name.textContent = SIZE_LABEL[size];
      const fillTo = document.createElement('span');
      fillTo.className = 'coffee-rush__legend-fillto';
      fillTo.textContent = `FILL TO ${FILL_TARGET_PCT[size]}%`;
      const value = document.createElement('span');
      value.className = 'coffee-rush__legend-value';
      value.textContent = String(CUP_VALUE[size]);
      row.append(name, fillTo, value);
      legend.append(row);
    }
    side.append(legend);

    const note = document.createElement('div');
    note.className = 'coffee-rush__note';
    note.textContent = `Within ${PERFECT_TOLERANCE_PCT}% of the line = PERFECT (+5). Within ${SERVE_TOLERANCE_PCT}% still serves. Further over spills the cup.`;
    side.append(note);

    const badgeProgressLabel = document.createElement('div');
    badgeProgressLabel.className = 'coffee-rush__badge-label';
    badgeProgressLabelEl = badgeProgressLabel;
    const badgeBar = document.createElement('div');
    badgeBar.className = 'coffee-rush__badge-bar';
    const badgeBarFill = document.createElement('div');
    badgeBarFill.className = 'coffee-rush__badge-bar-fill';
    badgeBar.append(badgeBarFill);
    badgeBarFillEl = badgeBarFill;
    side.append(badgeProgressLabel, badgeBar);

    root.append(board, side);
    container.replaceChildren(root);
  }

  return {
    id: 'coffee-rush',
    title: 'COFFEE RUSH',
    durationSec,
    howToPlay: [
      'The ticket line shows who and what size: SMALL, MEDIUM or LARGE. The line on the cup shows where to stop; each ticket has a patience bar that drains until it walks out.',
      'A / D (or clicking a cup) picks one of four cups. Any cup works; the selected one gets the pour.',
      `Hold SPACE (or the pour button) to pour, release at the line. Within ${PERFECT_TOLERANCE_PCT}% is PERFECT (+5). Overfill spills the cup.`,
    ],
    statLabels: { perfect: 'PERFECT', spilled: 'SPILLED', lost: 'LOST' },

    start(container, ctx) {
      context = ctx;
      buildDom(container);
      report();
      render();
      startTicking();
      keydownHandler = handleKeydown;
      keyupHandler = handleKeyup;
      window.addEventListener('keydown', keydownHandler);
      window.addEventListener('keyup', keyupHandler);
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
      if (keyupHandler) {
        window.removeEventListener('keyup', keyupHandler);
        keyupHandler = undefined;
      }
      return { score: engine.score, stats: { ...engine.stats } };
    },

    debugFinishNow() {
      context?.finish();
    },
  };
}
