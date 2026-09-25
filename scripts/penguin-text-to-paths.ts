// Generates SVG path data for the Penguin design's four fixed text strings
// ("HA HA" in the LAUGH idle, "JG" on the JG LOGO belly pattern, "WAR WEEK"
// on the WAR WEEK BAND hat, and "JG" on the JG CAP's crown -- see
// `design/Penguin Creator.dc.html` L47, L59, L62, L64) using their design
// fonts (Bumbastika, Anton), so `render-svg.ts` can
// draw them as `<path>` outlines instead of `<text>` elements. Browsers
// don't let an SVG loaded as an `<img>`/Phaser texture use the page's web
// fonts, so `<text>` there falls back to a system font in Rooms (#62); a
// pre-baked outline path renders identically everywhere `renderPenguinSvg`
// is used.
//
// It also bakes the two NPC figure strings #113 ports from the Room designs
// (Jory's "SURVIVOR" tee, `design/build/humans.js`'s `tee:'survivor'`, and
// the "FREE $$$" envelope on Anthony's fishing rod, `design/Room 05 Roof
// Deck.dc.html`) into `src/game/npcs/text-paths.ts`, for the same reason:
// `render-npc-svg.ts` is loaded as a Phaser texture too.
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
import { ACCENT, EYE_PUPIL, EYE_WHITE } from '../src/game/penguin/palette.ts';

// `scripts/` sits directly under the repo root, so its parent is the root
// regardless of the caller's own working directory (unlike `process.cwd()`,
// which only happens to be the repo root when this is run via `npm run
// build:penguin-text` from the root) (#62 review fix 5).
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BUMBASTIKA_PATH = path.join(REPO_ROOT, 'design', 'assets', 'bumbastika.ttf');
const ANTON_PATH = path.join(REPO_ROOT, 'scripts', 'fonts', 'anton', 'Anton-Regular.ttf');
const OUTPUT_PATH = path.join(REPO_ROOT, 'src', 'game', 'penguin', 'text-paths.ts');
const NPC_OUTPUT_PATH = path.join(REPO_ROOT, 'src', 'game', 'npcs', 'text-paths.ts');

type TextAnchor = 'start' | 'middle';

// One design string's layout spec, verbatim from `design/Penguin
// Creator.dc.html`'s four `<text>` elements (#62 D2, #92 D4): "HA HA" (L64,
// default/`start` anchor), "JG" on the belly (L47), "WAR WEEK" (L62) and "JG"
// on the cap's crown (L59, added by #92's redraw), all three "JG"/"WAR WEEK"
// strings using `middle` anchor. `fill` values come from `palette.ts` (#62
// review fix 6), the same module `render-svg.ts` reads its own colours from,
// rather than repeating the hex literals here.
interface TextSpec {
  key: string;
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
  {
    key: 'jgCap',
    text: 'JG',
    fontPath: ANTON_PATH,
    fontSize: 5,
    x: 60,
    y: 19.4,
    anchor: 'middle',
    letterSpacing: 0,
    fill: EYE_WHITE,
  },
];

// The NPC figure strings (#113), verbatim from their design `<text>`
// elements: humans.js's `<text x="60" y="92" text-anchor="middle"
// font-family="Anton, Impact, sans-serif" font-size="9" fill="#F2C12E"
// letter-spacing="1">SURVIVOR</text>` and the Roof Deck design's `<text
// x="118" y="98" text-anchor="middle" font-family="Anton, Impact, sans-serif"
// font-size="7" fill="#00BDFF">FREE $$$</text>`.
const NPC_TEXT_SPECS: TextSpec[] = [
  {
    key: 'survivorTee',
    text: 'SURVIVOR',
    fontPath: ANTON_PATH,
    fontSize: 9,
    x: 60,
    y: 92,
    anchor: 'middle',
    letterSpacing: 1,
    fill: '#F2C12E',
  },
  {
    key: 'freeBait',
    text: 'FREE $$$',
    fontPath: ANTON_PATH,
    fontSize: 7,
    x: 118,
    y: 98,
    anchor: 'middle',
    letterSpacing: 0,
    fill: '#00BDFF',
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

async function writeTextPathsFile(
  specs: TextSpec[],
  outputPath: string,
  typeName: string,
  constName: string,
  fontCache: Map<string, opentype.Font>,
): Promise<void> {
  const entries: string[] = [];

  for (const spec of specs) {
    const font = await loadFont(spec.fontPath, fontCache);
    const d = layoutTextPath(font, spec);
    entries.push(`  ${spec.key}: { d: '${d}', fill: '${spec.fill}' },`);
  }

  const contents =
    renderFileHeader() +
    '\n' +
    `export interface ${typeName} {\n` +
    '  d: string;\n' +
    '  fill: string;\n' +
    '}\n' +
    '\n' +
    `export const ${constName}: {\n` +
    specs.map((spec) => `  ${spec.key}: ${typeName};\n`).join('') +
    '} = {\n' +
    entries.join('\n') +
    '\n' +
    '};\n';

  // Formatted with this repo's own Prettier config (the same as `npm run
  // format` would apply) so the committed output is always already
  // repo-formatted and a second run -- or `npm run format` -- never touches
  // it again.
  const prettierConfig = (await prettier.resolveConfig(outputPath)) ?? {};
  const formatted = await prettier.format(contents, { ...prettierConfig, filepath: outputPath });

  await writeFile(outputPath, formatted, 'utf8');
  console.log(`Wrote ${path.relative(REPO_ROOT, outputPath)}`);
}

async function main(): Promise<void> {
  const fontCache = new Map<string, opentype.Font>();
  await writeTextPathsFile(
    TEXT_SPECS,
    OUTPUT_PATH,
    'PenguinTextPath',
    'PENGUIN_TEXT_PATHS',
    fontCache,
  );
  await writeTextPathsFile(
    NPC_TEXT_SPECS,
    NPC_OUTPUT_PATH,
    'NpcTextPath',
    'NPC_TEXT_PATHS',
    fontCache,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
