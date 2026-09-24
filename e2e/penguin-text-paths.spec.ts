import { expect, test } from '@playwright/test';
import { DEFAULT_LOOK } from '../src/contracts';
import { renderPenguinSvg } from '../src/game/penguin/render-svg';

// Renders `renderPenguinSvg` in this Node test process (not the browser
// under test) and drops the resulting SVG markup into the page both inline
// and as a base64 data-URI `<img>` -- the same
// `data:image/svg+xml;base64,...` encoding `ensurePenguinTextures`
// (src/game/penguin/texture.ts) hands to Phaser's `TextureManager.addBase64`
// -- so a screenshot shows whether the design's Bumbastika/Anton outlines
// (#62) survive that exact path with no font fallback, side by side with
// the same markup rendered directly on the page.

interface GridRow {
  label: string;
  svg: string;
}

// `btoa` is a global in both browsers and Node >=22 (this repo's minimum
// engine, matching src/game/penguin/texture.ts's own `svgToBase64`).
function svgToImgSrc(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function buildRows(): GridRow[] {
  return [
    {
      label: 'LAUGH frame 0 (HA HA -- Bumbastika)',
      svg: renderPenguinSvg(DEFAULT_LOOK, { anim: 'LAUGH', frame: 0 }, { idPrefix: 'haha' }),
    },
    {
      label: 'JG LOGO pattern (JG -- Anton)',
      svg: renderPenguinSvg({ ...DEFAULT_LOOK, pattern: 'JG LOGO' }, undefined, {
        idPrefix: 'jg-logo',
      }),
    },
    {
      label: 'WAR WEEK BAND hat (WAR WEEK -- Anton)',
      svg: renderPenguinSvg({ ...DEFAULT_LOOK, hat: 'WAR WEEK BAND' }, undefined, {
        idPrefix: 'war-week-band',
      }),
    },
  ];
}

function buildHtml(rows: GridRow[]): string {
  const rowsHtml = rows
    .map(
      (row) =>
        `<div class="row"><span class="label">${row.label}</span>` +
        `<span class="cell">${row.svg}</span>` +
        `<span class="cell"><img src="${svgToImgSrc(row.svg)}" alt="${row.label}"></span></div>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; background: #0E1013; color: #F4F4F4; font-family: sans-serif; }
  .grid { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
  .row { display: flex; align-items: center; gap: 24px; }
  .label { width: 260px; font-size: 12px; flex: none; }
  .cell { flex: none; display: flex; }
  svg, img { flex: none; }
</style>
</head>
<body>
<div class="grid">
${rowsHtml}
</div>
</body>
</html>`;
}

test('penguin-text-paths', async ({ page }) => {
  // Fail on any uncaught page error or console error, like
  // e2e/penguin-renderer.spec.ts and e2e/smoke.spec.ts.
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const rows = buildRows();

  await page.setContent(buildHtml(rows));

  await expect(page.locator('svg')).toHaveCount(rows.length);
  await expect(page.locator('img')).toHaveCount(rows.length);

  await page.screenshot({
    path: 'test-results/penguin-text-paths/screenshot.png',
    fullPage: true,
  });

  expect(errors).toEqual([]);
});
