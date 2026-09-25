import type { Minigame, MinigameContext, MinigameDoneSummary } from '../minigame';
import {
  BEYS,
  createBeystadiumEngine,
  MICHAEL_BEY,
  PERFECT_ZONE_MAX,
  PERFECT_ZONE_MIN,
  TICK_MS,
  type Bey,
  type BeyIndex,
  type BeystadiumEngine,
} from './beystadium-engine';
import './beystadium.css';

/**
 * The shell's round clock for one match. Beystadium isn't a timed game (the
 * design has no match timer, only each battle round's elapsed TIME), but
 * the shell always counts down; 3 minutes comfortably covers a full best of
 * 3 (each battle round is over in well under 30 s once launched). If it does
 * run out, the match ends as it stands, which pays as a loss unless the
 * Player already took 2 battle rounds.
 */
export const BEYSTADIUM_MATCH_SECONDS = 180;

/** Michael's Bey colours, from the design's stadium SVG. */
const MICHAEL_C1 = '#F4F4F4';
const MICHAEL_C2 = '#D63C3C';

export interface BeystadiumOptions {
  /** Test-only: a pre-built engine instead of a fresh `createBeystadiumEngine()`. */
  engine?: BeystadiumEngine;
}

/** Test-only hooks `dev-minigame-hook.ts` drives from `window.__minigameTest`
 *  (`?minigame=beystadium`), the same shape as the other games'. Not part of
 *  the `Minigame` interface. */
export interface BeystadiumTestHooks {
  /** Ends the match now, as it stands, as if the shell's timer reached 0. */
  debugFinishNow(): void;
}

