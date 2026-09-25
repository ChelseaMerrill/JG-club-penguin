import { expect, test } from '@playwright/test';
import {
  DEFAULT_LOOK,
  type Eyes,
  type Hat,
  type Pattern,
  type PenguinLook,
} from '../src/contracts';
import {
  preContrastFixColors,
  renderPenguinSvg,
  renderPenguinSvgWithColors,
} from '../src/game/penguin/render-svg';

// Renders `renderPenguinSvg`/`renderPenguinSvgWithColors` in this Node test
// process (not the browser under test) and drops the resulting SVG markup
// straight into the page, so the screenshot is the renderer's real output,
// following `e2e/penguin-renderer.spec.ts`'s approach.

interface ProblemCombo {
  /** The ticket's own six-row problem table (#79), one entry per row. */
  label: string;
  /** One or more explicit `PenguinLook` overrides for this row; cycled
   * across the row's rendered variants when there's more than one (a row
   * naming two swatches, e.g. "#161719 / #3a4046"). */
  values: Array<Partial<PenguinLook>>;
  /** Extra cells beyond the standard hat/eyes/pattern rotation, each merged
   * with this row's first `values` entry (#79 review round 1 nit 3). */
  extraCells?: Array<{ label: string; overrides: Partial<PenguinLook> }>;
}

const PROBLEM_COMBOS: ProblemCombo[] = [
  {
    label: '#79 problem 1 — Body #0C4B5F (teal): body/arm outlines disappear',
    values: [{ body: '#0C4B5F' }],
  },
  {
    label: '#79 problem 2 — Body #161719 / #3a4046: outline sinks into the dark backdrop',
    values: [{ body: '#161719' }, { body: '#3a4046' }],
  },
  {
    label: '#79 problem 3 — Body #F4F4F4 / #BFE3F0: white belly/eyes/beak vanish',
    values: [{ body: '#F4F4F4' }, { body: '#BFE3F0' }],
  },
  {
    label: '#79 problem 4 — Body #00BDFF (cyan): cyan beak/STAR eyes/snorkel vanish',
    values: [{ body: '#00BDFF' }],
  },
  {
    label: '#79 problem 5 — Cap #0C4B5F (teal cap): cap outline/JG badge disappear',
    values: [{ cap: '#0C4B5F' }],
    // #79 review round 1 nit 3: this row also gets a WINK, a SNOWFLAKE and
    // a WAR WEEK BAND cell, since the standard rotation below only ever
    // shows this row with JG CAP/SNORKEL/HEADPHONES and ROUND/STAR/SLEEPY.
    extraCells: [
      { label: 'EYES WINK', overrides: { eyes: 'WINK' } },
      { label: 'PATTERN SNOWFLAKE', overrides: { pattern: 'SNOWFLAKE' } },
      { label: 'HAT WAR WEEK BAND', overrides: { hat: 'WAR WEEK BAND' } },
    ],
  },
  {
    label: '#79 problem 6 — Feet #0C4B5F (teal feet): feet lost against the backdrop',
    values: [{ feet: '#0C4B5F' }],
  },
];

// Exercised across each row's variants, so every problem combination is
// also shown with several hats, eyes and belly patterns, not just the
// default JG CAP / ROUND / PLAIN look. STAR is paired with JG CAP, not
// SNORKEL, so the STAR eyes stay visible above the snorkel mask instead of
// being hidden behind it (#79 review round 1 nit 3).
const HAT_VARIANTS: Hat[] = ['JG CAP', 'SNORKEL', 'HEADPHONES'];
const EYES_VARIANTS: Eyes[] = ['STAR', 'ROUND', 'SLEEPY'];
const PATTERN_VARIANTS: Pattern[] = ['PLAIN', 'PIXEL HEART', 'HEX'];
const VARIANTS_PER_ROW = 3;

interface GridRow {
  label: string;
  beforeSvg: string;
  afterSvg: string;
}

function buildRows(): GridRow[] {
  const rows: GridRow[] = [];
  // Every cell gets its own `idPrefix` (#31 review fix 7), so the many
  // inline SVGs on this one page never clash on the belly `clipPath` id --
  // including the two (before/after) SVGs rendered per row.
  let idCounter = 0;
  const nextIdPrefix = (): string => `cell-${idCounter++}`;

  // #79 review round 1 nit 3: a "before" column, rendered through the
  // *current* markup (`renderPenguinSvgWithColors`) forced to the pre-#79
  // renderer's fixed colours (`preContrastFixColors`), so it's a faithful
  // reproduction of the old renderer rather than a second implementation.
  const pushRow = (label: string, look: PenguinLook): void => {
    rows.push({
      label,
      beforeSvg: renderPenguinSvgWithColors(
        look,
        undefined,
        { idPrefix: nextIdPrefix() },
        preContrastFixColors(look),
      ),
      afterSvg: renderPenguinSvg(look, undefined, { idPrefix: nextIdPrefix() }),
    });
  };

  for (const combo of PROBLEM_COMBOS) {
    for (let i = 0; i < VARIANTS_PER_ROW; i++) {
      const overrides = combo.values[i % combo.values.length];
      const hat = HAT_VARIANTS[i];
      const eyes = EYES_VARIANTS[i];
      const pattern = PATTERN_VARIANTS[i];
      const look: PenguinLook = { ...DEFAULT_LOOK, ...overrides, hat, eyes, pattern };
      pushRow(`${combo.label} · HAT ${hat} · EYES ${eyes} · PATTERN ${pattern}`, look);
    }
    for (const extra of combo.extraCells ?? []) {
      const look: PenguinLook = { ...DEFAULT_LOOK, ...combo.values[0], ...extra.overrides };
      pushRow(`${combo.label} · ${extra.label}`, look);
    }
  }

  return rows;
}

function buildHtml(rows: GridRow[]): string {
  const rowsHtml = rows
    .map(
      (row) => `<div class="row">
  <span class="label">${row.label}</span>
  <div class="cell"><span class="cell-label">BEFORE</span>${row.beforeSvg}</div>
  <div class="cell"><span class="cell-label">AFTER</span>${row.afterSvg}</div>
</div>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; background: #0e1013; color: #F4F4F4; font-family: sans-serif; }
  .grid { display: flex; flex-direction: column; gap: 4px; padding: 16px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .label { width: 460px; font-size: 12px; flex: none; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: none; }
  .cell-label { font-size: 10px; letter-spacing: .08em; opacity: .7; }
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

test('penguin-contrast-grid', async ({ page }) => {
  // Fail on any uncaught page error or console error, like e2e/smoke.spec.ts.
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const rows = buildRows();

  await page.setContent(buildHtml(rows));

  // Two SVGs (before/after) per row.
  await expect(page.locator('svg')).toHaveCount(rows.length * 2);

  await page.screenshot({
    path: 'test-results/penguin-contrast/grid.png',
    fullPage: true,
  });

  expect(errors).toEqual([]);
});

test('penguin-contrast-creator-teal', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Stage at scale 1 (see hud.spec.ts / penguin-creator.spec.ts), so the
  // screenshot is 1:1 with the design.
  await page.setViewportSize({ width: 1618, height: 918 });
  // `?creator` runs the first-sign-in flow against the in-memory store.
  await page.goto('/?creator');

  const creator = page.locator('.penguin-creator');
  await expect(creator).toBeVisible();

  await page.locator('.penguin-creator [aria-label="BODY"] [data-color="#0C4B5F"]').click();
  await expect(page.locator('.penguin-creator__figure svg')).toBeVisible();

  await page.screenshot({ path: 'test-results/penguin-contrast/creator-teal.png' });

  expect(errors).toEqual([]);
});
