import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUEST_DEFINITIONS } from '../quests/quest-definitions';
import type { QuestStatus } from '../quests/quest-engine';
import { NPCS, type NpcId } from './npcs';
import {
  clearQuestStarters,
  hasQuestStarter,
  registerQuestStarter,
  resolveQuestGiverResponse,
  startQuest,
} from './quest-giver';

/** A steps Quest whose first step, "talk to the giver", starts it. */
function stepsQuest(done: { talk: boolean; other: boolean }): QuestStatus {
  const step = (id: string, isDone: boolean) => ({
    step: { id, label: id, hint: id, roomId: null },
    done: isDone,
  });
  const steps = [step('talk-to-giver', done.talk), step('do-the-thing', done.other)];
  return {
    quest: {
      kind: 'steps',
      id: 'main',
      title: 'Fix the flaky test',
      location: 'DEV PIT',
      steps: [],
      rewardTokens: 150,
    },
    progress: steps.filter((s) => s.done).length,
    target: 2,
    done: false,
    // A test fixture: real step ids are a closed union today.
    steps: steps as unknown as QuestStatus['steps'],
    nextHint: null,
  };
}

/** A Minigame Quest (no steps), at `best` of `goal`. */
function minigameQuest(best: number, goal = 3, done = false): QuestStatus {
  return {
    quest: {
      kind: 'minigame',
      id: 'bug-squash',
      minigameId: 'bug-squash',
      title: 'Let It Rip',
      location: 'TEAM ROOM 4',
      goalKind: 'best',
      goal,
      hint: 'Win 3',
      roomId: 'team-room-4',
      hintLocation: 'TEAM ROOM 4',
    },
    progress: best,
    target: goal,
    done,
    steps: [],
    nextHint: null,
  };
}

const yes = () => true;
const no = () => false;

afterEach(() => {
  clearQuestStarters();
});

describe('resolveQuestGiverResponse', () => {
  it('answers with the nothing-right-now line when no Quest status exists', () => {
    expect(resolveQuestGiverResponse({ nothingRightNowLine: 'Not now.' }, undefined, yes)).toEqual({
      kind: 'nothing',
      text: 'Not now.',
    });
  });

  it('returns null (no button) with no Quest status and no line', () => {
    expect(resolveQuestGiverResponse({}, undefined, yes)).toBeNull();
    expect(resolveQuestGiverResponse({ questId: 'main' }, undefined, yes)).toBeNull();
  });

  it('says "Thanks again!" once the Quest is done', () => {
    expect(
      resolveQuestGiverResponse({ questId: 'bug-squash' }, minigameQuest(3, 3, true), yes),
    ).toEqual({
      kind: 'done',
      text: 'Thanks again!',
    });
  });

  it('starts a not-started Quest when a starter is registered', () => {
    expect(resolveQuestGiverResponse({ questId: 'bug-squash' }, minigameQuest(0), yes)).toEqual({
      kind: 'start',
      questId: 'bug-squash',
    });
  });

  it('shows progress for a not-started Quest with no starter', () => {
    expect(resolveQuestGiverResponse({ questId: 'bug-squash' }, minigameQuest(0), no)).toEqual({
      kind: 'progress',
      text: 'Let It Rip · 0 / 3',
    });
  });

  it('shows progress for a Quest in progress', () => {
    expect(resolveQuestGiverResponse({ questId: 'bug-squash' }, minigameQuest(2), yes)).toEqual({
      kind: 'progress',
      text: 'Let It Rip · 2 / 3',
    });
  });

  it('uses startStepId: not started until that step is done, even when other steps are', () => {
    const giver = { questId: 'main', startStepId: 'talk-to-giver' };
    expect(resolveQuestGiverResponse(giver, stepsQuest({ talk: false, other: true }), yes)).toEqual(
      { kind: 'start', questId: 'main' },
    );
    expect(resolveQuestGiverResponse(giver, stepsQuest({ talk: true, other: false }), yes)).toEqual(
      {
        kind: 'progress',
        text: 'Fix the flaky test · 1 / 2',
      },
    );
  });
});

describe('the Quest starter registry', () => {
  it('starts empty, and runs a registered starter', () => {
    expect(hasQuestStarter('beystadium')).toBe(false);
    startQuest('beystadium');
    const start = vi.fn();
    registerQuestStarter('beystadium', start);
    expect(hasQuestStarter('beystadium')).toBe(true);
    startQuest('beystadium');
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('quest-giver data (#144 D5, Q17)', () => {
  it('marks exactly the one named appearance of each quest giver', () => {
    const givers = (Object.keys(NPCS) as NpcId[]).filter((id) => NPCS[id].questGiver).sort();
    expect(givers).toEqual(
      // Jon's and Sydney's moved to their remaining appearances when they left
      // Town Center (owner request, 2026-10-02, Track D).
      [
        'ashley',
        'casey',
        'dom-team-room-1',
        'ian',
        'jon-mullet',
        'jory',
        'linda-martin',
        'michael',
        'nicole',
        'sydney-team-room-3',
      ].sort(),
    );
  });

  it('gives only Jon a nothing-right-now line so far, verbatim from #144', () => {
    const withLine = (Object.keys(NPCS) as NpcId[]).filter(
      (id) => NPCS[id].questGiver?.nothingRightNowLine !== undefined,
    );
    expect(withLine).toEqual(['jon-mullet']);
    expect(NPCS['jon-mullet'].questGiver?.nothingRightNowLine).toBe(
      'Just enjoy the tour. Sunglasses stay on.',
    );
  });

  it('only connects Quests that exist in QUEST_DEFINITIONS', () => {
    const questIds = new Set<string>(QUEST_DEFINITIONS.map((quest) => quest.id));
    for (const npc of Object.values(NPCS)) {
      const questId = npc.questGiver?.questId;
      if (questId !== undefined) expect(questIds, npc.id).toContain(questId);
    }
  });
});
