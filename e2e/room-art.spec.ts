import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOM_IDS } from '../src/contracts';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';

// isolib's `P(x,y) = [OX+(x-y)*S, OY+(x+y)*S/2]` (`design/build/isolib.js`),
// with the Town Center grid's `OX=800, OY=250, S=50` (`src/game/rooms/
// definitions/town-center.ts`): the screen point just inside the floor's far
// corner, tile P(0,10) -- one row past the last real row, i.e. the floor
// diamond's own bottom-left vertex. #16 fix 1: the export script used to clip
// the browser *viewport* instead of the Stage element, shifting every
// exported PNG by about (+40, +40) (the design's outer <section> padding),
// which put this point over the black Stage letterbox instead of the floor.
const FLOOR_CORNER_X = 300;
const FLOOR_CORNER_Y = 500;

// `design/Room 01 Town Center.dc.html`'s Stage `<rect>` fill (every Room's
// Stage shares it) -- the empty backdrop behind/around the isometric room,
// as opposed to any floor, wall or prop colour drawn on top of it.
const LETTERBOX_COLOR: readonly [number, number, number] = [0x0e, 0x10, 0x13];
const COLOR_TOLERANCE = 12;

function isCloseToLetterboxColor(rgb: readonly [number, number, number]): boolean {
  return rgb.every((channel, i) => Math.abs(channel - LETTERBOX_COLOR[i]) <= COLOR_TOLERANCE);
}

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
  const images: Array<{ id: (typeof ROOM_IDS)[number]; dataUri: string }> = [];

  for (const id of ROOM_IDS) {
    const filePath = path.join(roomsDir, `${id}.png`);
    const buf = await readFile(filePath);
    const { width, height } = readPngSize(buf);
    expect(width, `${id}.png width`).toBe(GAME_WIDTH);
    expect(height, `${id}.png height`).toBe(GAME_HEIGHT);
    images.push({ id, dataUri: `data:image/png;base64,${buf.toString('base64')}` });
  }

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Guards against the export being offset from the Stage again (#16 fix 1):
  // decoded in the page via a canvas, since pngjs isn't a project dependency.
  const townCenter = images.find((image) => image.id === 'town-center')!;
  const floorCornerPixel = await page.evaluate(
    async ({ dataUri, x, y }) => {
      const img = new Image();
      img.src = dataUri;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      return [r, g, b] as const;
    },
    { dataUri: townCenter.dataUri, x: FLOOR_CORNER_X, y: FLOOR_CORNER_Y },
  );
  expect(
    isCloseToLetterboxColor(floorCornerPixel),
    `town-center.png's pixel at isolib's floor corner P(0,10)=(${FLOOR_CORNER_X},${FLOOR_CORNER_Y}) reads as the Stage letterbox colour (${floorCornerPixel.join(',')}), not the floor -- the export is likely offset from the Stage (#16 fix 1)`,
  ).toBe(false);

  const thumbWidth = 320;
  const thumbHeight = Math.round((thumbWidth * GAME_HEIGHT) / GAME_WIDTH);
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

  await expect(page.locator('img')).toHaveCount(ROOM_IDS.length);
  for (const { id } of images) {
    await expect(page.locator(`figcaption:text-is("${id}")`)).toBeVisible();
  }

  expect(errors).toEqual([]);

  await page.screenshot({ path: 'test-results/room-art/contact-sheet.png', fullPage: true });
});
