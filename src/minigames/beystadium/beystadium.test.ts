// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MinigameStatsMap } from '../../contracts';
import type { MinigameContext } from '../minigame';
import { createBeystadium } from './beystadium';

/**
 * `beystadium.ts`'s own seam: the `Minigame` interface plus the DOM and keys
 * it renders into the shell's play area. Drives the real (deterministic)
 * engine through faked timers, the same 50 ms tick the design uses; the
 * engine's own rule values are `beystadium-engine.test.ts`'s job.
 */
interface FakeContext extends MinigameContext<'beystadium'> {
  scores: number[];
  stats: Array<Partial<MinigameStatsMap['beystadium']>>;
  finishCalls: number;
}

function createFakeContext(): FakeContext {
  const ctx: FakeContext = {
    scores: [],
    stats: [],
    finishCalls: 0,
    setScore(score) {
      ctx.scores.push(score);
    },
    setStats(stats) {
      ctx.stats.push(stats);
    },
    finish() {
      ctx.finishCalls += 1;
    },
  };
  return ctx;
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

function setup() {
  const container = document.createElement('div');
  document.body.append(container);
  const ctx = createFakeContext();
  const game = createBeystadium();
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    container.querySelector<T>(selector)!;
  const text = (selector: string) => container.querySelector(selector)?.textContent ?? null;
  return { container, ctx, game, q, text };
}

/** Starts the game, picks `bey`, goes to the stadium and rips a perfect launch. */
function startFight(env: ReturnType<typeof setup>, bey = 0): void {
  env.game.start(env.container, env.ctx);
  env.q<HTMLButtonElement>(`[data-bey="${bey}"]`).click();
  env.q<HTMLButtonElement>('.beystadium__to-stadium').click();
  vi.advanceTimersByTime(20 * 50); // meter 68: inside the cyan zone
  press(' ');
}

/** From a fight in round 1: never fights back, so Michael takes the round;
 *  then a weak launch (meter 17) into round 2, which Michael also takes. */
function loseTwoRounds(env: ReturnType<typeof setup>): void {
  while (env.q('.beystadium__launch').hidden) vi.advanceTimersByTime(50);
  vi.advanceTimersByTime(5 * 50);
  press(' ');
  vi.advanceTimersByTime(30_000);
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createBeystadium: the Minigame the shell drives', () => {
  it('is registered as beystadium with a best-of-3 how-to subtitle', () => {
    const { game } = setup();

    expect(game.id).toBe('beystadium');
    expect(game.title).toBe('BEYSTADIUM');
    expect(game.howToSubtitle).toBe('BEYSTADIUM · BEST OF 3 · VS MICHAEL');
    expect(game.howToPlay.join(' ')).toContain('cyan zone');
    expect(game.statLabels).toEqual({ roundsWon: 'YOU', roundsLost: 'MICHAEL' });
  });
});

