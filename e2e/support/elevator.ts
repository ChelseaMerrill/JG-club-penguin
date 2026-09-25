import { expect, type Page } from '@playwright/test';

/** Generous CI-jitter slack on top of the Elevator's own 1.2s minimum ride time (#52). */
const ELEVATOR_HIDE_TIMEOUT = 15_000;

/**
 * A Room change that crosses a floor (Town Center <-> Roof Deck/The Melt)
 * is covered by #52's Elevator overlay, which swallows clicks for at least
 * its own 1.2s minimum; callers must wait for it to hide before their next
 * click or assertion. A harmless no-op wait for a same-floor crossing, since
 * the overlay is already hidden in that case. Shared by every e2e spec that
 * crosses a floor (#52 review standards nit), rather than each spec
 * redeclaring its own copy.
 */
export async function waitForElevatorHidden(page: Page): Promise<void> {
  await expect(page.locator('.elevator-screen')).toBeHidden({ timeout: ELEVATOR_HIDE_TIMEOUT });
}
