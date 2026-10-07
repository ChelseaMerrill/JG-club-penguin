import { describe, expect, it, vi } from 'vitest';
import { createEmitter } from '../contracts/emitter';
import type { GameEventMap } from '../contracts/game-events';
import { createInMemoryProgressStore } from '../persistence/in-memory-progress-store';
import type { ProgressStore } from '../persistence/progress-store';
import { COFFEE_COLD_MESSAGE, createCoffeeRunController, formatCountdown } from './coffee-run';

/** A clock and an interval scheduler the test drives by hand. */
function makeTime() {
  let nowMs = Date.parse('2026-10-06T16:00:00.000Z');
  const intervals = new Set<() => void>();
  return {
    now: () => nowMs,
    schedule: {
      setInterval: (fn: () => void) => {
        intervals.add(fn);
        return fn;
      },
      clearInterval: (handle: unknown) => {
        intervals.delete(handle as () => void);
      },
    },
    /** Moves the clock on and runs every live interval once. */
    advance(seconds: number) {
      nowMs += seconds * 1000;
      for (const fn of Array.from(intervals)) fn();
    },
    liveIntervals: () => intervals.size,
  };
}

function setup(options: { store?: ProgressStore; time?: ReturnType<typeof makeTime> } = {}) {
  const time = options.time ?? makeTime();
  const store = options.store ?? createInMemoryProgressStore({ now: time.now });
  const events = createEmitter<GameEventMap>();
  const toasts: string[] = [];
  events.on('ui:toast', ({ message }) => toasts.push(message));
  const refreshQuests = vi.fn();
  const coffee = createCoffeeRunController({
    store,
    events,
    refreshQuests,
    now: time.now,
    schedule: time.schedule,
  });
  return { time, store, events, toasts, refreshQuests, coffee };
}

