import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { DEFAULT_LOOK } from '../src/contracts';
import { PENGUIN_TEXT_PATHS } from '../src/game/penguin/text-paths';
import { type PenguinPose, resolvePenguinFramePose } from '../src/game/penguin/poses';
import {
  PENGUIN_FRAME_HEIGHT,
  PENGUIN_FRAME_PADDING_X,
  PENGUIN_FRAME_PADDING_Y,
  PENGUIN_FRAME_WIDTH,
  PENGUIN_VIEWBOX_HEIGHT,
  PENGUIN_VIEWBOX_WIDTH,
  renderPenguinSvg,
} from '../src/game/penguin/render-svg';

// Renders `renderPenguinSvg` in this Node test process (not the browser
// under test) and drops the resulting SVG markup into the page both inline
// and as a base64 data-URI `<img>` -- the same
// `data:image/svg+xml;base64,...` encoding `ensurePenguinTextures`
// (src/game/penguin/texture.ts) hands to Phaser's `TextureManager.addBase64`
// -- so a screenshot shows whether the design's Bumbastika/Anton outlines
// (#62) survive that exact path with no font fallback.
//
// Each row also carries a *real reference*: the design's own `<text>`
// markup (verbatim attributes from `design/Penguin Creator.dc.html`),
// rendered with the actual Bumbastika/Anton web fonts loaded via
// `@font-face` data URIs, so a reviewer can see the generated outlines next
// to the text they're meant to reproduce, not just next to themselves (#62
// review fix 1).

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BUMBASTIKA_PATH = path.join(REPO_ROOT, 'design', 'assets', 'bumbastika.ttf');
const ANTON_PATH = path.join(REPO_ROOT, 'scripts', 'fonts', 'anton', 'Anton-Regular.ttf');

// `render-svg.ts`'s own body-rotation pivot (its private `BODY_ROTATE_ORIGIN`):
// 50%/100% of the 120x130 design viewBox (#31 review fix 2). Reproduced here
// since it's a `render-svg.ts` implementation detail, not part of its public
// surface. Used only for the *visible* reference row (below), so it looks
// right next to a path drawn at the same pose.
const BODY_ROTATE_ORIGIN = { x: PENGUIN_VIEWBOX_WIDTH / 2, y: PENGUIN_VIEWBOX_HEIGHT };

/** `render-svg.ts`'s own `bodyTransform` attribute string, for the visible reference `<text>` to share. */
function bodyTransformAttr(pose: PenguinPose): string {
  const framePose = resolvePenguinFramePose(pose);
  return `rotate(${framePose.bodyRotateDeg} ${BODY_ROTATE_ORIGIN.x} ${BODY_ROTATE_ORIGIN.y}) translate(0 ${framePose.bodyTranslateY})`;
}

interface DesignTextSpec {
  key: 'haha' | 'jgLogo' | 'warWeek';
  text: string;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  fill: string;
  textAnchor?: 'middle';
  letterSpacing?: number;
}

// Verbatim from `design/Penguin Creator.dc.html`'s three `<text>` elements
// (L47 "JG", L62 "WAR WEEK", L64 "HA HA") -- the same attributes
// `scripts/penguin-text-to-paths.ts`'s `TEXT_SPECS` lays out as path
// outlines (#62 D1/D2). This is the untouched design markup those outlines
// must visually and numerically match (#62 review fix 1).
const DESIGN_TEXT_SPECS: DesignTextSpec[] = [
  {
    key: 'haha',
    text: 'HA HA',
    x: 100,
    y: 30,
    fontFamily: 'Bumbastika, Anton, sans-serif',
    fontSize: 14,
    fill: '#00BDFF',
  },
  {
    key: 'jgLogo',
    text: 'JG',
    x: 60,
    y: 85,
    fontFamily: 'Anton, Impact, sans-serif',
    fontSize: 13,
    fill: '#00BDFF',
    textAnchor: 'middle',
  },
  {
    key: 'warWeek',
    text: 'WAR WEEK',
    x: 60,
    y: 32.5,
    fontFamily: 'Anton, Impact, sans-serif',
    fontSize: 7,
    fill: '#161719',
    textAnchor: 'middle',
    letterSpacing: 1,
  },
];

interface GridRow {
  key: 'haha' | 'jgLogo' | 'warWeek';
  label: string;
  pose: PenguinPose;
  pathsSvg: string;
  pathD: string;
}

