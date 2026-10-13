import type { Minigame, MinigameContext, MinigameDoneSummary } from '../minigame';
import {
  createPaoDeQueijoEngine,
  resultTitle,
  ROUNDS,
  TICK_MS,
  TOTAL_DURATION_SECONDS,
  type PaoDeQueijoCard,
  type PaoDeQueijoEngine,
  type TreatKey,
} from './pao-de-queijo-engine';
import './pao-de-queijo.css';

/** The design's own total play time (60 + 55 + 50s), the shell's round-clock
 *  backstop: the game always ends itself first, via `context.finish()`, the
 *  same way Beystadium's generous backstop works. */
export const PAO_DE_QUEIJO_DURATION_SEC = TOTAL_DURATION_SECONDS;

/** The design's own treat labels, verbatim (`LABELS`). */
const TREAT_LABELS: Record<TreatKey, string> = {
  pao: 'PÃO DE QUEIJO',
  briga: 'BRIGADEIRO',
  coxinha: 'COXINHA',
  guarana: 'GUARANÁ',
  cafe: 'CAFEZINHO',
  acai: 'AÇAÍ',
  pastel: 'PASTEL',
  beijinho: 'BEIJINHO',
  quindim: 'QUINDIM',
  tapioca: 'TAPIOCA',
};

interface IconShape {
  readonly d: string;
  readonly fill: string;
  readonly stroke: string;
  readonly width: number;
}