/** One Bey top, the design's 100x100 SVG (spiked ring, disc, blade, hub). */
function beySvg(c1: string, c2: string): string {
  return (
    '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    `<polygon points="50,4 78,12 96,38 90,68 66,92 34,92 10,68 4,38 22,12" fill="${c1}" stroke="#0C4B5F" stroke-width="3"></polygon>` +
    `<circle cx="50" cy="50" r="30" fill="${c2}" stroke="#0C4B5F" stroke-width="3"></circle>` +
    `<path d="M50 20 L58 44 L82 50 L58 56 L50 80 L42 56 L18 50 L42 44 Z" fill="${c1}" stroke="#0C4B5F" stroke-width="2"></path>` +
    '<circle cx="50" cy="50" r="8" fill="#161719"></circle>' +
    '</svg>'
  );
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

function top(c1: string, c2: string, className: string): HTMLElement {
  const node = el('div', className);
  // Static markup from this module's own constants (the design's Bey SVG
  // and `BEYS` colours), never Player input.
  node.innerHTML = beySvg(c1, c2);
  return node;
}

/** A labelled 0-10 stat bar on a pick card (design: `atk * 10 + '%'`). */
function statBar(key: 'atk' | 'sta', label: string, value: number): HTMLElement {
  const wrap = el('div', 'beystadium__stat');
  const row = el('div', 'beystadium__stat-row');
  const name = el('span', '', label);
  const num = el('span', 'beystadium__stat-value', String(value));
  num.dataset.stat = key;
  row.append(name, num);
  const bar = el('div', 'beystadium__stat-bar');
  const fill = el('div', `beystadium__stat-fill beystadium__stat-fill--${key}`);
  fill.style.width = `${value * 10}%`;
  bar.append(fill);
  wrap.append(row, bar);
  return wrap;
}

/** A top's spin-animation period: faster the more spin it has (design `mySpinDur`). */
function spinDuration(spin: number): string {
  return `${(0.25 + ((100 - Math.max(0, spin)) / 100) * 1.2).toFixed(2)}s`;
}

/** A top's size in Stage pixels (design `mySize`). */
function topSize(spin: number): string {
  return `${Math.round(60 + Math.max(0, spin) * 0.25)}px`;
}

/**
 * Beystadium: a best-of-3 Beyblade match against Michael, mirroring the
 * other Minigames' shape: the pure `beystadium-engine.ts` under a thin DOM
 * layer ported from `design/Minigame Beystadium.dc.html`'s pick and battle
 * screens into the shell's play area (`createMinigameShell`'s
 * `playAreaEl`). The shell still owns the how-to-play screen (with this
 * game's `howToSubtitle`), the round clock, PAUSE/P, QUIT and
 * `recordRound`; its done screen shows this game's MATCH OVER headings via
 * `doneSummary()`.
 *
 * Not ported: the design's trigger screen (Michael's challenge, LET IT RIP /
 * BACK AWAY SLOWLY) belongs to his NPC dialog, and Team Room 4 and Michael
 * aren't in the game yet -- #51 wires Michael's LET IT RIP button to
 * `minigameLauncher.launch('beystadium')`. Until then the Minigame test
 * launcher (`?minigame=beystadium`) is the way in. Also not ported, like
 * the other games: the background room art and Michael's portrait.
 *
 * Producer: this game. Consumer: `createDefaultMinigameRegistry`
 * (`minigame-registry.ts`).
 */
export function createBeystadium(
  options: BeystadiumOptions = {},
): Minigame<'beystadium'> & BeystadiumTestHooks {
  const engine = options.engine ?? createBeystadiumEngine();

  let context: MinigameContext<'beystadium'> | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let keydownHandler: ((event: KeyboardEvent) => void) | undefined;
  let paused = false;
  let finished = false;

  // DOM refs, set by `buildDom`.
  let pickEl: HTMLElement | undefined;
  let battleEl: HTMLElement | undefined;
  const pickCards: HTMLButtonElement[] = [];
  const refs: Record<string, HTMLElement> = {};

  function report(): void {
    const stats = engine.stats();
    context?.setScore(stats.strikes);
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
      const before = engine.view.roundsWon + engine.view.roundsLost;
      engine.tick();
      if (engine.view.roundsWon + engine.view.roundsLost !== before) report();
      render();
      if (engine.view.phase === 'match-over' && !finished) {
        finished = true;
        stopTicking();
        context?.finish();
      }
    }, TICK_MS);
  }

  function render(): void {
    const view = engine.view;
    pickCards.forEach((card, i) => {
      const selected = i === view.bey;
      card.setAttribute('aria-pressed', String(selected));
      card.classList.toggle('beystadium__bey--selected', selected);
    });
    if (!battleEl || !pickEl) return;
    const inBattle = view.phase !== 'pick';
    pickEl.hidden = inBattle;
    battleEl.hidden = !inBattle;
    if (!inBattle) return;

    const bey: Bey = BEYS[view.bey];
    refs.subline.textContent = paused
      ? 'PAUSED · PRESS P'
      : view.phase === 'launch'
        ? 'RIP THE LAUNCHER · SPACE IN THE CYAN ZONE'
        : 'BEST OF 3 · FIRST BEY TO ZERO SPIN LOSES';
    refs.round.textContent = `${view.round} / 3`;
    refs.time.textContent = `${view.timeSec.toFixed(1)}s`;

    refs.myName.textContent = `YOU · ${bey.name}`;
    refs.mySpin.textContent = Math.max(0, view.mySpin).toFixed(0);
    refs.mySpinFill.style.width = `${Math.max(0, view.mySpin)}%`;
    refs.mkSpin.textContent = Math.max(0, view.mkSpin).toFixed(0);
    refs.mkSpinFill.style.width = `${Math.max(0, view.mkSpin)}%`;
    refs.hint.textContent = view.hint;
    refs.mikeLine.textContent = view.mike;

    refs.launch.hidden = view.phase !== 'launch';
    refs.meterNeedle.style.left = `${Math.round(view.meter * 10) / 10}%`;

    const fighting = view.phase === 'fight' || view.phase === 'round-end';
    refs.fight.hidden = !fighting;
    if (fighting) {
      // Both tops orbit the centre, converging on a clash (design `renderVals`).
      const angle = view.timeSec * 1.7;
      const radius = view.clash && view.clash !== 'DODGE READY' ? 40 : 110;
      const dx = (Math.cos(angle) * radius) / 4.2;
      const dy = (Math.sin(angle) * radius) / 4.2;
      placeTop(refs.myTop, 50 + dx, 50 + dy, view.mySpin);
      placeTop(refs.mkTop, 50 - dx, 50 - dy, view.mkSpin);

      const ring = view.ring;
      const ringColor = view.inStrikeZone ? '#00BDFF' : ring < 1.5 ? '#0C4B5F' : '#F4F4F4';
      const ringScale = ring < 1.5 ? 0.6 + (ring / 1.5) * 0.6 : 1.2 - ((ring - 1.5) / 0.7) * 0.4;
      refs.ring.style.borderColor = ringColor;
      refs.ring.style.transform = `scale(${ringScale.toFixed(2)})`;
      refs.ringLabel.style.color = ringColor;
      refs.ringLabel.textContent = view.inStrikeZone
        ? 'STRIKE!'
        : view.dodging
          ? 'DODGING'
          : 'WAIT…';
    }
    refs.clash.hidden = !(fighting && view.clash);
    refs.clash.textContent = view.clash ?? '';
    refs.banner.hidden = view.banner === null;
    refs.banner.textContent = view.banner ?? '';
  }

  function placeTop(node: HTMLElement, xPct: number, yPct: number, spin: number): void {
    node.style.left = `${xPct}%`;
    node.style.top = `${yPct}%`;
    node.style.width = topSize(spin);
    node.style.height = topSize(spin);
    node.style.animationDuration = spinDuration(spin);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === ' ') {
      // Always swallowed during the match so SPACE never scrolls or clicks
      // a focused button underneath.
      event.preventDefault();
      if (event.repeat || paused || finished) return;
      if (engine.action() !== 'none') {
        report();
        render();
      }
    } else if (event.key === 'x' || event.key === 'X') {
      event.preventDefault();
      if (paused || finished) return;
      if (engine.dodge()) render();
    }
  }

  function buildPick(): HTMLElement {
    const pick = el('div', 'beystadium__pick');
    const title = el('div', 'beystadium__pick-title', 'CHOOSE YOUR BEY');
    const grid = el('div', 'beystadium__beys');
    pickCards.length = 0;
    BEYS.forEach((bey, i) => {
      const card = el('button', 'beystadium__bey');
      card.type = 'button';
      card.dataset.bey = String(i);
      card.append(
        top(bey.c1, bey.c2, 'beystadium__bey-top'),
        el('div', 'beystadium__bey-name', bey.name),
        statBar('atk', 'ATTACK', bey.atk),
        statBar('sta', 'STAMINA', bey.sta),
        el('div', 'beystadium__bey-blurb', bey.blurb),
      );
      card.addEventListener('click', () => {
        engine.pick(i as BeyIndex);
        render();
      });
      grid.append(card);
      pickCards.push(card);
    });

    const footer = el('div', 'beystadium__pick-footer');
    const note = el('div', 'beystadium__pick-note');
    note.append(
      'Michael runs ',
      el('span', 'beystadium__accent', 'Blizzard Fang'),
      `: attack ${MICHAEL_BEY.atk}, stamina ${MICHAEL_BEY.sta}. He is not humble about it.`,
    );
    const go = el('button', 'beystadium__to-stadium', 'TO THE STADIUM');
    go.type = 'button';
    go.addEventListener('click', () => {
      // Dropping focus keeps a later SPACE from re-clicking this button.
      go.blur();
      engine.toStadium();
      render();
      if (!paused) startTicking();
    });
    footer.append(note, go);
    pick.append(title, grid, footer);
    return pick;
  }

  function spinPanel(side: 'my' | 'mk'): HTMLElement {
    const panel = el('div', `beystadium__panel beystadium__panel--${side}`);
    const name = el(
      'div',
      `beystadium__${side}-name`,
      side === 'mk' ? `MICHAEL · ${MICHAEL_BEY.name}` : '',
    );
    const portrait =
      side === 'mk'
        ? top(MICHAEL_C1, MICHAEL_C2, 'beystadium__panel-top')
        : el('div', 'beystadium__panel-top');
    const spinRow = el('div', 'beystadium__spin-row');
    const spinValue = el('span', `beystadium__${side}-spin`, '0');
    spinRow.append(el('span', '', 'SPIN'), spinValue);
    const bar = el('div', 'beystadium__spin-bar');
    const fill = el('div', `beystadium__spin-fill beystadium__spin-fill--${side}`);
    bar.append(fill);
    panel.append(name, portrait, spinRow, bar);
    refs[`${side}Name`] = name;
    refs[`${side}Spin`] = spinValue;
    refs[`${side}SpinFill`] = fill;
    refs[`${side}Portrait`] = portrait;
    if (side === 'my') {
      const hint = el('div', 'beystadium__hint');
      panel.append(hint);
      refs.hint = hint;
    } else {
      const mike = el('div', 'beystadium__mike-line');
      panel.append(mike);
      refs.mikeLine = mike;
    }
    return panel;
  }

  function buildBattle(): HTMLElement {
    const battle = el('div', 'beystadium__battle');
    battle.hidden = true;

    const status = el('div', 'beystadium__status');
    const subline = el('div', 'beystadium__subline');
    const counters = el('div', 'beystadium__counters');
    const roundCounter = el('div', 'beystadium__counter');
    const round = el('div', 'beystadium__round');
    roundCounter.append(el('div', 'beystadium__counter-label', 'ROUND'), round);
    const timeCounter = el('div', 'beystadium__counter');
    const time = el('div', 'beystadium__time');
    timeCounter.append(el('div', 'beystadium__counter-label', 'ROUND TIME'), time);
    counters.append(roundCounter, timeCounter);
    status.append(subline, counters);
    Object.assign(refs, { subline, round, time });

    const arena = el('div', 'beystadium__arena');
    const stadium = el('div', 'beystadium__stadium');
    stadium.append(el('div', 'beystadium__bowl'), el('div', 'beystadium__bowl-ring'));

    const launch = el('div', 'beystadium__launch');
    const meter = el('div', 'beystadium__meter');
    const zone = el('div', 'beystadium__meter-zone');
    zone.style.left = `${PERFECT_ZONE_MIN}%`;
    zone.style.width = `${PERFECT_ZONE_MAX - PERFECT_ZONE_MIN}%`;
    const needle = el('div', 'beystadium__meter-needle');
    meter.append(zone, needle);
    launch.append(
      el('div', 'beystadium__launch-title', 'RIP THE LAUNCHER'),
      meter,
      el('div', 'beystadium__launch-hint', 'PRESS SPACE IN THE CYAN ZONE'),
    );

    const fight = el('div', 'beystadium__fight');
    fight.hidden = true;
    const myTop = top(BEYS[0].c1, BEYS[0].c2, 'beystadium__top');
    const mkTop = top(MICHAEL_C1, MICHAEL_C2, 'beystadium__top');
    const ringWrap = el('div', 'beystadium__ring-wrap');
    const ring = el('div', 'beystadium__ring');
    const ringLabel = el('div', 'beystadium__ring-label');
    ringWrap.append(ring, ringLabel);
    fight.append(myTop, mkTop, ringWrap);

    const clash = el('div', 'beystadium__clash');
    clash.hidden = true;
    const banner = el('div', 'beystadium__banner');
    banner.hidden = true;
    stadium.append(launch, fight, clash, banner);
    Object.assign(refs, {
      launch,
      meterNeedle: needle,
      fight,
      myTop,
      mkTop,
      ring,
      ringLabel,
      clash,
      banner,
    });

    arena.append(spinPanel('my'), stadium, spinPanel('mk'));

    const keys = el('div', 'beystadium__keys');
    keys.append(
      el('span', 'beystadium__key beystadium__key--primary', 'SPACE · STRIKE'),
      el('span', 'beystadium__key', 'X · DODGE'),
      el('span', 'beystadium__key', 'P · PAUSE'),
    );

    battle.append(status, arena, keys);
    return battle;
  }

  function buildDom(container: HTMLElement): void {
    const root = el('div', 'beystadium');
    pickEl = buildPick();
    battleEl = buildBattle();
    root.append(pickEl, battleEl);
    container.replaceChildren(root);
  }

  /** Picks the picked Bey's colours for the fight's and panel's tops. */
  function paintPlayerTops(): void {
    const bey = BEYS[engine.view.bey];
    const markup = beySvg(bey.c1, bey.c2);
    if (refs.myTop) refs.myTop.innerHTML = markup;
    if (refs.myPortrait) refs.myPortrait.innerHTML = markup;
  }

  function doneSummary(): MinigameDoneSummary {
    const stats = engine.stats();
    const won = stats.won === 1;
    return {
      kicker: 'MATCH OVER',
      title: won ? 'CHAMPION' : '3-0. AGAIN.',
      scoreLabel: 'STRIKES LANDED',
      rows: [
        { key: 'match', label: 'SCORE', value: `${stats.roundsWon} – ${stats.roundsLost}` },
        { key: 'perfectLaunches', label: 'PERFECT LAUNCHES', value: String(stats.perfectLaunches) },
      ],
      quote: `Michael: "${won ? '...best of five?' : 'Told you. Rematch whenever you want to lose again.'}"`,
    };
  }

  const renderWithTops = (): void => {
    paintPlayerTops();
    render();
  };

  return {
    id: 'beystadium',
    title: 'BEYSTADIUM',
    durationSec: BEYSTADIUM_MATCH_SECONDS,
    howToSubtitle: 'BEYSTADIUM · BEST OF 3 · VS MICHAEL',
    howToPlay: [
      'PICK YOUR BEY. Glacier is balanced. Avalanche hits hard but drains fast. Permafrost is a tank: low attack, huge stamina.',
      'RIP THE LAUNCHER (SPACE). A power meter sweeps back and forth. Press Space in the cyan zone for a perfect launch (max spin). Miss the zone and you start with less spin.',
      "TIME YOUR STRIKES (SPACE, X). During the battle a strike ring pulses. Press Space when the ring is cyan to slam Michael's Bey (costs a little of your spin). X does a defensive dodge. Whoever's spin hits zero first loses the round.",
      'Michael: "3-0. Again. Every time."',
    ],
    statLabels: { roundsWon: 'YOU', roundsLost: 'MICHAEL' },

    start(container, ctx) {
      context = ctx;
      buildDom(container);
      // Repaint the player's tops whenever a pick card is clicked.
      pickCards.forEach((card) => card.addEventListener('click', paintPlayerTops));
      report();
      renderWithTops();
      keydownHandler = handleKeydown;
      window.addEventListener('keydown', keydownHandler);
    },

    pause() {
      paused = true;
      stopTicking();
      render();
    },

    resume() {
      paused = false;
      if (engine.view.phase !== 'pick' && !finished) startTicking();
      render();
    },

    end() {
      stopTicking();
      finished = true;
      if (keydownHandler) {
        window.removeEventListener('keydown', keydownHandler);
        keydownHandler = undefined;
      }
      const stats = engine.stats();
      return { score: stats.strikes, stats };
    },

    doneSummary,

    debugFinishNow() {
      context?.finish();
    },
  };
}
