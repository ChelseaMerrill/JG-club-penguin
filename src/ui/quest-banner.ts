import './quests.css';

/** How long the QUEST COMPLETE banner stays up. */
export const QUEST_BANNER_MS = 4000;

export interface QuestBanner {
  /** Shows "QUEST COMPLETE", the Quest's title and the server's `tokensAwarded`. */
  show(questTitle: string, tokensAwarded: number): void;
  /** True while the banner is showing (#138: the Badge popup waits for it). */
  isVisible(): boolean;
  /**
   * Calls `listener(true)` when `show()` makes the banner visible and
   * `listener(false)` when its timer or `destroy()` hides it. Returns an
   * unsubscribe function.
   */
  onVisibilityChange(listener: (visible: boolean) => void): () => void;
  destroy(): void;
}

/**
 * The QUEST COMPLETE banner (#46), styled like the Minigame done screen's
 * "Badge unlocked" panel (`.minigame__done-badge`): hex icon, heading, the
 * Quest title and the reward. Never clickable; hides itself.
 */
export function createQuestBanner(root: HTMLElement): QuestBanner {
  const banner = document.createElement('div');
  banner.className = 'quest-banner';
  banner.hidden = true;
  banner.setAttribute('role', 'status');

  const icon = document.createElement('span');
  icon.className = 'quest-banner__icon';
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('div');
  text.className = 'quest-banner__text';
  const heading = document.createElement('div');
  heading.className = 'quest-banner__heading';
  heading.textContent = 'QUEST COMPLETE';
  const title = document.createElement('div');
  title.className = 'quest-banner__title';
  const reward = document.createElement('div');
  reward.className = 'quest-banner__reward';
  text.append(heading, title, reward);
  banner.append(icon, text);
  root.append(banner);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(visible: boolean) => void>();

  function setVisible(visible: boolean): void {
    const changed = banner.hidden === visible;
    banner.hidden = !visible;
    if (!changed) return;
    for (const listener of [...listeners]) listener(visible);
  }

  return {
    show(questTitle, tokensAwarded) {
      if (timer !== null) clearTimeout(timer);
      title.textContent = questTitle;
      reward.textContent = `+${tokensAwarded} TOKENS`;
      setVisible(true);
      timer = setTimeout(() => {
        timer = null;
        setVisible(false);
      }, QUEST_BANNER_MS);
    },
    isVisible: () => !banner.hidden,
    onVisibilityChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      setVisible(false);
      listeners.clear();
      banner.remove();
    },
  };
}