/** The design's own `circ(x, y, r)`: a full circle as two arcs. */
function circle(x: number, y: number, r: number): string {
  return `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

/** The design's own `sh(d, f, s, w)`: fill defaults to none, stroke to
 *  `#161719`, width to 3. */
function shape(d: string, fill = 'none', stroke = '#161719', width = 3): IconShape {
  return { d, fill, stroke, width };
}

/** The design's own `icons()`, verbatim: each of the 10 treats' vector art. */
const TREAT_ICONS: Record<TreatKey, readonly IconShape[]> = {
  pao: [
    shape(circle(50, 54, 30), '#E8B04A'),
    shape(circle(40, 44, 8), '#F6D58B', 'none', 0),
    shape('M30 56 Q50 46 70 58', 'none', '#B8802A', 3),
    shape('M44 70 Q54 64 62 72', 'none', '#B8802A', 3),
  ],
  briga: [
    shape('M26 62 L74 62 L68 86 L32 86 Z', '#C9A77A'),
    shape('M38 62 L36 86 M50 62 V86 M62 62 L64 86', 'none', '#8a6a3a', 2),
    shape(circle(50, 50, 22), '#4a2b1c'),
    shape('M38 42 l4 2', 'none', '#FF3DA5', 3),
    shape('M54 38 l4 3', 'none', '#FFD23F', 3),
    shape('M44 56 l5 -1', 'none', '#00BDFF', 3),
    shape('M60 52 l3 4', 'none', '#3DDC84', 3),
    shape('M34 52 l3 3', 'none', '#F4F4F4', 3),
  ],
  coxinha: [
    shape('M50 14 C70 30 82 58 66 84 C60 90 40 90 34 84 C18 58 30 30 50 14 Z', '#D98A3A'),
    shape('M40 34 C34 48 34 62 40 74', 'none', '#F0B866', 4),
    shape(circle(50, 14, 4), '#D98A3A'),
  ],
  guarana: [
    shape('M30 22 H70 V84 H30 Z', '#3DDC84'),
    shape('M30 44 H70 V64 H30 Z', '#E4572E'),
    shape('M30 22 Q50 14 70 22 Q50 30 30 22 Z', '#B3B6C9'),
    shape(circle(50, 54, 6), '#F4F4F4'),
  ],
  cafe: [
    shape('M20 78 Q50 92 80 78 Q50 84 20 78 Z', '#F4F4F4'),
    shape('M30 48 H70 V62 Q70 80 50 80 Q30 80 30 62 Z', '#F4F4F4'),
    shape('M70 54 Q84 54 80 66 Q76 70 68 68'),
    shape('M30 48 Q50 56 70 48 Q50 40 30 48 Z', '#6b3f22'),
    shape('M42 36 q-6 -8 0 -14 M56 36 q-6 -8 0 -14', 'none', '#B3B6C9', 3),
  ],
  acai: [
    shape('M16 52 H84 Q84 86 50 88 Q16 86 16 52 Z', '#F4F4F4'),
    shape('M18 52 Q50 34 82 52 Z', '#5a1e7a'),
    shape(circle(38, 44, 6), '#FFD23F'),
    shape(circle(54, 42, 6), '#FFD23F'),
    shape(circle(68, 48, 5), '#E4572E'),
    shape('M30 50 l3 2 M46 50 l3 2 M60 52 l3 -2', 'none', '#C9A77A', 3),
  ],
  pastel: [
    shape('M14 68 A36 36 0 0 1 86 68 Z', '#E2A33E'),
    shape(
      'M22 68 l3 -7 M32 68 l3 -7 M42 68 l3 -7 M52 68 l3 -7 M62 68 l3 -7 M72 68 l3 -7',
      'none',
      '#9a6a1c',
      3,
    ),
    shape(circle(38, 50, 3), '#F6D58B', 'none', 0),
    shape(circle(56, 44, 4), '#F6D58B', 'none', 0),
    shape(circle(66, 56, 3), '#F6D58B', 'none', 0),
  ],
  beijinho: [
    shape('M28 64 L72 64 L66 86 L34 86 Z', '#F4B6D2'),
    shape(circle(50, 50, 20), '#F4F4F4'),
    shape('M40 44 l2 2 M54 40 l2 2 M46 56 l2 -2 M58 54 l2 2 M36 54 l2 2', 'none', '#B3B6C9', 2),
    shape('M50 30 V22', 'none', '#3a2a1a', 3),
    shape(circle(50, 19, 3), '#3a2a1a'),
  ],
  quindim: [
    shape('M24 66 H76 L70 86 H30 Z', '#E4A32E'),
    shape('M26 66 Q50 18 74 66 Z', '#FFD23F'),
    shape('M38 54 Q44 40 52 36', 'none', '#F4F4F4', 3),
  ],
  tapioca: [
    shape('M14 62 A36 36 0 0 1 86 62 Z', '#F4E6C8'),
    shape('M14 62 H86 Q86 76 50 78 Q14 76 14 62 Z', '#F4E6C8'),
    shape(circle(38, 60, 5), '#FFD23F'),
    shape(circle(54, 58, 5), '#E4572E'),
    shape(circle(68, 61, 4), '#FFD23F'),
  ],
};

type ResultTier = 'cleared' | 'partial' | 'none';

/** Sander's result-screen lines, verbatim from the design's "A Confeiteira:"
 *  lines with his name in place of that title (owner decision, 2026-10-09). */
const RESULT_QUOTES: Record<ResultTier, string> = {
  cleared: 'Sander: "Que delícia! You cleaned out the whole case."',
  partial: 'Sander: "Quase! One more round and the badge is yours."',
  none: 'Sander: "Calma. Look for the pairs, one corner at a time."',
};

function resultTier(cleared: number): ResultTier {
  if (cleared >= ROUNDS.length) return 'cleared';
  if (cleared > 0) return 'partial';
  return 'none';
}

export interface PaoDeQueijoOptions {
  /** Test-only: a pre-built engine instead of a fresh `createPaoDeQueijoEngine()`. */
  engine?: PaoDeQueijoEngine;
}

/** Test-only hooks `dev-minigame-hook.ts` drives from `window.__minigameTest`
 *  (`?minigame=pao-de-queijo`), the same shape as the other games'. Not part
 *  of the `Minigame` interface. */
export interface PaoDeQueijoTestHooks {
  /** Matches every remaining pair in the current round at once (the
   *  engine's own `debugMatchAllPairs`): e2e calls this once per round to
   *  clear the whole game without playing out 24 real flips. A no-op once
   *  the game is done. */
  debugMatchAllPairs(): void;
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

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildIconSvg(key: TreatKey): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'pao-de-queijo__card-icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const s of TREAT_ICONS[key]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', s.d);
    path.setAttribute('fill', s.fill);
    path.setAttribute('stroke', s.stroke);
    path.setAttribute('stroke-width', String(s.width));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return svg;
}