// `btoa` is a global in both browsers and Node >=22 (this repo's minimum
// engine, matching src/game/penguin/texture.ts's own `svgToBase64`).
function svgToImgSrc(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function buildRows(): GridRow[] {
  return [
    {
      key: 'haha',
      label: 'LAUGH frame 0 (HA HA -- Bumbastika)',
      pose: { anim: 'LAUGH', frame: 0 },
      pathsSvg: renderPenguinSvg(DEFAULT_LOOK, { anim: 'LAUGH', frame: 0 }, { idPrefix: 'haha' }),
      pathD: PENGUIN_TEXT_PATHS.haha.d,
    },
    {
      key: 'jgLogo',
      label: 'JG LOGO pattern (JG -- Anton)',
      // `renderPenguinSvg`'s default pose, when none is passed, is
      // `{ anim: look.emote, frame: 0 }` (`DEFAULT_LOOK.emote` is `WADDLE`).
      pose: { anim: DEFAULT_LOOK.emote, frame: 0 },
      pathsSvg: renderPenguinSvg({ ...DEFAULT_LOOK, pattern: 'JG LOGO' }, undefined, {
        idPrefix: 'jg-logo',
      }),
      pathD: PENGUIN_TEXT_PATHS.jgLogo.d,
    },
    {
      key: 'warWeek',
      label: 'WAR WEEK BAND hat (WAR WEEK -- Anton)',
      pose: { anim: DEFAULT_LOOK.emote, frame: 0 },
      pathsSvg: renderPenguinSvg({ ...DEFAULT_LOOK, hat: 'WAR WEEK BAND' }, undefined, {
        idPrefix: 'war-week-band',
      }),
      pathD: PENGUIN_TEXT_PATHS.warWeek.d,
    },
  ];
}

/** The design `<text>`'s own attributes, verbatim (shared by the visible reference row and the offscreen measurement SVG). */
function designTextAttrs(spec: DesignTextSpec): string {
  return [
    `x="${spec.x}"`,
    `y="${spec.y}"`,
    spec.textAnchor ? `text-anchor="${spec.textAnchor}"` : '',
    `font-family="${spec.fontFamily}"`,
    `font-size="${spec.fontSize}"`,
    `fill="${spec.fill}"`,
    spec.letterSpacing !== undefined ? `letter-spacing="${spec.letterSpacing}"` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

const MIN_X = -PENGUIN_FRAME_PADDING_X;
const MIN_Y = -PENGUIN_FRAME_PADDING_Y;

/** The visible reference cell: the design text, at the same pose as its paths-cell neighbour, using the page's own (already-loaded) web fonts. */
function buildDesignTextSvg(spec: DesignTextSpec, pose: PenguinPose): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MIN_X} ${MIN_Y} ${PENGUIN_FRAME_WIDTH} ${PENGUIN_FRAME_HEIGHT}" width="${PENGUIN_FRAME_WIDTH}" height="${PENGUIN_FRAME_HEIGHT}">` +
    `<g transform="${bodyTransformAttr(pose)}"><text ${designTextAttrs(spec)}>${spec.text}</text></g></svg>`
  );
}

async function buildFontFaceCss(): Promise<string> {
  const [bumbastika, anton] = await Promise.all([readFile(BUMBASTIKA_PATH), readFile(ANTON_PATH)]);
  const bumbastikaUri = `data:font/ttf;base64,${bumbastika.toString('base64')}`;
  const antonUri = `data:font/ttf;base64,${anton.toString('base64')}`;
  return (
    `@font-face { font-family: "Bumbastika"; src: url("${bumbastikaUri}") format("truetype"); }\n` +
    `@font-face { font-family: "Anton"; src: url("${antonUri}") format("truetype"); }`
  );
}

