import { expect, test, type Page } from '@playwright/test';
import type { FeedbackTestHandle } from '../src/feedback/feedback-test-handle';
import type { HudTestHandle } from '../src/ui/hud/hud-test-handle';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { ROOM_DEFINITIONS } from './support/room-definitions';

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

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test("feedback-button-clears-every-room's-doors, the chat and the bottom bar (#169)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openHudInDevPit(page);

  // Stage pixels: the HUD is part of the Stage, so measure against the canvas.
  const stage = await page.locator('#game canvas').boundingBox();
  if (!stage) throw new Error('canvas not visible');
  const scale = stage.width / GAME_WIDTH;
  const toStage = (box: Rect | null): Rect => {
    if (!box) throw new Error('element not visible');
    return {
      x: (box.x - stage.x) / scale,
      y: (box.y - stage.y) / scale,
      width: box.width / scale,
      height: box.height / scale,
    };
  };
  const button = toStage(await page.getByRole('button', { name: 'Send feedback' }).boundingBox());

  expect(button.x).toBeGreaterThanOrEqual(0);
  expect(button.x + button.width).toBeLessThanOrEqual(GAME_WIDTH);
  expect(button.y + button.height).toBeLessThanOrEqual(GAME_HEIGHT);
  // Above the bottom-right exit pills' row (the designs' `bottom: 112px`, 40px tall).
  expect(button.y + button.height).toBeLessThanOrEqual(748);
  expect(intersects(button, toStage(await page.locator('.hud__chat-input').boundingBox()))).toBe(
    false,
  );
  expect(intersects(button, toStage(await page.locator('.hud__bottom-bar').boundingBox()))).toBe(
    false,
  );

  // The HUD (and so the button) is the same in every Room.
  const overlaps: string[] = [];
  for (const room of Object.values(ROOM_DEFINITIONS)) {
    for (const door of room.doors) {
      if (intersects(button, door.hotspot)) overlaps.push(`${room.id} door ${door.label}`);
    }
    for (const hotspot of room.hotspots ?? []) {
      if (intersects(button, hotspot.rect)) overlaps.push(`${room.id} hotspot ${hotspot.id}`);
    }
  }
  expect(overlaps).toEqual([]);

  expect(errors).toEqual([]);
});
