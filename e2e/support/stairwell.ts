import type { Page } from '@playwright/test';

/**
 * Starts recording whether the Elevator overlay is ever shown from now on
 * (#51 slice 4, S4-D6): a `MutationObserver` on `.elevator-screen`'s
 * `hidden` attribute, so even a show too brief for a poll to catch counts.
 * Read it back with `elevatorSeen`.
 */
export async function watchElevator(page: Page): Promise<void> {
  await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>('.elevator-screen');
    if (!overlay) throw new Error('.elevator-screen not found in the DOM');
    document.body.dataset.elevatorSeen = overlay.hidden ? 'no' : 'yes';
    new MutationObserver(() => {
      if (!overlay.hidden) document.body.dataset.elevatorSeen = 'yes';
    }).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
  });
}

/** Whether the Elevator overlay was shown since `watchElevator`. */
export async function elevatorSeen(page: Page): Promise<boolean> {
  return (await page.evaluate(() => document.body.dataset.elevatorSeen)) === 'yes';
}
