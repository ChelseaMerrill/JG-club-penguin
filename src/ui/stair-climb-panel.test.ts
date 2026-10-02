// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StairClimbProgress, StairFlightResult } from '../persistence/progress-store';
import {
  createStairClimbPanel,
  gateStairPanel,
  STAIR_PANEL_BLOCKED_POLL_MS,
  STAIR_PANEL_COPY,
  stairPanelState,
  type StairPanelInput,
} from './stair-climb-panel';

const PROGRESS = (flightsLogged: number, flightTokensToday = 0): StairClimbProgress => ({
  flightsLogged,
  completed: false,
  flightTokensToday,
});

const FLIGHT = (overrides: Partial<StairFlightResult>): StairFlightResult => ({
  logged: true,
  reason: null,
  flightsLogged: 1,
  tokensAwarded: 10,
  flightTokensToday: 10,
  badgesEarned: [],
  balance: 110,
  ...overrides,
});

const CLIMB_LINE = `${STAIR_PANEL_COPY.climbBefore}${STAIR_PANEL_COPY.climbKey}${STAIR_PANEL_COPY.climbAfter}`;

describe('stairPanelState (#51 slice 4, S4-D9, RT2-1)', () => {
  it.each<[string, StairPanelInput, Record<string, unknown>]>([
    [
      'floor 0 just started (floor-0 start logged, armed)',
      {
        floor: 0,
        progress: null,
        arrival: FLIGHT({ flightsLogged: 0, tokensAwarded: 0, flightTokensToday: 0 }),
        armed: true,
      },
      {
        state: 'climbing',
        heading: 'STAIRS CHALLENGE · FLIGHT 1 OF 5',
        floorTag: 'FLOOR 0 → 1',
        climbLine: true,
        lines: [{ kind: 'count', text: STAIR_PANEL_COPY.climbCount(0) }],
        progress: 0,
      },
    ],
    [
      'floor 3 after flight 3',
      {
        floor: 3,
        progress: null,
        arrival: FLIGHT({ flightsLogged: 3, flightTokensToday: 30 }),
        armed: true,
      },
      {
        state: 'climbing',
        heading: 'STAIRS CHALLENGE · FLIGHT 4 OF 5',
        floorTag: 'FLOOR 3 → 4',
        lines: [{ kind: 'count', text: STAIR_PANEL_COPY.climbCount(3) }],
        progress: 0.6,
      },
    ],
    [
      'floor 4 after a capped flight 4: the capped line too',
      {
        floor: 4,
        progress: null,
        arrival: FLIGHT({ flightsLogged: 4, tokensAwarded: 0, flightTokensToday: 100 }),
        armed: true,
      },
      {
        state: 'climbing',
        lines: [
          { kind: 'count', text: STAIR_PANEL_COPY.climbCount(4) },
          { kind: 'body', text: STAIR_PANEL_COPY.capped },
        ],
      },
    ],
    [
      'floor 2 reached by the Map (not armed), whatever the server row says',
      { floor: 2, progress: PROGRESS(2), arrival: null, armed: false },
      {
        state: 'not-started',
        heading: 'STAIRS CHALLENGE',
        floorTag: 'FLOOR 2',
        climbLine: false,
        lines: [{ kind: 'body', text: STAIR_PANEL_COPY.notStarted }],
        progress: null,
      },
    ],
    [
      'floor 3 when this visit armed but the climb skipped a floor',
      {
        floor: 3,
        progress: null,
        arrival: FLIGHT({ logged: false, reason: 'out_of_order', flightsLogged: 1 }),
        armed: true,
      },
      { state: 'not-started' },
    ],
    [
      'floor 0 reached by walking down (not armed)',
      { floor: 0, progress: PROGRESS(0), arrival: null, armed: false },
      { state: 'not-started' },
    ],
    [
      'floor 5 from Town Center',
      { floor: 5, progress: PROGRESS(5), arrival: null, armed: false },
      {
        state: 'floor5-incomplete',
        heading: 'STAIRS CHALLENGE · FLOOR 5',
        floorTag: 'FLOOR 5',
        lines: [{ kind: 'body', text: STAIR_PANEL_COPY.floor5Incomplete }],
        progress: null,
      },
    ],
    [
      'floor 5 when flight 5 came back already logged',
      {
        floor: 5,
        progress: null,
        arrival: FLIGHT({ logged: false, reason: 'already_logged', flightsLogged: 5 }),
        armed: true,
      },
      { state: 'floor5-incomplete' },
    ],
    [
      'floor 5, the first full climb',
      {
        floor: 5,
        progress: null,
        arrival: FLIGHT({
          flightsLogged: 5,
          flightTokensToday: 50,
          badgesEarned: ['stair-master'],
        }),
        armed: true,
      },
      {
        state: 'complete',
        heading: 'STAIRS CHALLENGE · COMPLETE',
        floorTag: 'FLOOR 5',
        lines: [
          { kind: 'body', text: STAIR_PANEL_COPY.complete },
          { kind: 'count', text: STAIR_PANEL_COPY.completeFirst },
        ],
        progress: 1,
      },
    ],
    [
      'floor 5, a later full climb at the cap',
      {
        floor: 5,
        progress: null,
        arrival: FLIGHT({ flightsLogged: 5, tokensAwarded: 0, flightTokensToday: 100 }),
        armed: true,
      },
      {
        state: 'complete',
        lines: [
          { kind: 'body', text: STAIR_PANEL_COPY.complete },
          { kind: 'count', text: STAIR_PANEL_COPY.completeAgain },
          { kind: 'body', text: STAIR_PANEL_COPY.capped },
        ],
      },
    ],
    [
      "floor 2 armed when the climb couldn't be read: the design's line, no count",
      { floor: 2, progress: null, arrival: null, armed: true },
      {
        state: 'climbing',
        heading: 'STAIRS CHALLENGE · FLIGHT 3 OF 5',
        climbLine: true,
        lines: [],
        progress: null,
      },
    ],
  ])('%s', (_label, input, expected) => {
    expect(stairPanelState(input)).toMatchObject(expected);
  });

  it('keeps every approved line under about 90 characters, for the 340 px panel', () => {
    for (const line of [
      STAIR_PANEL_COPY.notStarted,
      STAIR_PANEL_COPY.floor5Incomplete,
      STAIR_PANEL_COPY.complete,
      STAIR_PANEL_COPY.completeFirst,
      STAIR_PANEL_COPY.completeAgain,
      STAIR_PANEL_COPY.capped,
    ]) {
      expect(line.length, line).toBeLessThanOrEqual(90);
    }
  });
});

