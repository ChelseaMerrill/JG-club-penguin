import './quests.css';

/** How long the QUEST COMPLETE banner stays up. */
export const QUEST_BANNER_MS = 4000;

export interface QuestBanner {
  /** Shows "QUEST COMPLETE", the Quest's title and the server's `tokensAwarded`. */
  show(questTitle: string, tokensAwarded: number): void;
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

  return {
    show(questTitle, tokensAwarded) {
      if (timer !== null) clearTimeout(timer);
      title.textContent = questTitle;
      reward.textContent = `+${tokensAwarded} TOKENS`;
      banner.hidden = false;
      timer = setTimeout(() => {
        banner.hidden = true;
        timer = null;
      }, QUEST_BANNER_MS);
    },
    destroy() {
      if (timer !== null) clearTimeout(timer);
      banner.remove();
    },
  };
}