/** Lets every pending store promise settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('formatCountdown', () => {
  it.each([
    [60, '01:00'],
    [59.2, '01:00'],
    [47, '00:47'],
    [9.01, '00:10'],
    [0.4, '00:01'],
    [0, '00:00'],
    [-3, '00:00'],
    [272, '04:32'],
  ])('shows %s seconds as %s', (seconds, text) => {
    expect(formatCountdown(seconds)).toBe(text);
  });
});

describe('createCoffeeRunController (#141)', () => {
  it('talking to Nicole starts the run and re-reads Quest progress', async () => {
    const { coffee, store, refreshQuests } = setup();
    await coffee.start();

    await coffee.talkToNicole();

    expect((await store.coffeeRun()).talkedToNicole).toBe(true);
    expect(coffee.view()).toMatchObject({ talkedToNicole: true, carrying: false });
    expect(refreshQuests).toHaveBeenCalled();
  });

  it('marks the Kitchen visit on entering The Kitchen once Nicole has asked, and only then', async () => {
    const { coffee, store, events, refreshQuests } = setup();
    await coffee.start();

    events.emit('room:enter', { roomId: 'the-melt', entryTile: { col: 0, row: 0 } });
    await settle();
    expect((await store.coffeeRun()).kitchenVisited).toBe(false);

    await coffee.talkToNicole();
    refreshQuests.mockClear();
    events.emit('room:enter', { roomId: 'town-center', entryTile: { col: 0, row: 0 } });
    await settle();
    expect((await store.coffeeRun()).kitchenVisited).toBe(false);

    events.emit('room:enter', { roomId: 'the-melt', entryTile: { col: 0, row: 0 } });
    await settle();
    expect((await store.coffeeRun()).kitchenVisited).toBe(true);
    expect(coffee.view()?.kitchenVisited).toBe(true);
    expect(refreshQuests).toHaveBeenCalled();
  });

  it("asking Tom hands over a cup with a 1:00 countdown that runs down on the Player's screen", async () => {
    const { coffee, time } = setup();
    await coffee.start();
    expect(coffee.canAskTom()).toBe(false);
    await coffee.talkToNicole();
    expect(coffee.canAskTom()).toBe(true);
    const seen: Array<number | null> = [];
    coffee.onChange((view) => seen.push(view.secondsLeft));

    await coffee.askTom();

    expect(coffee.view()).toMatchObject({ carrying: true, secondsLeft: 60 });
    expect(coffee.canAskTom()).toBe(false);
    time.advance(13);
    expect(coffee.view()?.secondsLeft).toBe(47);
    expect(seen.at(-1)).toBe(47);
  });

  it('at 0:00 the cup goes cold: a toast, no cup, Quest progress re-read, and Tom can be asked again', async () => {
    const { coffee, time, toasts, refreshQuests, store } = setup();
    await coffee.start();
    await coffee.talkToNicole();
    await coffee.askTom();
    refreshQuests.mockClear();

    time.advance(59);
    expect(toasts).toEqual([]);
    time.advance(1);

    expect(toasts).toEqual([COFFEE_COLD_MESSAGE]);
    expect(coffee.view()).toMatchObject({ carrying: false, secondsLeft: null });
    expect(coffee.canAskTom()).toBe(true);
    expect(refreshQuests).toHaveBeenCalledTimes(1);
    expect(time.liveIntervals()).toBe(0);
    // The server agrees on its own: steps 3-5 are reset.
    time.advance(1);
    expect((await store.questProgress()).questSteps['nicole-coffee']['ask-tom']).toBe(false);

    await coffee.askTom();
    expect(coffee.view()).toMatchObject({ carrying: true, secondsLeft: 60 });
  });

  it('talking to Nicole while carrying a hot cup delivers it', async () => {
    const { coffee, events, time, store, refreshQuests } = setup();
    await coffee.start();
    await coffee.talkToNicole();
    await coffee.askTom();
    time.advance(40);
    refreshQuests.mockClear();

    events.emit('npc:talked', { npcId: 'nicole' });
    await settle();

    expect((await store.coffeeRun()).delivered).toBe(true);
    expect(coffee.view()).toMatchObject({ delivered: true, carrying: false });
    expect(refreshQuests).toHaveBeenCalled();
    expect(coffee.canAskTom()).toBe(false);
    expect(time.liveIntervals()).toBe(0);
  });

  it('talking to Nicole without a cup, or to anyone else with one, delivers nothing', async () => {
    const { coffee, events, store } = setup();
    await coffee.start();
    await coffee.talkToNicole();

    events.emit('npc:talked', { npcId: 'nicole' });
    await settle();
    await coffee.askTom();
    events.emit('npc:talked', { npcId: 'tom' });
    await settle();

    expect((await store.coffeeRun()).delivered).toBe(false);
  });

  it('a delivery the server refuses as cold (its clock ahead of ours) drops the cup and re-reads progress', async () => {
    const time = makeTime();
    let serverSkewMs = 0;
    const store = createInMemoryProgressStore({ now: () => time.now() + serverSkewMs });
    const { coffee, events, refreshQuests } = setup({ store, time });
    await coffee.start();
    await coffee.talkToNicole();
    await coffee.askTom();
    serverSkewMs = 70_000;
    refreshQuests.mockClear();

    events.emit('npc:talked', { npcId: 'nicole' });
    await settle();

    expect(coffee.view()).toMatchObject({ carrying: false, delivered: false });
    expect(coffee.canAskTom()).toBe(true);
    expect(refreshQuests).toHaveBeenCalled();
  });

  it('start() resumes a cup already being carried, from the seconds the server reports', async () => {
    const time = makeTime();
    const store = createInMemoryProgressStore({ now: time.now });
    await store.talkToNicole();
    await store.askTomForCoffee();
    time.advance(25);

    const { coffee } = setup({ store, time });
    await coffee.start();

    expect(coffee.view()).toMatchObject({ carrying: true, secondsLeft: 35 });
  });

  it('after stop(), Room and NPC events do nothing and the countdown stops', async () => {
    const { coffee, events, store, time, toasts } = setup();
    await coffee.start();
    await coffee.talkToNicole();
    await coffee.askTom();

    coffee.stop();
    events.emit('npc:talked', { npcId: 'nicole' });
    await settle();
    time.advance(61);

    expect((await store.coffeeRun()).delivered).toBe(false);
    expect(coffee.view()).toBeNull();
    expect(toasts).toEqual([]);
    expect(time.liveIntervals()).toBe(0);
  });
});
