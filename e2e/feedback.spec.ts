import { expect, test, type Page } from '@playwright/test';
import type { FeedbackTestHandle } from '../src/feedback/feedback-test-handle';
import type { HudTestHandle } from '../src/ui/hud/hud-test-handle';

declare global {
  interface Window {
    __hudTest?: HudTestHandle;
    __feedbackTest?: FeedbackTestHandle;
  }
}

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** The signed-in HUD via the `?hud` dev hook, at Stage scale 1, in the Dev Pit. */
async function openHudInDevPit(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1618, height: 918 });
  await page.goto('/?hud');
  await expect(page.locator('.hud')).toBeVisible();
  await page.evaluate(() => window.__hudTest!.emitRoomEnter('dev-pit'));
  await expect(page.locator('.hud__title')).toHaveText(/^dev pit$/i);
}

test('feedback-send-suggestion', async ({ page }) => {
  const errors = collectErrors(page);
  await openHudInDevPit(page);

  const icon = page.getByRole('button', { name: 'Send feedback' });
  await expect(icon).toBeVisible();
  await page.screenshot({ path: 'test-results/feedback/01-hud-with-icon.png' });

  await icon.click();
  const modal = page.getByRole('dialog', { name: 'FEEDBACK' });
  await expect(modal).toBeVisible();
  await expect(modal.locator('.feedback__room')).toHaveText(/^Room: dev pit$/i);

  await modal.getByRole('button', { name: 'MAKE A SUGGESTION' }).click();
  await expect(modal.getByRole('button', { name: 'MAKE A SUGGESTION' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const textarea = modal.getByRole('textbox', { name: 'Your message' });
  await textarea.click();
  await page.keyboard.type('Add a hot cocoa stall to the Roof Deck');
  await expect(modal.locator('.feedback__counter')).toHaveText('38 / 2000');
  // Typing never reached a game hotkey or the overlay manager.
  await expect(modal).toBeVisible();
  await expect(page.locator('.emote-picker')).toBeHidden();
  await page.screenshot({ path: 'test-results/feedback/02-modal-filled.png' });

  await modal.getByRole('button', { name: 'SEND' }).click();

  await expect(modal).toBeHidden();
  await expect(page.locator('.hud__toast')).toHaveText('Thanks! Your feedback was sent.');
  await page.screenshot({ path: 'test-results/feedback/03-sent-toast.png' });

  const submissions = await page.evaluate(() => window.__feedbackTest!.submissions());
  expect(submissions).toEqual([
    {
      id: expect.any(String),
      kind: 'suggestion',
      message: 'Add a hot cocoa stall to the Roof Deck',
      roomId: 'dev-pit',
      clientInfo: expect.stringMatching(/^1618x918 /),
    },
  ]);

  expect(errors).toEqual([]);
});

test('feedback-rate-limited', async ({ page }) => {
  const errors = collectErrors(page);
  await openHudInDevPit(page);

  const icon = page.getByRole('button', { name: 'Send feedback' });
  const modal = page.getByRole('dialog', { name: 'FEEDBACK' });
  const textarea = modal.getByRole('textbox', { name: 'Your message' });

  // The fake allows 5 submissions per 10 minutes, like submit_feedback.
  for (let i = 1; i <= 5; i += 1) {
    await icon.click();
    await textarea.fill(`Issue number ${i}`);
    await modal.getByRole('button', { name: 'SEND' }).click();
    await expect(modal).toBeHidden();
  }

  await icon.click();
  await textarea.fill('One issue too many');
  await modal.getByRole('button', { name: 'SEND' }).click();

  await expect(modal.getByRole('alert')).toHaveText(
    'Too many messages — try again in a few minutes.',
  );
  await expect(modal).toBeVisible();
  await expect(textarea).toHaveValue('One issue too many');
  await page.screenshot({ path: 'test-results/feedback/04-rate-limited.png' });

  expect(await page.evaluate(() => window.__feedbackTest!.submissions().length)).toBe(5);

  // Escape still closes it.
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();

  expect(errors).toEqual([]);
});
