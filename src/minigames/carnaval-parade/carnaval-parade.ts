import type { Minigame, MinigameContext, MinigameDoneSummary } from '../minigame';
import {
  createCarnavalParadeEngine,
  LANE_Y,
  TICK_MS,
  type CarnavalParadeEngine,
  type CarnavalParadeItem,
  type Lane,
} from './carnaval-parade-engine';
import './carnaval-parade.css';

/** The design's own `DUR = 45000`. */
export const CARNAVAL_PARADE_DURATION_SEC = 45;

/** The horizontal span an item travels, from where it spawns down to where
 *  it's gone (design: `x:1700` down to `i.x<-60`), for the DOM layer's own
 *  left% mapping. Not exported by the engine (cosmetic, not game logic). */
const TRACK_SPAN_MAX_X = 1700;
const TRACK_SPAN_MIN_X = -60;
const TRACK_TOP_Y = LANE_Y[0];
const TRACK_BOTTOM_Y = LANE_Y[2];
const TRACK_HEIGHT = TRACK_BOTTOM_Y - TRACK_TOP_Y;

export interface CarnavalParadeOptions {
  /** Test-only: a pre-built engine instead of a fresh `createCarnavalParadeEngine()`. */
  engine?: CarnavalParadeEngine;
}

/** Test-only hooks `dev-minigame-hook.ts` drives from `window.__minigameTest`
 *  (`?minigame=carnaval-parade`), the same shape as the other games'. Not
 *  part of the `Minigame` interface. */
export interface CarnavalParadeTestHooks {
  /** Ends the round now, as if the shell's timer reached 0. */
  debugFinishNow(): void;
}

type ResultTier = 'passista' | 'foliao' | 'aprendiz';

/** The design's own result titles (score >= 400 / >= 200 / else). */
const RESULT_TITLES: Record<ResultTier, string> = {
  passista: 'PASSISTA',
  foliao: 'FOLIÃO',
  aprendiz: 'APRENDIZ',
};

/** Hector's result-screen lines, verbatim from the design's "Mestre de
 *  Bateria:" lines with his name in place of that title (owner decision). */
const RESULT_QUOTES: Record<ResultTier, string> = {
  passista: 'Hector: "Que desfile! The whole avenue is on its feet."',
  foliao: 'Hector: "Boa. You kept the rhythm. Go again for 400."',
  aprendiz: 'Hector: "Devagar. Watch the barriers and try again."',
};

