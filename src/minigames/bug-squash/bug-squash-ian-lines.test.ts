import { describe, expect, it } from 'vitest';
import {
  bugSquashResultLine,
  createBugSquashIanLine,
  IAN_DECLINE_LINE,
  IAN_EMPTY_CLICK_LINE,
  IAN_ESCAPE_LINES,
  IAN_FLAKY_HIT_LINE,
  IAN_ROUND_START_LINE,
  IAN_SQUASH_LINES,
} from './bug-squash-ian-lines';

describe('createBugSquashIanLine: round start', () => {
  it('starts on the round-start line', () => {
    const ian = createBugSquashIanLine();
    expect(ian.current).toBe('Tests running. Squash.');
    expect(ian.current).toBe(IAN_ROUND_START_LINE);
  });

  it('roundStart() resets both rotations back to their first line', () => {
    const ian = createBugSquashIanLine();
    ian.squash();
    ian.squash();
    ian.escape();

    ian.roundStart();

    expect(ian.current).toBe(IAN_ROUND_START_LINE);
    ian.squash();
    expect(ian.current).toBe(IAN_SQUASH_LINES[0]);
    ian.escape();
    expect(ian.current).toBe(IAN_ESCAPE_LINES[0]);
  });
});

describe('createBugSquashIanLine: single-trigger lines', () => {
  it('flakyHit() shows the flaky-hit line', () => {
    const ian = createBugSquashIanLine();
    ian.flakyHit();
    expect(ian.current).toBe('Flaky. Again!');
    expect(ian.current).toBe(IAN_FLAKY_HIT_LINE);
  });

  it('emptyClick() shows the empty-click line', () => {
    const ian = createBugSquashIanLine();
    ian.emptyClick();
    expect(ian.current).toBe('That was a feature.');
    expect(ian.current).toBe(IAN_EMPTY_CLICK_LINE);
  });
});

describe('createBugSquashIanLine: squash rotates in order', () => {
  it('cycles Squashed. / Clean. / Green. / Ship it. in order, then wraps', () => {
    const ian = createBugSquashIanLine();
    const observed: string[] = [];
    for (let i = 0; i < 6; i++) {
      ian.squash();
      observed.push(ian.current);
    }
    expect(observed).toEqual(['Squashed.', 'Clean.', 'Green.', 'Ship it.', 'Squashed.', 'Clean.']);
    expect(observed.slice(0, 4)).toEqual([...IAN_SQUASH_LINES]);
  });
});

describe('createBugSquashIanLine: escape rotates in order', () => {
  it('cycles That one got into prod. / Build light down. / It is in the logs now. in order, then wraps', () => {
    const ian = createBugSquashIanLine();
    const observed: string[] = [];
    for (let i = 0; i < 4; i++) {
      ian.escape();
      observed.push(ian.current);
    }
    expect(observed).toEqual([
      'That one got into prod.',
      'Build light down.',
      'It is in the logs now.',
      'That one got into prod.',
    ]);
    expect(observed.slice(0, 3)).toEqual([...IAN_ESCAPE_LINES]);
  });
});

describe('bugSquashResultLine: done-screen result by outcome and score', () => {
  it('a failed round (all five lights lost) always says the build rolled back, regardless of score', () => {
    expect(bugSquashResultLine({ failed: true, score: 0 })).toBe('Five escaped. Roll it back.');
    expect(bugSquashResultLine({ failed: true, score: 600 })).toBe('Five escaped. Roll it back.');
  });

  it('500 or more: the wall-of-fame line', () => {
    expect(bugSquashResultLine({ failed: false, score: 500 })).toBe(
      'Wall of fame. Do not let it go to your head.',
    );
    expect(bugSquashResultLine({ failed: false, score: 750 })).toBe(
      'Wall of fame. Do not let it go to your head.',
    );
  });

  it('250 to 499: the passable line', () => {
    expect(bugSquashResultLine({ failed: false, score: 250 })).toBe(
      'Passable. Squash faster next sprint.',
    );
    expect(bugSquashResultLine({ failed: false, score: 499 })).toBe(
      'Passable. Squash faster next sprint.',
    );
  });

  it('under 250: the lots-of-bugs-in-prod line', () => {
    expect(bugSquashResultLine({ failed: false, score: 0 })).toBe('That is a lot of bugs in prod.');
    expect(bugSquashResultLine({ failed: false, score: 249 })).toBe(
      'That is a lot of bugs in prod.',
    );
  });
});

describe('IAN_DECLINE_LINE', () => {
  it('matches the design copy shown when the Player declines Ian', () => {
    expect(IAN_DECLINE_LINE).toBe('Cool. Enjoy the red build.');
  });
});
