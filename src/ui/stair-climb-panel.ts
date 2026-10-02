import './stair-climb-panel.css';
import type { StairClimbProgress, StairFlightResult } from '../persistence/progress-store';
import { STAIR_DAILY_TOKEN_CAP, STAIR_TOP_FLOOR } from '../persistence/stair-climb-rules';

/**
 * The approved Stairs Challenge copy (#51 slice 4, HD-7/U4: approved by
 * @milliehime 2026-09-29 as final), plus the design's own climbing lines,
 * verbatim from `design/Stairwell.dc.html`'s panel (QUEST reworded to
 * CHALLENGE by HD-7).
 */
export const STAIR_PANEL_COPY = {
  /** The design's line on floors 0-4, with its "↑" key highlighted. */
  climbBefore: 'Climb this flight: walk onto the stairs and hold ',
  climbKey: '↑',
  climbAfter: ' (or drag your penguin up the flight with the mouse). Jason logs it at the top.',
  /** The design's count line on floors 0-4, with `n` flights logged. */
  climbCount: (n: number) =>
    `${n} of 5 flights logged. Reward: 10 tokens per flight. All 5 = Stair Master badge.`,
  notStarted: 'Every climb starts at floor L. Enter the stairwell there to start logging flights.',
  floor5Incomplete: "Nice view, but this one doesn't count. Start at floor L and climb all five.",
  complete: 'Top floor. Jason logged all five. Head through the door, or up to the roof.',
  completeFirst: '5 of 5 flights logged. +50 tokens. Stair Master badge unlocked.',
  completeAgain: '5 of 5 flights logged. Stair Master is already yours.',
  capped: '100 tokens climbed today. Flights still count; tokens reset at midnight ET.',
  /**
   * The design's hint, above its Stages. Its second sentence stays because
   * the upper stair flight is a door (S4-D4).
   */
  hint: 'Hold the up arrow to climb a flight, down to descend. Or grab the stairs with your mouse and drag up.',
} as const;

export type StairPanelStateName = 'climbing' | 'not-started' | 'floor5-incomplete' | 'complete';

export interface StairPanelInput {
  /** The Stairwell floor the Player is on, 0-5. */
  floor: number;
  /** The climb as last read, or `null` when it couldn't be read (S4-D9's degrade rule). */
  progress: StairClimbProgress | null;
  /** This visit's own `logStairFlight` result, if this arrival logged a flight. */
  arrival: StairFlightResult | null;
  /** Whether this Stairwell visit started a climb on floor 0 (RT2-1). */
  armed: boolean;
}

/** One line of the panel's body: the main line, or the dimmer count line. */
export interface StairPanelLine {
  kind: 'body' | 'count';
  text: string;
}

export interface StairPanelView {
  state: StairPanelStateName;
  heading: string;
  /** The heading's right-hand floor tag, e.g. "FLOOR 4 → 5". */
  floorTag: string;
  lines: StairPanelLine[];
  /** Whether the design's climbing line (with its highlighted "↑") leads the body. */
  climbLine: boolean;
  /** The progress bar's fill, 0-1, or `null` for no bar. */
  progress: number | null;
}

/**
 * The panel for one moment of a Stairwell visit (#51 slice 4, S4-D9 as
 * amended, RT2-1):
 * - `climbing` on floors 0-4 while this visit's climb is armed and has
 *   logged exactly this floor's flights;
 * - `not-started` on floors 0-4 otherwise;
 * - `complete` on floor 5 when this arrival logged flight 5 (the first-climb
 *   last line when it earned Stair Master);
 * - `floor5-incomplete` on floor 5 otherwise.
 * `climbing` and `complete` add the capped line once today's flight Tokens
 * reach the cap. When the climb couldn't be read, floors 0-4 show the
 * design's climbing line without the count.
 */