function resultTier(score: number): ResultTier {
  if (score >= 400) return 'passista';
  if (score >= 200) return 'foliao';
  return 'aprendiz';
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

function leftPercent(x: number): number {
  return ((x - TRACK_SPAN_MIN_X) / (TRACK_SPAN_MAX_X - TRACK_SPAN_MIN_X)) * 100;
}

function topPercentForY(y: number): number {
  return ((y - TRACK_TOP_Y) / TRACK_HEIGHT) * 100;
}

function topPercentForLane(lane: Lane): number {
  return topPercentForY(LANE_Y[lane]);
}

/**
 * Carnaval Parade: a solo, 45 s, three-lane parade runner, mirroring the
 * other Minigames' shape -- the pure `carnaval-parade-engine.ts` under a thin
 * DOM layer ported from `design/Minigame Carnaval Parade.dc.html`'s play
 * screen into the shell's play area (`createMinigameShell`'s `playAreaEl`).
 * The shell owns the how-to-play screen (with this game's `howToSubtitle`),
 * the round clock, PAUSE/P, QUIT and `recordRound`; its done screen shows
 * this game's own result title and Hector's line via `doneSummary()`.
 *
 * Not ported: the design's trigger screen (the "MESTRE DE BATERIA" card,
 * JOIN THE PARADE / JUST WATCHING) belongs to Hector's own NPC dialog
 * (`npcs.ts`'s `CARNAVAL_PARADE_DIALOG`), opened either by clicking him or by
 * the LATAM Disco Hall's `disco-turntable` Room hotspot -- the same split
 * Beystadium's Michael dialog makes.
 *
 * Producer: this game. Consumer: `createDefaultMinigameRegistry`
 * (`minigame-registry.ts`).
 */
export function createCarnavalParade(
  options: CarnavalParadeOptions = {},
): Minigame<'carnaval-parade'> & CarnavalParadeTestHooks {
  const engine = options.engine ?? createCarnavalParadeEngine();

  let context: MinigameContext<'carnaval-parade'> | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let keydownHandler: ((event: KeyboardEvent) => void) | undefined;
  let finished = false;

  const itemEls = new Map<number, HTMLElement>();
  const refs: Record<string, HTMLElement> = {};

  function report(): void {
    const stats = engine.stats();
    context?.setScore(engine.view.score);
    context?.setStats(stats);
  }

  function stopTicking(): void {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  }

  function finishIfEnded(): void {
    if (engine.view.phase === 'done' && !finished) {
      finished = true;
      stopTicking();
      context?.finish();
    }
  }

  function startTicking(): void {
    stopTicking();
    intervalId = setInterval(() => {
      engine.tick();
      render();
      report();
      finishIfEnded();
    }, TICK_MS);
  }

  function renderItems(items: readonly CarnavalParadeItem[]): void {
    const seen = new Set<number>();
    for (const item of items) {
      seen.add(item.id);
      let node = itemEls.get(item.id);
      if (!node) {
        node = el('div', `carnaval-parade__item carnaval-parade__item--${item.kind}`);
        itemEls.set(item.id, node);
        refs.items.append(node);
      }
      node.style.left = `${leftPercent(item.x)}%`;
      node.style.top = `${topPercentForLane(item.lane)}%`;
    }
    for (const [id, node] of itemEls) {
      if (!seen.has(id)) {
        node.remove();
        itemEls.delete(id);
      }
    }
  }

  function render(): void {
    const view = engine.view;

    renderItems(view.items);

    refs.player.style.top = `${topPercentForY(view.playerY)}%`;

    for (let n = 0; n < 3; n++) {
      refs[`life${n}`]?.classList.toggle('carnaval-parade__life--lit', n < view.lives);
    }
    refs.streakValue.textContent = String(view.streak);
    refs.multValue.textContent = `x${view.multiplier}`;

    if (view.toast) {
      refs.toast.hidden = false;
      refs.toast.textContent = view.toast.text;
      refs.toast.classList.toggle('carnaval-parade__toast--hit', view.toast.kind === 'hit');
      refs.toast.classList.toggle('carnaval-parade__toast--pickup', view.toast.kind === 'pickup');
      refs.toast.style.top = `${topPercentForLane(view.lane)}%`;
    } else {
      refs.toast.hidden = true;
    }
  }

  function moveAndRender(delta: -1 | 1): void {
    engine.moveLane(delta);
    render();
  }

  function handleKeydown(event: KeyboardEvent): void {
    const key = event.key;
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      event.preventDefault();
      if (!event.repeat) moveAndRender(-1);
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      event.preventDefault();
      if (!event.repeat) moveAndRender(1);
    }
  }

  function buildDom(container: HTMLElement): void {
    const root = el('div', 'carnaval-parade');

    const track = el('div', 'carnaval-parade__track');
    track.append(
      el('div', 'carnaval-parade__lane carnaval-parade__lane--0'),
      el('div', 'carnaval-parade__lane carnaval-parade__lane--1'),
      el('div', 'carnaval-parade__lane carnaval-parade__lane--2'),
      el('div', 'carnaval-parade__road'),
    );
    const items = el('div', 'carnaval-parade__items');
    const player = el('div', 'carnaval-parade__player');
    const toast = el('div', 'carnaval-parade__toast');
    toast.hidden = true;
    track.append(items, player, toast);
    Object.assign(refs, { items, player, toast });

    const hud = el('div', 'carnaval-parade__hud');
    const lives = el('div', 'carnaval-parade__lives');
    for (let n = 0; n < 3; n++) {
      const life = el('span', 'carnaval-parade__life carnaval-parade__life--lit');
      lives.append(life);
      refs[`life${n}`] = life;
    }
    const streak = el('div', 'carnaval-parade__streak');
    streak.append(el('span', 'carnaval-parade__hud-label', 'STREAK'));
    const streakValue = el('span', 'carnaval-parade__streak-value', '0');
    streak.append(streakValue);
    const mult = el('div', 'carnaval-parade__mult');
    mult.append(el('span', 'carnaval-parade__hud-label', 'MULTIPLIER'));
    const multValue = el('span', 'carnaval-parade__mult-value', 'x1');
    mult.append(multValue);
    hud.append(lives, streak, mult);
    Object.assign(refs, { streakValue, multValue });

    const laneButtons = el('div', 'carnaval-parade__lane-buttons');
    const laneUp = el(
      'button',
      'carnaval-parade__lane-button carnaval-parade__lane-button--up',
      '↑',
    );
    laneUp.type = 'button';
    laneUp.setAttribute('aria-label', 'Move up a lane');
    laneUp.addEventListener('click', () => moveAndRender(-1));
    const laneDown = el(
      'button',
      'carnaval-parade__lane-button carnaval-parade__lane-button--down',
      '↓',
    );
    laneDown.type = 'button';
    laneDown.setAttribute('aria-label', 'Move down a lane');
    laneDown.addEventListener('click', () => moveAndRender(1));
    laneButtons.append(laneUp, laneDown);

    root.append(track, hud, laneButtons);
    container.replaceChildren(root);
  }

  function doneSummary(): MinigameDoneSummary {
    const stats = engine.stats();
    const tier = resultTier(engine.view.score);
    return {
      kicker: engine.view.ended === 'lives' ? 'OUT OF LIVES' : 'FIM DO DESFILE',
      title: RESULT_TITLES[tier],
      rows: [{ key: 'bestStreak', label: 'BEST STREAK', value: String(stats.bestStreak) }],
      quote: RESULT_QUOTES[tier],
    };
  }

  return {
    id: 'carnaval-parade',
    title: 'CARNAVAL PARADE',
    durationSec: CARNAVAL_PARADE_DURATION_SEC,
    howToSubtitle: 'CARNAVAL PARADE · 45 SECONDS · SOLO',
    howToPlay: [
      'Press Up and Down (or W and S) to move between the three lanes of the parade avenue. The buttons at the bottom left work too.',
      'Pick up feathers for 10 points each. Every 5 in a row raises your multiplier up to x4. Gold stars are worth 25. Missing a feather breaks the streak.',
      'You have 3 lives. A barrier costs one life and resets your streak. The parade speeds up all the way to the finish.',
    ],
    statLabels: { feathers: 'FEATHERS', stars: 'STARS', barriersHit: 'BARRIERS' },

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
      return { score: engine.view.score, stats: engine.stats() };
    },

    doneSummary,

    debugFinishNow() {
      context?.finish();
    },
  };
}
