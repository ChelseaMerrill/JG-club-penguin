import { describe, expect, it } from 'vitest';
import type { MinigameRegistry } from '../minigames/minigame';
import { QUEST_DEFINITIONS, questsInBuild } from './quest-definitions';
import {
  ALL_DONE_LINES,
  evaluateQuests,
  nextTrackedQuestId,
  pickAllDoneLine,
  questTransitions,
  resolveTrackedQuestId,
  stepToastMessage,
  type QuestInputs,
  type QuestStatus,
} from './quest-engine';

/** A Player straight past the name gate (#75): the Penguin exists, nothing else. */
function freshPlayer(overrides: Partial<QuestInputs> = {}): QuestInputs {
  return {
    profileCreatedAt: '2026-09-25T09:00:00.000Z',
    bests: {},
    badges: [],
    ownedItems: [],
    devPitVisited: false,
    roundsFinished: [],
    completedQuests: [],
    ...overrides,
  };
}

function status(statuses: QuestStatus[], id: string): QuestStatus {
  const found = statuses.find((s) => s.quest.id === id);
  if (!found) throw new Error(`no quest ${id}`);
  return found;
}

const stubFactory = (() => {
  throw new Error('never launched in these tests');
}) as never;

describe('questsInBuild', () => {
  it('lists the main quest plus one quest per registered Minigame, in definition order', () => {
    const registry: MinigameRegistry = { 'pancake-flip': stubFactory, 'bug-squash': stubFactory };

    expect(questsInBuild(QUEST_DEFINITIONS, registry).map((q) => q.id)).toEqual([
      'main',
      'bug-squash',
      'pancake-flip',
    ]);
  });

  it('adds Coffee Rush only once its Minigame is registered', () => {
    const without = questsInBuild(QUEST_DEFINITIONS, { 'bug-squash': stubFactory });
    const withIt = questsInBuild(QUEST_DEFINITIONS, {
      'bug-squash': stubFactory,
      'coffee-rush': stubFactory,
    });

    expect(without.map((q) => q.id)).not.toContain('coffee-rush');
    expect(withIt.map((q) => q.id)).toContain('coffee-rush');
  });
});

describe('main quest step evaluation', () => {
  it('starts every named Player at 1 / 5 with "Visit the Dev Pit" as the next step', () => {
    const main = status(evaluateQuests(QUEST_DEFINITIONS, freshPlayer()), 'main');

    expect(main.progress).toBe(1);
    expect(main.target).toBe(5);
    expect(main.done).toBe(false);
    expect(main.nextHint).toEqual({ text: 'Visit the Dev Pit', location: 'DEV PIT' });
  });

  it('counts earlier play: a Bug Squash round and owned Furniture make 3 / 5, and 4 / 5 with a Dev Pit visit', () => {
    const earlier = freshPlayer({ roundsFinished: ['bug-squash'], ownedItems: ['beanbag'] });

    expect(status(evaluateQuests(QUEST_DEFINITIONS, earlier), 'main').progress).toBe(3);
    expect(
      status(evaluateQuests(QUEST_DEFINITIONS, { ...earlier, devPitVisited: true }), 'main')
        .progress,
    ).toBe(4);
  });

  it('counts steps in any order and hints the first unfinished one', () => {
    const outOfOrder = freshPlayer({ roundsFinished: ['pancake-flip'], ownedItems: ['desk'] });
    const main = status(evaluateQuests(QUEST_DEFINITIONS, outOfOrder), 'main');

    expect(main.progress).toBe(3);
    expect(main.steps.map((s) => s.done)).toEqual([true, false, false, true, true]);
    expect(main.nextHint).toEqual({ text: 'Visit the Dev Pit', location: 'DEV PIT' });
  });

  it('hints Pancake Flip in THE KITCHEN when it is the only step left', () => {
    const almost = freshPlayer({
      devPitVisited: true,
      roundsFinished: ['bug-squash'],
      ownedItems: ['beanbag'],
    });
    const main = status(evaluateQuests(QUEST_DEFINITIONS, almost), 'main');

    expect(main.progress).toBe(4);
    expect(main.nextHint).toEqual({ text: 'Finish Pancake Flip', location: 'THE KITCHEN' });
  });

  it('a best alone does not count as a finished round; a finished round at score 0 does', () => {
    const bestOnly = freshPlayer({ bests: { 'bug-squash': 300 } });
    const zeroRound = freshPlayer({ roundsFinished: ['bug-squash'] });

    expect(status(evaluateQuests(QUEST_DEFINITIONS, bestOnly), 'main').progress).toBe(1);
    expect(status(evaluateQuests(QUEST_DEFINITIONS, zeroRound), 'main').progress).toBe(2);
  });

  it('is done with no hint once all five steps are met', () => {
    const all = freshPlayer({
      devPitVisited: true,
      roundsFinished: ['bug-squash', 'pancake-flip'],
      ownedItems: ['beanbag'],
    });
    const main = status(evaluateQuests(QUEST_DEFINITIONS, all), 'main');

    expect(main.progress).toBe(5);
    expect(main.done).toBe(true);
    expect(main.nextHint).toBeNull();
  });

  it('shows 0 / 5 before the Penguin Creator has been completed', () => {
    const main = status(
      evaluateQuests(QUEST_DEFINITIONS, freshPlayer({ profileCreatedAt: null })),
      'main',
    );

    expect(main.progress).toBe(0);
    expect(main.nextHint).toEqual({ text: 'Create your Penguin', location: 'ANY ROOM' });
  });
});