describe('createStairClimbPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function setup() {
    const root = document.createElement('div');
    document.body.append(root);
    const panel = createStairClimbPanel(root);
    const q = (selector: string) => root.querySelector<HTMLElement>(selector)!;
    return { panel, q };
  }

  it('is hidden until shown, then renders the state, the climbing line and the bar', () => {
    const { panel, q } = setup();
    expect(q('.stair-climb-panel').hidden).toBe(true);
    expect(q('.stair-climb-hint').hidden).toBe(true);

    panel.show({ floor: 1, progress: null, arrival: FLIGHT({ flightsLogged: 1 }), armed: true });

    expect(q('.stair-climb-panel').hidden).toBe(false);
    expect(q('.stair-climb-panel').dataset.state).toBe('climbing');
    expect(q('.stair-climb-panel__heading').textContent).toBe('STAIRS CHALLENGE · FLIGHT 2 OF 5');
    expect(q('.stair-climb-panel__floor').textContent).toBe('FLOOR 1 → 2');
    expect(q('.stair-climb-panel__line').textContent).toBe(CLIMB_LINE);
    expect(q('.stair-climb-panel__key').textContent).toBe('↑');
    expect(q('.stair-climb-panel__count').textContent).toBe(STAIR_PANEL_COPY.climbCount(1));
    expect(q('.stair-climb-panel__bar').hidden).toBe(false);
    expect(q('.stair-climb-panel__bar-fill').style.width).toBe('20%');
    expect(q('.stair-climb-hint').hidden).toBe(false);
    expect(q('.stair-climb-hint').textContent).toBe(`↑${STAIR_PANEL_COPY.hint}`);
  });

  it('replaces the body on every show, with no bar for a state that has none', () => {
    const { panel, q } = setup();
    panel.show({ floor: 1, progress: null, arrival: FLIGHT({ flightsLogged: 1 }), armed: true });
    panel.show({ floor: 5, progress: PROGRESS(5), arrival: null, armed: false });

    expect(q('.stair-climb-panel').dataset.state).toBe('floor5-incomplete');
    expect(q('.stair-climb-panel__lines').textContent).toBe(STAIR_PANEL_COPY.floor5Incomplete);
    expect(q('.stair-climb-panel__bar').hidden).toBe(true);
  });

  it('hide() hides both; a dismissed hint stays hidden on later shows', () => {
    const { panel, q } = setup();
    panel.show({ floor: 0, progress: PROGRESS(0), arrival: null, armed: false });
    panel.hide();
    expect(q('.stair-climb-panel').hidden).toBe(true);
    expect(q('.stair-climb-hint').hidden).toBe(true);

    panel.dismissHint();
    panel.show({ floor: 0, progress: PROGRESS(0), arrival: null, armed: false });
    expect(q('.stair-climb-panel').hidden).toBe(false);
    expect(q('.stair-climb-hint').hidden).toBe(true);
  });

  it('destroy() removes both elements', () => {
    const { panel } = setup();
    panel.destroy();
    expect(document.querySelector('.stair-climb-panel')).toBeNull();
    expect(document.querySelector('.stair-climb-hint')).toBeNull();
  });
});

describe('gateStairPanel (#163 review)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(blocked: { value: boolean }) {
    const shown: StairPanelInput[] = [];
    let hidden = 0;
    const gate = gateStairPanel(
      { show: (input) => shown.push(input), hide: () => (hidden += 1) },
      {
        isBlocked: () => blocked.value,
        setTimer: (callback, ms) => setTimeout(callback, ms),
        clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
    );
    return { gate, shown, hiddenCount: () => hidden };
  }

  const AT = (floor: number): StairPanelInput => ({
    floor,
    progress: PROGRESS(floor),
    arrival: null,
    armed: false,
  });

  it('shows straight away when the Elevator is down', () => {
    const { gate, shown } = setup({ value: false });
    gate.show(AT(2));
    expect(shown).toEqual([AT(2)]);
  });

  it('waits while the Elevator is up, then shows the latest input once it hides', () => {
    const blocked = { value: true };
    const { gate, shown } = setup(blocked);
    gate.show(AT(0));
    gate.show(AT(1));
    vi.advanceTimersByTime(6000);
    expect(shown).toEqual([]);

    blocked.value = false;
    vi.advanceTimersByTime(STAIR_PANEL_BLOCKED_POLL_MS);
    expect(shown).toEqual([AT(1)]);
  });

  it('drops a waiting input on hide', () => {
    const blocked = { value: true };
    const { gate, shown, hiddenCount } = setup(blocked);
    gate.show(AT(0));
    gate.hide();
    blocked.value = false;
    vi.advanceTimersByTime(1000);
    expect(shown).toEqual([]);
    expect(hiddenCount()).toBe(1);
  });
});
