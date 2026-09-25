// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestView } from '../quests/quest-controller';
import { QUEST_DEFINITIONS } from '../quests/quest-definitions';
import { evaluateQuests, type QuestInputs } from '../quests/quest-engine';
import { createQuestWidget } from './quest-widget';

const IN_BUILD = QUEST_DEFINITIONS.filter((q) =>
  ['main', 'bug-squash', 'pancake-flip'].includes(q.id),
);

function viewOf(overrides: Partial<QuestInputs>, trackedId: string | null): QuestView {
  return {
    statuses: evaluateQuests(IN_BUILD, {
      profileCreatedAt: '2026-09-25T09:00:00.000Z',
      bests: {},
      badges: [],
      ownedItems: [],
      devPitVisited: false,
      roundsFinished: [],
      completedQuests: [],
      ...overrides,
    }),
    trackedId,
    allDoneLine: 'Work hard, waddle harder.',
  };
}

function setup() {
  const slot = document.createElement('div');
  document.body.append(slot);
  const onOpen = vi.fn();
  const widget = createQuestWidget(slot, { onOpen });
  const q = (selector: string) => slot.querySelector<HTMLElement>(selector);
  return { slot, widget, onOpen, q };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createQuestWidget', () => {
  it('is hidden until there is a view', () => {
    const { q } = setup();

    expect(q('.quest-widget')?.hidden).toBe(true);
  });

  it('shows the tracked Quest, its count and the next step with its location', () => {
    const { widget, q } = setup();

    widget.render(
      viewOf({ devPitVisited: true, roundsFinished: ['bug-squash'], ownedItems: ['desk'] }, 'main'),
    );

    expect(q('.quest-widget')?.hidden).toBe(false);
    expect(q('.quest-widget__label')?.textContent).toBe('QUEST');
    expect(q('.quest-widget__count')?.textContent).toBe('4 / 5');
    expect(q('.quest-widget__title')?.textContent).toBe('Ship something before the ice melts');
    expect(q('.quest-widget__hint-text')?.textContent).toBe('Finish Pancake Flip · THE KITCHEN');
    expect(q('.quest-widget__hint-arrow')?.getAttribute('aria-hidden')).toBe('true');
    expect(q('.quest-widget__bar-fill')?.style.width).toBe('80%');
  });

  it('opens the panel on the ACTIVE tab when clicked', () => {
    const { widget, q, onOpen } = setup();
    widget.render(viewOf({}, 'main'));

    q('.quest-widget')?.click();

    expect(onOpen).toHaveBeenCalledWith('active');
  });

  it('shows ALL QUESTS DONE with the chosen line, and opens the DONE tab', () => {
    const { widget, q, onOpen } = setup();
    widget.render(viewOf({}, null));

    expect(q('.quest-widget__label')?.textContent).toBe('ALL QUESTS DONE');
    expect(q('.quest-widget__title')?.textContent).toBe('Work hard, waddle harder.');
    expect(q('.quest-widget__count')?.hidden).toBe(true);
    q('.quest-widget')?.click();

    expect(onOpen).toHaveBeenCalledWith('done');
  });

  it('can be hidden while the panel is open', () => {
    const { widget, q } = setup();
    widget.render(viewOf({}, 'main'));

    widget.setSuppressed(true);
    expect(q('.quest-widget')?.hidden).toBe(true);
    widget.setSuppressed(false);
    expect(q('.quest-widget')?.hidden).toBe(false);
  });
});
