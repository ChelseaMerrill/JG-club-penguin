// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuestBanner, QUEST_BANNER_MS } from './quest-banner';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createQuestBanner', () => {
  it('shows QUEST COMPLETE with the Quest title and the reward, then hides itself', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const banner = createQuestBanner(root);
    const el = () => root.querySelector<HTMLElement>('.quest-banner')!;

    expect(el().hidden).toBe(true);
    banner.show('Ship something before the ice melts', 150);

    expect(el().hidden).toBe(false);
    expect(el().getAttribute('role')).toBe('status');
    expect(el().querySelector('.quest-banner__heading')?.textContent).toBe('QUEST COMPLETE');
    expect(el().querySelector('.quest-banner__title')?.textContent).toBe(
      'Ship something before the ice melts',
    );
    expect(el().querySelector('.quest-banner__reward')?.textContent).toBe('+150 TOKENS');

    vi.advanceTimersByTime(QUEST_BANNER_MS);
    expect(el().hidden).toBe(true);
  });
});