describe('Minigame quest evaluation', () => {
  it('shows the personal best as progress against the Badge goal', () => {
    const bug = status(
      evaluateQuests(QUEST_DEFINITIONS, freshPlayer({ bests: { 'bug-squash': 320 } })),
      'bug-squash',
    );

    expect(bug.progress).toBe(320);
    expect(bug.target).toBe(500);
    expect(bug.done).toBe(false);
    expect(bug.nextHint).toEqual({ text: 'Score 500 in one round', location: 'DEV PIT' });
  });

  it('is done exactly when the best reaches the Badge threshold', () => {
    const at19 = freshPlayer({ bests: { 'pancake-flip': 19 } });
    const at20 = freshPlayer({ bests: { 'pancake-flip': 20 }, badges: ['breakfast-club'] });

    expect(status(evaluateQuests(QUEST_DEFINITIONS, at19), 'pancake-flip').done).toBe(false);
    expect(status(evaluateQuests(QUEST_DEFINITIONS, at20), 'pancake-flip').done).toBe(true);
  });

  it('starts at 0 with no best yet', () => {
    const snow = status(evaluateQuests(QUEST_DEFINITIONS, freshPlayer()), 'snow-cone-stand');

    expect(snow.progress).toBe(0);
    expect(snow.target).toBe(200);
  });
});

describe('questTransitions and step toasts', () => {
  it('reports each main step newly done, with the new count', () => {
    const before = evaluateQuests(QUEST_DEFINITIONS, freshPlayer({ ownedItems: ['beanbag'] }));
    const after = evaluateQuests(
      QUEST_DEFINITIONS,
      freshPlayer({ ownedItems: ['beanbag'], devPitVisited: true }),
    );

    const transitions = questTransitions(before, after);

    expect(transitions).toHaveLength(1);
    expect(stepToastMessage(transitions[0])).toBe('Quest: Visit the Dev Pit ✓ (3 / 5)');
  });

  it('reports a quest newly done', () => {
    const before = evaluateQuests(QUEST_DEFINITIONS, freshPlayer({ bests: { 'bug-squash': 480 } }));
    const after = evaluateQuests(QUEST_DEFINITIONS, freshPlayer({ bests: { 'bug-squash': 510 } }));

    expect(questTransitions(before, after)).toEqual([
      expect.objectContaining({ kind: 'quest-done', questId: 'bug-squash' }),
    ]);
  });

  it('reports nothing when nothing changed', () => {
    const same = evaluateQuests(QUEST_DEFINITIONS, freshPlayer());

    expect(questTransitions(same, evaluateQuests(QUEST_DEFINITIONS, freshPlayer()))).toEqual([]);
  });
});

describe('tracked quest', () => {
  const ids = ['main', 'bug-squash', 'pancake-flip', 'snow-cone-stand'];
  const inBuild = QUEST_DEFINITIONS.filter((q) => ids.includes(q.id));

  it('tracks the main quest by default', () => {
    expect(resolveTrackedQuestId(evaluateQuests(inBuild, freshPlayer()), null)).toBe('main');
  });

  it('keeps a remembered choice while it is still active', () => {
    expect(resolveTrackedQuestId(evaluateQuests(inBuild, freshPlayer()), 'pancake-flip')).toBe(
      'pancake-flip',
    );
  });

  it('ignores a remembered id that is not in the build', () => {
    expect(resolveTrackedQuestId(evaluateQuests(inBuild, freshPlayer()), 'hexle')).toBe('main');
  });

  it('switches from a finished quest to the next active one after it', () => {
    const statuses = evaluateQuests(
      inBuild,
      freshPlayer({ bests: { 'bug-squash': 500 }, badges: ['exterminator'] }),
    );

    expect(nextTrackedQuestId(statuses, 'bug-squash')).toBe('pancake-flip');
    expect(resolveTrackedQuestId(statuses, 'bug-squash')).toBe('pancake-flip');
  });

  it('wraps around to the first active quest', () => {
    const statuses = evaluateQuests(
      inBuild,
      freshPlayer({ bests: { 'snow-cone-stand': 250 }, badges: ['brain-freeze'] }),
    );

    expect(nextTrackedQuestId(statuses, 'snow-cone-stand')).toBe('main');
  });

  it('tracks nothing once every quest is done', () => {
    const statuses = evaluateQuests(
      inBuild,
      freshPlayer({
        devPitVisited: true,
        roundsFinished: ['bug-squash', 'pancake-flip'],
        ownedItems: ['beanbag'],
        bests: { 'bug-squash': 500, 'pancake-flip': 20, 'snow-cone-stand': 200 },
      }),
    );

    expect(resolveTrackedQuestId(statuses, 'main')).toBeNull();
  });
});

describe('all-done line', () => {
  it('offers exactly the five lines from the ticket', () => {
    expect(ALL_DONE_LINES).toEqual([
      'Overachiever. Noted.',
      'Work hard, waddle harder.',
      'Shipped it. Go touch snow.',
      'Nothing left to ship. Suspicious.',
      'Excellence is our approach to everything.',
    ]);
  });

  it('picks by the random source: the lowest value gives the first line, just under 1 the last', () => {
    expect(pickAllDoneLine(() => 0)).toBe('Overachiever. Noted.');
    expect(pickAllDoneLine(() => 0.5)).toBe('Shipped it. Go touch snow.');
    expect(pickAllDoneLine(() => 0.9999)).toBe('Excellence is our approach to everything.');
  });
});
