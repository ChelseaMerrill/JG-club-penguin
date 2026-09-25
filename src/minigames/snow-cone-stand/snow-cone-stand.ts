import { MINIGAME_RULES } from '../../persistence/minigame-rules';
import type { Minigame, MinigameContext } from '../minigame';
import {
  createSnowConeStandEngine,
  FLAVORS,
  LINE_LENGTH,
  TOKENS_BY_CONE_SIZE,
  type Customer,
  type FlavorIndex,
  type ServeOutcome,
  type SnowConeStandEngine,
  type SnowConeStandEngineOptions,
} from './snow-cone-stand-engine';
import './snow-cone-stand.css';

/** How often the DOM layer ticks the engine while playing, matching the
 *  design's own `setInterval(this.tick, 100)` cadence. */
const TICK_MS = 100;
/** How long the toast (WADDLED OFF, WRONG ORDER, or +Tokens) stays up. */
const TOAST_MS = 900;

/** A cone's price by scoop count, taken verbatim from the design's own
 *  `menu` (`Single`/`Double`/`Triple`/`Hexle-size`). */
const SIZE_LABEL: Record<number, string> = {
  1: 'SINGLE',
  2: 'DOUBLE',
  3: 'TRIPLE',
  4: 'HEXLE-SIZE',
};

export interface SnowConeStandOptions {
  /** Test-only: a pre-built engine (e.g. with a controllable RNG) instead of
   *  a fresh `createSnowConeStandEngine()`. */
  engine?: SnowConeStandEngine;
  /** Test-only: forwarded to `createSnowConeStandEngine` when `engine`
   *  isn't given, so a test can seed deterministic customers without
   *  reaching into the engine module directly. */
  engineOptions?: SnowConeStandEngineOptions;
}

/** Test-only hooks `dev-minigame-hook.ts` drives from `window.__minigameTest`
 *  (`?minigame=snow-cone-stand`), the same shape as `pancake-flip`'s
 *  `PancakeFlipTestHooks`: the 120s round is too long to play out for real
 *  in e2e. Not part of the `Minigame` interface. */
export interface SnowConeStandTestHooks {
  /** Ends the round now, as if the shell's timer reached 0. */
  debugFinishNow(): void;
}

interface CustomerRefs {
  root: HTMLElement;
  name: HTMLElement;
  dots: HTMLElement;
  patienceBarFill: HTMLElement;
  pay: HTMLElement;
}

/**
 * The real Snow Cone Stand game (issue #49), replacing `bug-squash`'s stub
 * pattern with `snow-cone-stand-engine.ts`'s pure simulation underneath a
 * thin DOM layer. Mirrors `design/Minigame Snow Cone Stand.dc.html`'s
 * customer line, patience bars, cone builder, flavour menu, and Rush Hour
 * banner into the shell's play area (`createMinigameShell`'s `playAreaEl`);
 * the shell still owns the round's timer, pause/resume, the P key, and
 * `recordRound`.
 *
 * Producer: #49. Consumer: `createDefaultMinigameRegistry`
 * (`minigame-registry.ts`).
 */