describe('the pick screen', () => {
  it('shows the three Beys with their stats and blurbs, and Michael’s Bey', () => {
    const env = setup();
    env.game.start(env.container, env.ctx);

    const names = [...env.container.querySelectorAll('.beystadium__bey-name')].map(
      (el) => el.textContent,
    );
    expect(names).toEqual(['GLACIER', 'AVALANCHE', 'PERMAFROST']);
    expect(env.text('[data-bey="1"] .beystadium__bey-blurb')).toBe(
      'Hits like a truck. Tires like one too.',
    );
    expect(env.text('[data-bey="1"] [data-stat="atk"]')).toBe('9');
    expect(env.text('[data-bey="1"] [data-stat="sta"]')).toBe('4');
    expect(env.text('.beystadium__pick-note')).toBe(
      'Michael runs Blizzard Fang: attack 8, stamina 7. He is not humble about it.',
    );
    expect(env.q('[data-bey="0"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('selects a Bey on click, and that Bey fights', () => {
    const env = setup();
    startFight(env, 2);

    expect(env.text('.beystadium__my-name')).toBe('YOU · PERMAFROST');
    expect(env.game.end().stats.bey).toBe(2);
  });
});

describe('the battle', () => {
  it('opens on round 1’s launch with the meter sweeping every 50 ms', () => {
    const env = setup();
    env.game.start(env.container, env.ctx);
    env.q<HTMLButtonElement>('.beystadium__to-stadium').click();

    expect(env.q('.beystadium__pick').hidden).toBe(true);
    expect(env.q('.beystadium__battle').hidden).toBe(false);
    expect(env.q('.beystadium__launch').hidden).toBe(false);
    expect(env.text('.beystadium__round')).toBe('1 / 3');
    expect(env.text('.beystadium__banner')).toBe('ROUND 1');
    expect(env.text('.beystadium__subline')).toBe('RIP THE LAUNCHER · SPACE IN THE CYAN ZONE');

    vi.advanceTimersByTime(10 * 50);
    expect(env.q('.beystadium__meter-needle').style.left).toBe('34%');
  });

  it('SPACE in the cyan zone is a perfect launch into the fight', () => {
    const env = setup();
    startFight(env);

    expect(env.q('.beystadium__launch').hidden).toBe(true);
    expect(env.q('.beystadium__fight').hidden).toBe(false);
    expect(env.text('.beystadium__my-spin')).toBe('100');
    expect(env.text('.beystadium__mk-spin')).toBe('96');
    expect(env.text('.beystadium__clash')).toBe('PERFECT LAUNCH');
    expect(env.text('.beystadium__mike-line')).toBe('Okay. Not bad.');
    expect(env.ctx.stats.at(-1)).toMatchObject({ perfectLaunches: 1 });
  });

  it('SPACE while the ring is cyan lands a strike and reports the score', () => {
    const env = setup();
    startFight(env);
    vi.advanceTimersByTime(31 * 50);

    expect(env.text('.beystadium__ring-label')).toBe('STRIKE!');
    press(' ');
    expect(env.text('.beystadium__clash')).toBe('STRIKE!');
    expect(env.ctx.scores.at(-1)).toBe(1);
  });

  it('X arms a dodge, shown on the ring', () => {
    const env = setup();
    startFight(env);
    vi.advanceTimersByTime(5 * 50);

    press('x');
    expect(env.text('.beystadium__clash')).toBe('DODGE READY');
    expect(env.text('.beystadium__ring-label')).toBe('DODGING');
  });

  it('pause() freezes the match and ignores keys until resume()', () => {
    const env = setup();
    env.game.start(env.container, env.ctx);
    env.q<HTMLButtonElement>('.beystadium__to-stadium').click();
    vi.advanceTimersByTime(5 * 50);
    const needle = env.q('.beystadium__meter-needle').style.left;

    env.game.pause();
    vi.advanceTimersByTime(20 * 50);
    press(' ');
    expect(env.q('.beystadium__meter-needle').style.left).toBe(needle);
    expect(env.q('.beystadium__launch').hidden).toBe(false);
    expect(env.text('.beystadium__subline')).toBe('PAUSED · PRESS P');

    env.game.resume();
    vi.advanceTimersByTime(50);
    expect(env.q('.beystadium__meter-needle').style.left).not.toBe(needle);
  });
});

describe('the end of the match', () => {
  it('calls finish() once when the match is over, and end() returns the match stats', () => {
    const env = setup();
    startFight(env, 1);
    loseTwoRounds(env);

    expect(env.ctx.finishCalls).toBe(1);
    const { score, stats } = env.game.end();
    expect(score).toBe(0);
    expect(stats).toMatchObject({ won: 0, roundsWon: 0, roundsLost: 2, bey: 1 });
  });

  it('a lost match’s done summary is MATCH OVER · 3-0. AGAIN.', () => {
    const env = setup();
    startFight(env);
    loseTwoRounds(env);
    env.game.end();

    expect(env.game.doneSummary!()).toEqual({
      kicker: 'MATCH OVER',
      title: '3-0. AGAIN.',
      scoreLabel: 'STRIKES LANDED',
      rows: [
        { key: 'match', label: 'SCORE', value: '0 – 2' },
        { key: 'perfectLaunches', label: 'PERFECT LAUNCHES', value: '1' },
      ],
      quote: 'Michael: "Told you. Rematch whenever you want to lose again."',
    });
  });

  it('a won match’s done summary is CHAMPION', () => {
    const env = setup();
    startFight(env);
    for (let round = 0; round < 2; round++) {
      vi.advanceTimersByTime(31 * 50);
      for (let i = 0; i < 6; i++) press(' ');
      vi.advanceTimersByTime(50 + 32 * 50); // round ends, then the 1.6 s pause
      if (round === 0) {
        vi.advanceTimersByTime(20 * 50);
        press(' ');
      }
    }

    expect(env.ctx.finishCalls).toBe(1);
    env.game.end();
    expect(env.game.doneSummary!()).toMatchObject({
      title: 'CHAMPION',
      rows: [
        { key: 'match', label: 'SCORE', value: '2 – 0' },
        { key: 'perfectLaunches', label: 'PERFECT LAUNCHES', value: '2' },
      ],
      quote: 'Michael: "...best of five?"',
    });
  });

  it('end() stops the keys and the ticking', () => {
    const env = setup();
    startFight(env);
    env.game.end();
    const scoresBefore = env.ctx.scores.length;

    vi.advanceTimersByTime(31 * 50);
    press(' ');
    expect(env.ctx.scores.length).toBe(scoresBefore);
  });

  it('debugFinishNow ends the match now through the shell', () => {
    const env = setup();
    startFight(env);

    env.game.debugFinishNow();
    expect(env.ctx.finishCalls).toBe(1);
  });
});