/**
 * Pão de Queijo Memory: a solo, three-round memory match, mirroring the
 * other Minigames' shape -- the pure `pao-de-queijo-engine.ts` under a thin
 * DOM layer ported from `design/Minigame Pao de Queijo Memory.dc.html`'s
 * play screen into the shell's play area (`createMinigameShell`'s
 * `playAreaEl`). The shell owns the how-to-play screen (with this game's
 * `howToSubtitle`), the round clock (a generous backstop; the game ends
 * itself via `context.finish()` once the third round clears or any round's
 * own timer runs out), PAUSE/P, QUIT and `recordRound`; its done screen
 * shows this game's own result title and Sander's line via `doneSummary()`.
 *
 * Not ported: the design's trigger screen (the "A Confeiteira" card, LET'S
 * EAT / JUST WATCHING) belongs to Sander Nonaka's own NPC dialog
 * (`npcs.ts`'s `PAO_DE_QUEIJO_DIALOG`), opened by clicking him at the
 * register in the LATAM Café -- the same split Hector's and Chrystian's
 * dialogs make.
 *
 * Producer: this game. Consumer: `createDefaultMinigameRegistry`
 * (`minigame-registry.ts`).
 */
export function createPaoDeQueijo(
  options: PaoDeQueijoOptions = {},
): Minigame<'pao-de-queijo'> & PaoDeQueijoTestHooks {
  const engine = options.engine ?? createPaoDeQueijoEngine();

  let context: MinigameContext<'pao-de-queijo'> | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let finished = false;

  const cardEls: HTMLButtonElement[] = [];
  const refs: Record<string, HTMLElement> = {};
  // The board is rebuilt whenever the round (and so the card count/grid)
  // changes; `-1` guarantees the very first `render()` after `buildDom`
  // rebuilds it, even though `buildBoard` already ran once for round 0.
  let renderedRound = -1;

  function report(): void {
    context?.setScore(engine.view.score);
    context?.setStats(engine.stats());
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

  function renderCard(card: PaoDeQueijoCard, index: number): void {
    const node = cardEls[index];
    if (!node) return;
    const flipped = card.faceUp || card.matched;
    node.classList.toggle('pao-de-queijo__card--flipped', flipped);
    node.classList.toggle('pao-de-queijo__card--matched', card.matched);
    node.disabled = card.matched;
    const label = node.querySelector('.pao-de-queijo__card-label');
    if (label) label.textContent = TREAT_LABELS[card.key];
  }

  function render(): void {
    const view = engine.view;

    if (view.round !== renderedRound) {
      renderedRound = view.round;
      buildBoard(refs.board);
    }
    view.cards.forEach(renderCard);

    const config = ROUNDS[view.round];
    refs.board.style.setProperty('--pao-de-queijo-cols', String(config.cols));
    refs.board.style.setProperty('--pao-de-queijo-rows', String(config.rows));

    refs.round.textContent = `${view.round + 1} / ${ROUNDS.length}`;
    refs.subline.textContent = view.preview ? 'MEMORIZE THE TREATS' : 'FIND THE PAIRS';
    const pct = Math.max(0, (view.secondsLeft / config.timerSeconds) * 100);
    refs.timeFill.style.width = `${pct}%`;
    refs.timeFill.classList.toggle('pao-de-queijo__timebar-fill--low', pct < 25);
    refs.streakValue.textContent = String(view.streak);
    const multiplier = view.streak >= 6 ? 3 : view.streak >= 3 ? 2 : 1;
    refs.multValue.textContent = `x${multiplier}`;

    if (view.toast) {
      refs.toast.hidden = false;
      refs.toast.textContent = view.toast;
    } else {
      refs.toast.hidden = true;
    }
  }

  function buildBoard(container: HTMLElement): void {
    container.replaceChildren();
    cardEls.length = 0;
    engine.view.cards.forEach((card, index) => {
      const button = el('button', 'pao-de-queijo__card');
      button.type = 'button';
      const inner = el('div', 'pao-de-queijo__card-inner');
      const back = el('div', 'pao-de-queijo__card-face pao-de-queijo__card-face--back');
      back.append(el('span', 'pao-de-queijo__card-mark', 'JG'));
      const front = el('div', 'pao-de-queijo__card-face pao-de-queijo__card-face--front');
      front.append(buildIconSvg(card.key), el('div', 'pao-de-queijo__card-label'));
      inner.append(back, front);
      button.append(inner);
      button.addEventListener('click', () => {
        engine.flip(index);
        render();
        report();
      });
      container.append(button);
      cardEls.push(button);
    });
  }

  function buildDom(container: HTMLElement): void {
    const root = el('div', 'pao-de-queijo');

    const status = el('div', 'pao-de-queijo__status');
    const subline = el('div', 'pao-de-queijo__subline');
    const roundWrap = el('div', 'pao-de-queijo__round-wrap');
    const roundLabel = el('div', 'pao-de-queijo__round-label-text', 'ROUND');
    const round = el('span', 'pao-de-queijo__round-label');
    const timebar = el('div', 'pao-de-queijo__timebar');
    const timeFill = el('div', 'pao-de-queijo__timebar-fill');
    timebar.append(timeFill);
    roundWrap.append(roundLabel, round, timebar);
    status.append(subline, roundWrap);

    const hud = el('div', 'pao-de-queijo__hud');
    const streak = el('div', 'pao-de-queijo__stat');
    streak.append(el('span', 'pao-de-queijo__hud-label', 'STREAK'));
    const streakValue = el('span', 'pao-de-queijo__stat-value', '0');
    streak.append(streakValue);
    const mult = el('div', 'pao-de-queijo__stat');
    mult.append(el('span', 'pao-de-queijo__hud-label', 'MULTIPLIER'));
    const multValue = el('span', 'pao-de-queijo__stat-value pao-de-queijo__stat-value--mult', 'x1');
    mult.append(multValue);
    hud.append(streak, mult);

    const board = el('div', 'pao-de-queijo__board');
    const toast = el('div', 'pao-de-queijo__toast');
    toast.hidden = true;

    root.append(status, hud, board, toast);
    Object.assign(refs, { subline, round, timeFill, streakValue, multValue, board, toast });

    container.replaceChildren(root);
  }

  function doneSummary(): MinigameDoneSummary {
    const view = engine.view;
    const tier = resultTier(view.cleared);
    return {
      kicker: view.ended === 'cleared' ? 'TODAS AS RODADAS' : 'TIME RAN OUT',
      title: resultTitle(view.cleared),
      rows: [
        { key: 'cleared', label: 'ROUNDS', value: `${view.cleared} / ${ROUNDS.length}` },
        { key: 'bestStreak', label: 'BEST STREAK', value: String(view.bestStreak) },
      ],
      quote: RESULT_QUOTES[tier],
    };
  }

  return {
    id: 'pao-de-queijo',
    title: 'PÃO DE QUEIJO MEMORY',
    durationSec: PAO_DE_QUEIJO_DURATION_SEC,
    howToSubtitle: 'PÃO DE QUEIJO MEMORY · 3 ROUNDS · SOLO',
    howToPlay: [
      'Every round starts with all the treats face up for a couple of seconds. Remember where each one is before they flip back.',
      'Click two cards to flip them. A match scores 100 points and stays face up. A miss flips both back and resets your streak. 3 matches in a row doubles points, 6 triples them.',
      'Each round has a timer. It gets shorter and the board gets bigger. Finish with time to spare for bonus points. Clear all three rounds for the badge.',
    ],
    statLabels: { roundsCleared: 'ROUNDS', matches: 'MATCHES' },

    start(container, ctx) {
      context = ctx;
      buildDom(container);
      report();
      render();
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
      return { score: engine.view.score, stats: engine.stats() };
    },

    doneSummary,

    debugMatchAllPairs() {
      engine.debugMatchAllPairs();
      render();
      report();
      finishIfEnded();
    },
  };
}