export function stairPanelState({
  floor,
  progress,
  arrival,
  armed,
}: StairPanelInput): StairPanelView {
  const flightsLogged = arrival?.flightsLogged ?? progress?.flightsLogged;
  const tokensToday = arrival?.flightTokensToday ?? progress?.flightTokensToday ?? 0;
  const cappedLine: StairPanelLine[] =
    tokensToday >= STAIR_DAILY_TOKEN_CAP ? [{ kind: 'body', text: STAIR_PANEL_COPY.capped }] : [];

  if (floor >= STAIR_TOP_FLOOR) {
    if (arrival?.logged && arrival.flightsLogged === STAIR_TOP_FLOOR) {
      const first = arrival.badgesEarned.includes('stair-master');
      return {
        state: 'complete',
        heading: 'STAIRS CHALLENGE · COMPLETE',
        floorTag: 'FLOOR 5',
        lines: [
          { kind: 'body', text: STAIR_PANEL_COPY.complete },
          {
            kind: 'count',
            text: first ? STAIR_PANEL_COPY.completeFirst : STAIR_PANEL_COPY.completeAgain,
          },
          ...cappedLine,
        ],
        climbLine: false,
        progress: 1,
      };
    }
    return {
      state: 'floor5-incomplete',
      heading: 'STAIRS CHALLENGE · FLOOR 5',
      floorTag: 'FLOOR 5',
      lines: [{ kind: 'body', text: STAIR_PANEL_COPY.floor5Incomplete }],
      climbLine: false,
      progress: null,
    };
  }

  const unread = progress === null && arrival === null;
  if (armed && (unread || flightsLogged === floor)) {
    return {
      state: 'climbing',
      heading: `STAIRS CHALLENGE · FLIGHT ${floor + 1} OF 5`,
      floorTag: `FLOOR ${floor} → ${floor + 1}`,
      lines: unread
        ? []
        : [{ kind: 'count', text: STAIR_PANEL_COPY.climbCount(floor) }, ...cappedLine],
      climbLine: true,
      progress: unread ? null : floor / STAIR_TOP_FLOOR,
    };
  }
  return {
    state: 'not-started',
    heading: 'STAIRS CHALLENGE',
    floorTag: `FLOOR ${floor}`,
    lines: [{ kind: 'body', text: STAIR_PANEL_COPY.notStarted }],
    climbLine: false,
    progress: null,
  };
}

export interface StairClimbPanel {
  /** Shows the panel for `input` (and the hint, until it's dismissed). */
  show(input: StairPanelInput): void;
  /** Hides the panel and the hint (any Room that isn't a Stairwell floor). */
  hide(): void;
  /** Hides the hint for good, as the design does once a stair key is used. */
  dismissHint(): void;
  destroy(): void;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The Stairwell's climb panel and hint (#51 slice 4, S4-D9): plain DOM in
 * `#ui`, where `design/Stairwell.dc.html` draws them (the panel at left 36,
 * bottom 166, 340 wide). Read-only: it never takes a click.
 */
export function createStairClimbPanel(root: HTMLElement): StairClimbPanel {
  const panel = el('div', 'stair-climb-panel');
  panel.hidden = true;
  panel.setAttribute('role', 'status');
  const header = el('div', 'stair-climb-panel__header');
  const heading = el('span', 'stair-climb-panel__heading');
  const floorTag = el('span', 'stair-climb-panel__floor');
  header.append(heading, floorTag);
  const body = el('div', 'stair-climb-panel__lines');
  const bar = el('div', 'stair-climb-panel__bar');
  const fill = el('div', 'stair-climb-panel__bar-fill');
  bar.append(fill);
  panel.append(header, body, bar);

  const hint = el('div', 'stair-climb-hint');
  hint.hidden = true;
  const key = el('span', 'stair-climb-hint__key', '↑');
  key.setAttribute('aria-hidden', 'true');
  hint.append(key, document.createTextNode(STAIR_PANEL_COPY.hint));
  root.append(panel, hint);

  let hintDismissed = false;

  return {
    show(input) {
      const view = stairPanelState(input);
      panel.dataset.state = view.state;
      heading.textContent = view.heading;
      floorTag.textContent = view.floorTag;
      body.replaceChildren();
      if (view.climbLine) {
        const line = el('div', 'stair-climb-panel__line', STAIR_PANEL_COPY.climbBefore);
        line.append(
          el('span', 'stair-climb-panel__key', STAIR_PANEL_COPY.climbKey),
          document.createTextNode(STAIR_PANEL_COPY.climbAfter),
        );
        body.append(line);
      }
      for (const line of view.lines) {
        body.append(
          el(
            'div',
            line.kind === 'count' ? 'stair-climb-panel__count' : 'stair-climb-panel__line',
            line.text,
          ),
        );
      }
      bar.hidden = view.progress === null;
      fill.style.width = `${Math.round((view.progress ?? 0) * 100)}%`;
      panel.hidden = false;
      hint.hidden = hintDismissed;
    },
    hide() {
      panel.hidden = true;
      hint.hidden = true;
    },
    dismissHint() {
      hintDismissed = true;
      hint.hidden = true;
    },
    destroy() {
      panel.remove();
      hint.remove();
    },
  };
}
