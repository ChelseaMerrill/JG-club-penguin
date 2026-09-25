// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestView } from '../quests/quest-controller';
import { QUEST_DEFINITIONS } from '../quests/quest-definitions';
import { evaluateQuests, type QuestInputs } from '../quests/quest-engine';
import { createQuestsPanel, type QuestsPanel } from './quests-panel';

const IN_BUILD = QUEST_DEFINITIONS.filter((q) =>
  ['main', 'bug-squash', 'pancake-flip', 'snow-cone-stand'].includes(q.id),
);

function viewOf(overrides: Partial<QuestInputs>, trackedId: string | null = 'main'): QuestView {
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
    allDoneLine: 'Overachiever. Noted.',
  };
}

let panel: QuestsPanel | undefined;

function setup() {
  const root = document.createElement('div');
  document.body.append(root);
  const onTrack = vi.fn();
  const onBadges = vi.fn();
  const onClose = vi.fn();
  panel = createQuestsPanel(root, { onTrack, onBadges, onClose });
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const rows = () => [...root.querySelectorAll<HTMLElement>('.quests__row')];
  const text = (row: HTMLElement, selector: string) => row.querySelector(selector)?.textContent;
  return { root, panel, onTrack, onBadges, onClose, q, rows, text };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  panel?.destroy();
  panel = undefined;
});

describe('createQuestsPanel', () => {
  it('opens on the ACTIVE tab with counts and one row per active Quest', () => {
    const { panel, q, rows, text } = setup();
    panel.render(viewOf({ bests: { 'bug-squash': 500 }, badges: ['exterminator'] }));

    panel.open();

    expect(q('.quests').hidden).toBe(false);
    expect(q('[data-quests-tab="active"]').textContent).toBe('ACTIVE · 3');
    expect(q('[data-quests-tab="done"]').textContent).toBe('DONE · 1');
    expect(q('[data-quests-tab="badges"]').textContent).toBe('BADGES');
    expect(rows().map((row) => row.dataset.questId)).toEqual([
      'main',
      'pancake-flip',
      'snow-cone-stand',
    ]);
    const main = rows()[0];
    expect(text(main, '.quests__row-number')).toBe('1');
    expect(text(main, '.quests__row-title')).toBe('Ship something before the ice melts');
    expect(text(main, '.quests__row-location')).toBe('MAIN · ANY ROOM');
    expect(text(main, '.quests__row-progress')).toBe('1 / 5');
    expect(text(main, '.quests__row-reward')).toBe('150');
    expect(text(rows()[1], '.quests__row-location')).toBe('THE KITCHEN · TALK TO CHELSEA');
    expect(text(rows()[1], '.quests__row-reward')).toBe('BADGE · +50');
  });

  it('shows a Minigame Quest as best / goal', () => {
    const { panel, rows, text } = setup();
    panel.render(viewOf({ bests: { 'bug-squash': 320 } }));
    panel.open();

    const bug = rows().find((row) => row.dataset.questId === 'bug-squash')!;
    expect(text(bug, '.quests__row-progress')).toBe('320 / 500');
    expect(text(bug, '.quests__row-location')).toBe('DEV PIT · TALK TO IAN');
  });

  it('labels the tracked Quest TRACKING; TRACK tracks the selected row', () => {
    const { panel, rows, text, q, onTrack } = setup();
    panel.render(viewOf({}));
    panel.open();

    expect(text(rows()[0], '.quests__row-status')).toBe('TRACKING');
    expect(q<HTMLButtonElement>('.quests__track').disabled).toBe(true);

    rows()[2].click();
    expect(rows()[2].getAttribute('aria-pressed')).toBe('true');
    expect(q<HTMLButtonElement>('.quests__track').disabled).toBe(false);
    q<HTMLButtonElement>('.quests__track').click();

    expect(onTrack).toHaveBeenCalledWith('pancake-flip');
  });

  it('lists finished Quests on the DONE tab, without TRACK', () => {
    const { panel, rows, text, q } = setup();
    panel.render(viewOf({ bests: { 'pancake-flip': 24 } }));

    panel.open('done');

    expect(rows().map((row) => row.dataset.questId)).toEqual(['pancake-flip']);
    expect(text(rows()[0], '.quests__row-status')).toBe('DONE');
    expect(q('.quests__track').hidden).toBe(true);
  });

  it('opens the Trophy Case from the BADGES tab', () => {
    const { panel, q, onBadges } = setup();
    panel.render(viewOf({}));
    panel.open();

    q<HTMLButtonElement>('[data-quests-tab="badges"]').click();

    expect(onBadges).toHaveBeenCalledTimes(1);
  });

  it('drops the design\'s countdown, noon-board footer and "DEMO BY 5PM"', () => {
    const { panel, root } = setup();
    panel.render(viewOf({}));
    panel.open();

    expect(root.textContent).toContain('Tracked quest shows on your HUD.');
    expect(root.textContent).not.toMatch(/LEFT|noon|DEMO BY 5PM/);
  });

  it('closes from its ✕ button', () => {
    const { panel, q, onClose } = setup();
    panel.render(viewOf({}));
    panel.open();

    q<HTMLButtonElement>('.quests__close').click();

    expect(onClose).toHaveBeenCalledTimes(1);
    panel.close();
    expect(q('.quests').hidden).toBe(true);
    expect(panel.isOpen()).toBe(false);
  });
});
