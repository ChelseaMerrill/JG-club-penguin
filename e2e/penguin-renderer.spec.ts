import { expect, test } from '@playwright/test';
import { DEFAULT_LOOK, EYES, HATS, IDLE_EMOTES, PATTERNS } from '../src/contracts';
import { PENGUIN_FRAMES, type PenguinAnim } from '../src/game/penguin/poses';
import { renderPenguinSvg } from '../src/game/penguin/render-svg';

// Renders `renderPenguinSvg` in this Node test process (not the browser under
// test) and drops the resulting SVG markup straight into the page, so the
// screenshot is the renderer's real output rather than a re-implementation.

interface GridRow {
  label: string;
  svg: string;
}

const ALL_ANIMS: readonly PenguinAnim[] = [...IDLE_EMOTES, 'WALK'];

function buildRows(): GridRow[] {
  const rows: GridRow[] = [];

  for (const hat of HATS) {
    rows.push({ label: `HAT · ${hat}`, svg: renderPenguinSvg({ ...DEFAULT_LOOK, hat }) });
  }
  for (const pattern of PATTERNS) {
    rows.push({
      label: `PATTERN · ${pattern}`,
      svg: renderPenguinSvg({ ...DEFAULT_LOOK, pattern }),
    });
  }
  for (const eyes of EYES) {
    rows.push({ label: `EYES · ${eyes}`, svg: renderPenguinSvg({ ...DEFAULT_LOOK, eyes }) });
  }
  for (const anim of ALL_ANIMS) {
    const frameCount = PENGUIN_FRAMES[anim];
    for (let frame = 0; frame < frameCount; frame++) {
      rows.push({
        label: `ANIM · ${anim} · frame ${frame}`,
        svg: renderPenguinSvg({ ...DEFAULT_LOOK, emote: 'WADDLE' }, { anim, frame }),
      });
    }
  }

  return rows;
}

function buildHtml(rows: GridRow[]): string {
  const rowsHtml = rows
    .map((row) => `<div class="row"><span class="label">${row.label}</span>${row.svg}</div>`)
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; background: #0E1013; color: #F4F4F4; font-family: sans-serif; }
  .grid { display: flex; flex-direction: column; gap: 4px; padding: 16px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .label { width: 220px; font-size: 12px; flex: none; }
  svg { flex: none; }
</style>
</head>
<body>
<div class="grid">
${rowsHtml}
</div>
</body>
</html>`;
}

test('penguin-renderer-grid', async ({ page }) => {
  const rows = buildRows();

  await page.setContent(buildHtml(rows));

  await expect(page.locator('svg')).toHaveCount(rows.length);

  await page.screenshot({
    path: 'test-results/penguin-renderer-grid/screenshot.png',
    fullPage: true,
  });
});
