// Generates SVG path data for the Penguin design's three fixed text strings
// ("HA HA" in the LAUGH idle, "JG" on the JG LOGO belly pattern, "WAR WEEK"
// on the WAR WEEK BAND hat -- see `design/Penguin Creator.dc.html` L47, L62,
// L64) using their design fonts (Bumbastika, Anton), so `render-svg.ts` can
// draw them as `<path>` outlines instead of `<text>` elements. Browsers
// don't let an SVG loaded as an `<img>`/Phaser texture use the page's web
// fonts, so `<text>` there falls back to a system font in Rooms (#62); a
// pre-baked outline path renders identically everywhere `renderPenguinSvg`
// is used.
//
// Run with `npm run build:penguin-text`. Deterministic: the same input
// fonts and layout constants below always produce the same
// `src/game/penguin/text-paths.ts` byte-for-byte (fixed 2-decimal rounding,
// no timestamps) -- rerunning it when the output already reflects the
// current design and fonts is a no-op (`git status` stays clean).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import opentype from 'opentype.js';
import * as prettier from 'prettier';
import { ACCENT, EYE_PUPIL } from '../src/game/penguin/palette.ts';

// `scripts/` sits directly under the repo root, so its parent is the root
// regardless of the caller's own working directory (unlike `process.cwd()`,
// which only happens to be the repo root when this is run via `npm run
// build:penguin-text` from the root) (#62 review fix 5).
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BUMBASTIKA_PATH = path.join(REPO_ROOT, 'design', 'assets', 'bumbastika.ttf');
const ANTON_PATH = path.join(REPO_ROOT, 'scripts', 'fonts', 'anton', 'Anton-Regular.ttf');
const OUTPUT_PATH = path.join(REPO_ROOT, 'src', 'game', 'penguin', 'text-paths.ts');

type TextAnchor = 'start' | 'middle';

// One design string's layout spec, verbatim from `design/Penguin
// Creator.dc.html`'s three `<text>` elements (#62 D2): "HA HA" (L64,
// default/`start` anchor), "JG" (L47) and "WAR WEEK" (L62, both `middle`).
// `fill` values come from `palette.ts` (#62 review fix 6), the same module
// `render-svg.ts` reads its own colours from, rather than repeating the hex
// literals here.
interface TextSpec {
  key: 'haha' | 'jgLogo' | 'warWeek';
  text: string;
  fontPath: string;
  fontSize: number;
  x: number;
  y: number;
  anchor: TextAnchor;
  letterSpacing: number;
  fill: string;
}

const TEXT_SPECS: TextSpec[] = [
  {
    key: 'haha',
    text: 'HA HA',
    fontPath: BUMBASTIKA_PATH,
    fontSize: 14,
    x: 100,
    y: 30,
    anchor: 'start',
    letterSpacing: 0,
    fill: ACCENT,
  },
  {
    key: 'jgLogo',
    text: 'JG',
    fontPath: ANTON_PATH,
    fontSize: 13,
    x: 60,
    y: 85,
    anchor: 'middle',
    letterSpacing: 0,
    fill: ACCENT,
  },
  {
    key: 'warWeek',
    text: 'WAR WEEK',
    fontPath: ANTON_PATH,
    fontSize: 7,
    x: 60,
    y: 32.5,
    anchor: 'middle',
    letterSpacing: 1,
    fill: EYE_PUPIL,
  },
];

// Lays out `spec.text` at its own baseline (a glyph path's `y` argument is
// already the SVG baseline: a font's ascenders are negative-Y glyph
// coordinates, the same sense as SVG's y-down space), applying
// `letterSpacing` between glyphs when drawing (SVG's `letter-spacing`
// attribute is in the same user-space units as `x`/`y`, so no unit
// conversion is needed) and centring an `anchor: 'middle'` string on its own
// measured width -- the sum of glyph advances plus letter-spacing for
// *every* glyph, trailing one included, matching Chromium's own SVG
// text-anchor="middle" layout, which applies `letter-spacing` after the
// last glyph too when it measures a string's width for centring (#62 review
// fix 2; `text-paths.test.ts`'s and the e2e bounding-box assertion both
// check the "WAR WEEK" outlines land where Chromium's own text-anchor="middle"
// centres real `letter-spacing="1"` text -- see #62 D2). Returns path data
// rounded to 2 decimals (#62 D2).
function layoutTextPath(font: opentype.Font, spec: TextSpec): string {
  const chars = Array.from(spec.text);
  const scale = spec.fontSize / font.unitsPerEm;
  const advances = chars.map((ch) => font.charToGlyph(ch).advanceWidth * scale);
  const totalWidth =
    advances.reduce((sum, advance) => sum + advance, 0) + spec.letterSpacing * chars.length;
  const startX = spec.anchor === 'middle' ? spec.x - totalWidth / 2 : spec.x;

  const combined = new opentype.Path();
  let penX = startX;
  chars.forEach((ch, index) => {
    const glyphPath = font.charToGlyph(ch).getPath(penX, spec.y, spec.fontSize);
    combined.commands.push(...glyphPath.commands);
    penX += advances[index] + spec.letterSpacing;
  });

  return combined.toPathData(2);
}

async function loadFont(
  fontPath: string,
  cache: Map<string, opentype.Font>,
): Promise<opentype.Font> {
  const cached = cache.get(fontPath);
  if (cached) return cached;
  const buffer = await readFile(fontPath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const font = opentype.parse(arrayBuffer);
  cache.set(fontPath, font);
  return font;
}

function renderFileHeader(): string {
  return (
    '// GENERATED FILE -- do not hand-edit.\n' +
    '// Run `npm run build:penguin-text` to regenerate (see\n' +
    '// scripts/penguin-text-to-paths.ts). Deterministic: rerunning it without\n' +
    '// changing the design fonts or that script leaves this file unchanged.\n'
  );
}

async function main(): Promise<void> {
  const fontCache = new Map<string, opentype.Font>();
  const entries: string[] = [];

  for (const spec of TEXT_SPECS) {
    const font = await loadFont(spec.fontPath, fontCache);
    const d = layoutTextPath(font, spec);
    entries.push(`  ${spec.key}: { d: '${d}', fill: '${spec.fill}' },`);
  }

  const contents =
    renderFileHeader() +
    '\n' +
    'export interface PenguinTextPath {\n' +
    '  d: string;\n' +
    '  fill: string;\n' +
    '}\n' +
    '\n' +
    'export const PENGUIN_TEXT_PATHS: {\n' +
    '  haha: PenguinTextPath;\n' +
    '  jgLogo: PenguinTextPath;\n' +
    '  warWeek: PenguinTextPath;\n' +
    '} = {\n' +
    entries.join('\n') +
    '\n' +
    '};\n';

  // Formatted with this repo's own Prettier config (the same as `npm run
  // format` would apply) so the committed output is always already
  // repo-formatted and a second run -- or `npm run format` -- never touches
  // it again.
  const prettierConfig = (await prettier.resolveConfig(OUTPUT_PATH)) ?? {};
  const formatted = await prettier.format(contents, { ...prettierConfig, filepath: OUTPUT_PATH });

  await writeFile(OUTPUT_PATH, formatted, 'utf8');
  console.log(`Wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