function buildHtml(rows: GridRow[], fontFaceCss: string): string {
  const rowsHtml = rows
    .map((row) => {
      const designSpec = DESIGN_TEXT_SPECS.find((spec) => spec.key === row.key)!;
      const designSvg = buildDesignTextSvg(designSpec, row.pose);
      return (
        `<div class="row"><span class="label">${row.label}</span>` +
        `<span class="cell design-cell" data-key="${row.key}">${designSvg}</span>` +
        `<span class="cell paths-cell" data-key="${row.key}">${row.pathsSvg}</span>` +
        `<span class="cell"><img src="${svgToImgSrc(row.pathsSvg)}" alt="${row.label}"></span></div>`
      );
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${fontFaceCss}
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

interface BBoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Both edges of a bounding box on each axis must be within `tolerance` user units. */
function assertBBoxesMatch(
  design: BBoxLike,
  generated: BBoxLike,
  tolerance: number,
  label: string,
): void {
  expect(Math.abs(design.x - generated.x), `${label}: left edge`).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(design.y - generated.y), `${label}: top edge`).toBeLessThanOrEqual(tolerance);
  expect(
    Math.abs(design.x + design.width - (generated.x + generated.width)),
    `${label}: right edge`,
  ).toBeLessThanOrEqual(tolerance);
  expect(
    Math.abs(design.y + design.height - (generated.y + generated.height)),
    `${label}: bottom edge`,
  ).toBeLessThanOrEqual(tolerance);
}

// Rasterization scale for `inkBBox` below: bigger means less quantization
// noise from where a pixel boundary happens to fall, at the cost of a larger
// offscreen canvas.
const INK_SCALE = 8;
const INK_ALPHA_THRESHOLD = 10;

/**
 * Rasterizes a self-contained `svgMarkup` string (its own `@font-face`, no
 * dependency on the page's stylesheet) at `INK_SCALE`x resolution onto an
 * offscreen `<canvas>` and finds the tight pixel-alpha bounding box of its
 * non-transparent ink, converting back to the SVG's own user-space units.
 *
 * This -- not `SVGTextElement.getBBox()` -- is what "the `<text>` element's
 * bounding box" has to mean for a same-glyph comparison to a `<path>`'s
 * `getBBox()` to be meaningful (#62 review fix 1). Measured directly rather
 * than assumed: Chromium's `getBBox()` on an SVG `<text>` returns a box
 * based on the *font's* ascent/descent metrics for its height (constant
 * across different glyphs at the same size -- verified by comparing "I" and
 * "g") and each glyph's *advance* width for its width, not the rendered
 * ink -- while `getBBox()` on the generated `<path>` (a hand-plotted
 * outline, not text) *is* already ink-tight. Comparing those two kinds of
 * box would never land within a few units of each other regardless of how
 * correct the path is. Rasterizing both to real pixels puts them on equal,
 * ink-to-ink footing.
 */
async function inkBBox(page: Page, svgMarkup: string): Promise<BBoxLike> {
  const result = await page.evaluate(
    async ([svg, scale, minX, minY, threshold]) => {
      const img = new Image();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      try {
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let minPX = Infinity;
        let maxPX = -Infinity;
        let minPY = Infinity;
        let maxPY = -Infinity;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const alpha = data[(y * canvas.width + x) * 4 + 3];
            if (alpha > threshold) {
              if (x < minPX) minPX = x;
              if (x > maxPX) maxPX = x;
              if (y < minPY) minPY = y;
              if (y > maxPY) maxPY = y;
            }
          }
        }
        if (minPX === Infinity) return null;
        return {
          x: minPX / scale + minX,
          y: minPY / scale + minY,
          width: (maxPX - minPX + 1) / scale,
          height: (maxPY - minPY + 1) / scale,
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [svgMarkup, INK_SCALE, MIN_X, MIN_Y, INK_ALPHA_THRESHOLD] as const,
  );
  if (!result)
    throw new Error('no ink found when rasterizing the reference SVG for bbox comparison');
  return result;
}

/**
 * A standalone, offscreen SVG for `inkBBox`: just the design `<text>` at its
 * own design position (no body-rotate pose wrapper, unlike
 * `buildDesignTextSvg`) since `<path>.getBBox()` -- what it's compared
 * against -- ignores ancestor transforms and reports local, unrotated
 * coordinates; matching that keeps the comparison apples-to-apples.
 */
function buildMeasurementSvg(spec: DesignTextSpec, fontFaceCss: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MIN_X} ${MIN_Y} ${PENGUIN_FRAME_WIDTH} ${PENGUIN_FRAME_HEIGHT}" width="${PENGUIN_FRAME_WIDTH * INK_SCALE}" height="${PENGUIN_FRAME_HEIGHT * INK_SCALE}">` +
    `<style>${fontFaceCss}</style><text ${designTextAttrs(spec)}>${spec.text}</text></svg>`
  );
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
  const fontFaceCss = await buildFontFaceCss();

  await page.setContent(buildHtml(rows, fontFaceCss));

  // Force the two design web fonts to load (referenced only via
  // `@font-face` + `font-family`, not an ordinary stylesheet), then wait for
  // them so `<text>` isn't measured/painted against a system-font fallback
  // (#62 review fix 1).
  await page.evaluate(
    async ([specs]) => {
      await Promise.all(
        specs.map((spec) => document.fonts.load(`${spec.fontSize}px ${spec.fontFamily}`)),
      );
      await document.fonts.ready;
    },
    [DESIGN_TEXT_SPECS] as const,
  );

  await expect(page.locator('svg')).toHaveCount(rows.length * 2);
  await expect(page.locator('img')).toHaveCount(rows.length);

  const pathBoxes = await page.evaluate(
    ([rowArgs]) =>
      rowArgs.map(({ key, pathD }) => {
        const pathEl = Array.from(
          document.querySelectorAll<SVGPathElement>(`.paths-cell[data-key="${key}"] path`),
        ).find((candidate) => candidate.getAttribute('d') === pathD);
        if (!pathEl) throw new Error(`no matching <path> found for ${key}`);
        const box = pathEl.getBBox();
        return { key, box: { x: box.x, y: box.y, width: box.width, height: box.height } };
      }),
    [rows.map((row) => ({ key: row.key, pathD: row.pathD }))] as const,
  );

  for (const { key, box: pathBox } of pathBoxes) {
    const spec = DESIGN_TEXT_SPECS.find((candidate) => candidate.key === key)!;
    const designBox = await inkBBox(page, buildMeasurementSvg(spec, fontFaceCss));
    assertBBoxesMatch(designBox, pathBox, 1, key);
  }

  await page.screenshot({
    path: 'test-results/penguin-text-paths/screenshot.png',
    fullPage: true,
  });

  expect(errors).toEqual([]);
});
