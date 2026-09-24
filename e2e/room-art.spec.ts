import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOMS = ['town-center', 'dev-pit', 'the-melt', 'roof-deck', 'igloo'] as const;

const STAGE_WIDTH = 1600;
const STAGE_HEIGHT = 900;

/** Reads a PNG's width/height straight out of its IHDR chunk (bytes 16-23). */
function readPngSize(buf: Buffer): { width: number; height: number } {
  const isPng =
    buf.length > 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  if (!isPng) throw new Error('not a PNG file (bad signature)');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('room-art', async ({ page }) => {
  const roomsDir = path.join(process.cwd(), 'public', 'rooms');
  const images: Array<{ id: (typeof ROOMS)[number]; dataUri: string }> = [];

  for (const id of ROOMS) {
    const filePath = path.join(roomsDir, `${id}.png`);
    const buf = await readFile(filePath);
    const { width, height } = readPngSize(buf);
    expect(width, `${id}.png width`).toBe(STAGE_WIDTH);
    expect(height, `${id}.png height`).toBe(STAGE_HEIGHT);
    images.push({ id, dataUri: `data:image/png;base64,${buf.toString('base64')}` });
  }

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const thumbWidth = 320;
  const thumbHeight = Math.round((thumbWidth * STAGE_HEIGHT) / STAGE_WIDTH);
  const cards = images
    .map(
      ({ id, dataUri }) => `
        <figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:8px;">
          <img src="${dataUri}" width="${thumbWidth}" height="${thumbHeight}"
               style="display:block;border:1px solid #333;background:#000;" />
          <figcaption style="font:14px monospace;color:#eee;">${id}</figcaption>
        </figure>`,
    )
    .join('\n');

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="margin:0;padding:24px;background:#111;">
        <div style="display:flex;flex-wrap:wrap;gap:24px;">
          ${cards}
        </div>
      </body>
    </html>
  `);

  await expect(page.locator('img')).toHaveCount(ROOMS.length);
  for (const { id } of images) {
    await expect(page.locator(`figcaption:text-is("${id}")`)).toBeVisible();
  }

  expect(errors).toEqual([]);

  await page.screenshot({ path: 'test-results/room-art/contact-sheet.png', fullPage: true });
});