export function createSnowConeStand(
  options: SnowConeStandOptions = {},
): Minigame<'snow-cone-stand'> & SnowConeStandTestHooks {
  const engine = options.engine ?? createSnowConeStandEngine(options.engineOptions);
  const durationSec = MINIGAME_RULES['snow-cone-stand'].durationSeconds;

  let context: MinigameContext<'snow-cone-stand'> | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let toastTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let keydownHandler: ((event: KeyboardEvent) => void) | undefined;

  const customerRefs: CustomerRefs[] = [];
  let rushBannerEl: HTMLElement | undefined;
  let toastEl: HTMLElement | undefined;
  let builderTargetEl: HTMLElement | undefined;
  let builderYoursEl: HTMLElement | undefined;
  let builderCountEl: HTMLElement | undefined;

  function report(): void {
    context?.setScore(engine.score);
    context?.setStats({ ...engine.stats });
  }

  function renderScoops(container: HTMLElement, scoops: readonly FlavorIndex[]): void {
    container.replaceChildren();
    for (const flavor of scoops) {
      const dot = document.createElement('span');
      dot.className = 'snow-cone-stand__dot';
      dot.style.setProperty('--dot-color', FLAVORS[flavor].color);
      container.append(dot);
    }
  }

  function renderCustomer(refs: CustomerRefs, customer: Customer, isFront: boolean): void {
    refs.root.classList.toggle('snow-cone-stand__customer--front', isFront);
    refs.name.textContent = customer.name.toUpperCase();
    renderScoops(refs.dots, customer.order);
    const patiencePct = Math.max(0, customer.patience);
    refs.patienceBarFill.style.width = `${patiencePct.toFixed(0)}%`;
    refs.root.classList.toggle('snow-cone-stand__customer--warn', patiencePct < 35);
    refs.pay.textContent = `+${TOKENS_BY_CONE_SIZE[customer.order.length] ?? 0}`;
  }

  function render(): void {
    for (let i = 0; i < LINE_LENGTH; i++) {
      const refs = customerRefs[i];
      const customer = engine.line[i];
      if (!refs || !customer) continue;
      renderCustomer(refs, customer, i === 0);
    }

    const front = engine.line[0];
    if (builderTargetEl) renderScoops(builderTargetEl, front ? front.order : []);
    if (builderYoursEl) renderScoops(builderYoursEl, engine.yourScoops);
    if (builderCountEl) {
      builderCountEl.textContent = `${engine.yourScoops.length} / ${front ? front.order.length : 0}`;
    }

    if (rushBannerEl) rushBannerEl.hidden = !engine.rush;
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

  function toastForOutcome(outcome: ServeOutcome): void {
    if (outcome.result === 'served') {
      showToast(`+${outcome.tokensAwarded}${outcome.rush ? ' RUSH' : ''}`, 'good');
    } else if (outcome.result === 'wrong-order') {
      showToast('WRONG ORDER', 'bad');
    }
  }

  function doServe(): void {
    const outcome = engine.serve();
    report();
    render();
    toastForOutcome(outcome);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.repeat) return;
    switch (event.key) {
      case '1':
      case '2':
      case '3':
      case '4':
        event.preventDefault();
        engine.addFlavor((Number(event.key) - 1) as FlavorIndex);
        render();
        break;
      case ' ':
        event.preventDefault();
        doServe();
        break;
      case 'Backspace':
        event.preventDefault();
        engine.undo();
        render();
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
      const { waddledOff } = engine.tick(TICK_MS / 1000);
      if (waddledOff) showToast('WADDLED OFF', 'bad');
      report();
      render();
    }, TICK_MS);
  }

  function buildDom(container: HTMLElement): void {
    const root = document.createElement('div');
    root.className = 'snow-cone-stand';

    const board = document.createElement('div');
    board.className = 'snow-cone-stand__board';

    const rushBanner = document.createElement('div');
    rushBanner.className = 'snow-cone-stand__rush-banner';
    rushBanner.textContent = 'RUSH HOUR · TOKENS DOUBLED · GO GO GO';
    rushBanner.hidden = true;
    rushBannerEl = rushBanner;

    const lineEl = document.createElement('div');
    lineEl.className = 'snow-cone-stand__line';

    customerRefs.length = 0;
    for (let i = 0; i < LINE_LENGTH; i++) {
      const card = document.createElement('div');
      card.className = 'snow-cone-stand__customer';

      const name = document.createElement('div');
      name.className = 'snow-cone-stand__customer-name';

      const dots = document.createElement('div');
      dots.className = 'snow-cone-stand__customer-dots';

      const patienceBar = document.createElement('div');
      patienceBar.className = 'snow-cone-stand__patience-bar';
      const patienceBarFill = document.createElement('div');
      patienceBarFill.className = 'snow-cone-stand__patience-bar-fill';
      patienceBar.append(patienceBarFill);

      const pay = document.createElement('div');
      pay.className = 'snow-cone-stand__customer-pay';

      card.append(name, dots, patienceBar, pay);
      lineEl.append(card);
      customerRefs.push({ root: card, name, dots, patienceBarFill, pay });
    }

    const builder = document.createElement('div');
    builder.className = 'snow-cone-stand__builder';

    const builderTargetRow = document.createElement('div');
    builderTargetRow.className = 'snow-cone-stand__builder-row';
    const builderTargetLabel = document.createElement('span');
    builderTargetLabel.className = 'snow-cone-stand__builder-label';
    builderTargetLabel.textContent = 'ORDER';
    const builderTarget = document.createElement('div');
    builderTarget.className = 'snow-cone-stand__builder-scoops';
    builderTargetRow.append(builderTargetLabel, builderTarget);
    builderTargetEl = builderTarget;

    const builderYoursRow = document.createElement('div');
    builderYoursRow.className = 'snow-cone-stand__builder-row';
    const builderYoursLabel = document.createElement('span');
    builderYoursLabel.className = 'snow-cone-stand__builder-label';
    builderYoursLabel.textContent = 'YOURS';
    const builderYours = document.createElement('div');
    builderYours.className = 'snow-cone-stand__builder-scoops';
    const builderCount = document.createElement('span');
    builderCount.className = 'snow-cone-stand__builder-count';
    builderYoursRow.append(builderYoursLabel, builderYours, builderCount);
    builderYoursEl = builderYours;
    builderCountEl = builderCount;

    builder.append(builderTargetRow, builderYoursRow);

    const toast = document.createElement('div');
    toast.className = 'snow-cone-stand__toast';
    toast.hidden = true;
    lineEl.append(toast);
    toastEl = toast;

    const menu = document.createElement('div');
    menu.className = 'snow-cone-stand__menu';
    for (let i = 0; i < FLAVORS.length; i++) {
      const flavor = FLAVORS[i];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'snow-cone-stand__flavor-button';
      button.dataset.flavor = String(i);
      button.style.setProperty('--flavor-color', flavor.color);
      const label = document.createElement('span');
      label.className = 'snow-cone-stand__flavor-label';
      label.textContent = `${i + 1} · ${flavor.name}`;
      button.append(label);
      button.addEventListener('click', () => {
        engine.addFlavor(i as FlavorIndex);
        render();
      });
      menu.append(button);
    }

    const controls = document.createElement('div');
    controls.className = 'snow-cone-stand__controls';
    const undoButton = document.createElement('button');
    undoButton.type = 'button';
    undoButton.className = 'snow-cone-stand__undo-button';
    undoButton.textContent = 'BACKSPACE · UNDO';
    undoButton.addEventListener('click', () => {
      engine.undo();
      render();
    });
    const serveButton = document.createElement('button');
    serveButton.type = 'button';
    serveButton.className = 'snow-cone-stand__serve-button';
    serveButton.textContent = 'SPACE · SERVE';
    serveButton.addEventListener('click', doServe);
    controls.append(undoButton, serveButton);

    board.append(rushBanner, lineEl, builder, menu, controls);

    const side = document.createElement('div');
    side.className = 'snow-cone-stand__side';
    const sizeLabel = document.createElement('div');
    sizeLabel.className = 'snow-cone-stand__side-label';
    sizeLabel.textContent = 'CONE SIZE PAYS';
    const priceList = document.createElement('div');
    priceList.className = 'snow-cone-stand__price-list';
    const prices: Array<[size: number, tokens: number]> = [
      [1, 5],
      [2, 10],
      [3, 15],
      [4, 25],
    ];
    for (const [size, tokens] of prices) {
      const row = document.createElement('div');
      row.className = 'snow-cone-stand__price-row';
      const label = document.createElement('span');
      label.textContent = SIZE_LABEL[size];
      const value = document.createElement('span');
      value.textContent = `+${tokens}`;
      row.append(label, value);
      priceList.append(row);
    }
    side.append(sizeLabel, priceList);

    root.append(board, side);
    container.replaceChildren(root);
  }

  return {
    id: 'snow-cone-stand',
    title: 'SNOW CONE STAND',
    durationSec,
    howToPlay: [
      'Three customers, left to right. Serve the top one; cyan patience means they are about to leave.',
      'Keys 1-4 (or the menu buttons) add a scoop; BACKSPACE undoes the last one.',
      'SPACE serves the cone you built to the top customer. Match their order exactly -- a wrong flavour, wrong count, or an empty SPACE loses them, same as running out their patience.',
      'Rush hour at 1:00 remaining doubles Tokens and speeds up patience for 30 seconds.',
    ],
    statLabels: { served: 'SERVED', lost: 'LOST' },

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
