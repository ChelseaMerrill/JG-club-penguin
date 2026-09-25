import type { QuestView } from '../quests/quest-controller';
import { progressPercent, type QuestsTab } from './quests-panel';
import './quests.css';

export interface QuestWidgetOptions {
  /** Opens the Quests panel: ACTIVE normally, DONE once every Quest is done. */
  onOpen: (tab: QuestsTab) => void;
}

export interface QuestWidget {
  render(view: QuestView | null): void;
  /** Hides the widget while the Quests panel itself is open (design HUD-QUESTS). */
  setSuppressed(suppressed: boolean): void;
}

/**
 * The HUD quest widget (#46, design HUD-TOWN's top-right box): "QUEST x / y",
 * the tracked Quest's title, a progress bar and the next unfinished step
 * with its location ("Finish Pancake Flip · THE KITCHEN ↘", arrow
 * decorative). Once every Quest is done: "ALL QUESTS DONE" and a random line.
 * Clicking it opens the Quests panel.
 */
export function createQuestWidget(slot: HTMLElement, options: QuestWidgetOptions): QuestWidget {
  let view: QuestView | null = null;
  let suppressed = false;

  const widget = document.createElement('button');
  widget.type = 'button';
  widget.className = 'quest-widget';
  widget.hidden = true;

  const head = document.createElement('div');
  head.className = 'quest-widget__head';
  const label = document.createElement('span');
  label.className = 'quest-widget__label';
  const count = document.createElement('span');
  count.className = 'quest-widget__count';
  head.append(label, count);

  const title = document.createElement('div');
  title.className = 'quest-widget__title';

  const bar = document.createElement('div');
  bar.className = 'quest-widget__bar';
  const fill = document.createElement('div');
  fill.className = 'quest-widget__bar-fill';
  bar.append(fill);

  const hint = document.createElement('div');
  hint.className = 'quest-widget__hint';
  const hintText = document.createElement('span');
  hintText.className = 'quest-widget__hint-text';
  const hintArrow = document.createElement('span');
  hintArrow.className = 'quest-widget__hint-arrow';
  hintArrow.setAttribute('aria-hidden', 'true');
  hintArrow.textContent = ' ↘';
  hint.append(hintText, hintArrow);

  widget.append(head, title, bar, hint);
  slot.append(widget);

  function allDone(): boolean {
    return view !== null && view.trackedId === null;
  }

  widget.addEventListener('click', () => options.onOpen(allDone() ? 'done' : 'active'));

  function render(next: QuestView | null): void {
    view = next;
    const tracked = next?.statuses.find((s) => s.quest.id === next.trackedId) ?? null;
    widget.classList.toggle('quest-widget--all-done', allDone());
    if (next && allDone()) {
      label.textContent = 'ALL QUESTS DONE';
      count.hidden = true;
      title.textContent = next.allDoneLine;
      bar.hidden = true;
      hint.hidden = true;
      widget.setAttribute('aria-label', `All quests done. ${next.allDoneLine}`);
    } else if (tracked) {
      label.textContent = 'QUEST';
      count.hidden = false;
      count.textContent = `${tracked.progress} / ${tracked.target}`;
      title.textContent = tracked.quest.title;
      bar.hidden = false;
      fill.style.width = `${progressPercent(tracked)}%`;
      hint.hidden = tracked.nextHint === null;
      hintText.textContent = tracked.nextHint
        ? `${tracked.nextHint.text} · ${tracked.nextHint.location}`
        : '';
      widget.setAttribute(
        'aria-label',
        `Quest ${count.textContent}: ${tracked.quest.title}. Open quests`,
      );
    }
    widget.hidden = suppressed || next === null || (!tracked && !allDone());
  }

  return {
    render,
    setSuppressed(value) {
      suppressed = value;
      render(view);
    },
  };
}
