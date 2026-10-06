/**
 * Ian's spoken line under the Bug Squash grid, and his done-screen result
 * line, ported verbatim from `design/Minigame Bug Squash.dc.html`'s own
 * `ian`/`resultLine` copy (#181). Pure and DOM-free: `bug-squash.ts` drives
 * `BugSquashIanLine` from the engine's own events (round start, a squash, a
 * flaky hit, an empty-cell click, an escape) and wraps `current` as
 * `Ian: "<line>"`; `bugSquashResultLine` is read the same way for the done
 * screen's `MinigameDoneSummary.quote`.
 *
 * Producer: #181.
 */

/** Shown the moment a round starts. */
export const IAN_ROUND_START_LINE = 'Tests running. Squash.';

/** Shown when a flaky bug survives its first hit. */
export const IAN_FLAKY_HIT_LINE = 'Flaky. Again!';

/** Shown when the Player clicks an empty cell. */
export const IAN_EMPTY_CLICK_LINE = 'That was a feature.';

/** Shown when the Player declines Ian's trigger dialog (`npcs.ts`'s `BUG_SQUASH_DIALOG.declineLine`). */
export const IAN_DECLINE_LINE = 'Cool. Enjoy the red build.';

/** Rotates in order on each consecutive squash. */
export const IAN_SQUASH_LINES = ['Squashed.', 'Clean.', 'Green.', 'Ship it.'] as const;

/** Rotates in order on each consecutive escape. */
export const IAN_ESCAPE_LINES = [
  'That one got into prod.',
  'Build light down.',
  'It is in the logs now.',
] as const;

export interface BugSquashIanLine {
  /** The line currently shown, as plain text (`bug-squash.ts` adds the `Ian: "..."` wrapper). */
  readonly current: string;
  /** Resets to `IAN_ROUND_START_LINE` and restarts both rotations at their first line. */
  roundStart(): void;
  /** Advances the squash rotation by one line. */
  squash(): void;
  flakyHit(): void;
  emptyClick(): void;
  /** Advances the escape rotation by one line. */
  escape(): void;
}

/** A fresh, independent `BugSquashIanLine`: one per round (`bug-squash.ts` makes a new one in `start()`). */
export function createBugSquashIanLine(): BugSquashIanLine {
  let current: string = IAN_ROUND_START_LINE;
  let squashIndex = 0;
  let escapeIndex = 0;

  return {
    get current() {
      return current;
    },
    roundStart() {
      current = IAN_ROUND_START_LINE;
      squashIndex = 0;
      escapeIndex = 0;
    },
    squash() {
      current = IAN_SQUASH_LINES[squashIndex % IAN_SQUASH_LINES.length];
      squashIndex += 1;
    },
    flakyHit() {
      current = IAN_FLAKY_HIT_LINE;
    },
    emptyClick() {
      current = IAN_EMPTY_CLICK_LINE;
    },
    escape() {
      current = IAN_ESCAPE_LINES[escapeIndex % IAN_ESCAPE_LINES.length];
      escapeIndex += 1;
    },
  };
}

/** Ian's done-screen result line (the design's own `resultLine`), by outcome and score. */
export function bugSquashResultLine(outcome: { failed: boolean; score: number }): string {
  if (outcome.failed) return 'Five escaped. Roll it back.';
  if (outcome.score >= 500) return 'Wall of fame. Do not let it go to your head.';
  if (outcome.score >= 250) return 'Passable. Squash faster next sprint.';
  return 'That is a lot of bugs in prod.';
}
