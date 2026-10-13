// Generates src/game/rooms/definitions/latam-disco-hall-floor.ts from the
// design/ mirror: `design/Latam Disco Hall.dc.html`'s 48 animated dance-floor
// tiles (owner request, 2026-10-09: "the dance-floor tiles cycle colours like
// the design").
//
// Each tile is the design's own, verbatim:
//   <polygon points="..." fill="..." stroke="#0E1013" stroke-width="1">
//     <animate attributeName="fill" values="c0;c1;c2;c0" dur="3.2s" begin="..." repeatCount="indefinite"/>
//   </polygon>
// (10 distinct colour sets, all `dur="3.2s"`, staggered `begin`s -- confirmed
// by scanning the design file directly). This parses that markup with a
// regex, not a full SVG/DOM parser: `export-room-art.ts`'s own freeze step
// confirms nothing else in this design file matches the same shape, and a
// design resync that changes it fails this script loudly (no match found, or
// a tile's own 4-stop/loop-back invariant breaks) rather than silently
// drifting.
//
// Run with `npm run build:latam-disco-floor` after a design resync touches
// `Latam Disco Hall.dc.html`. Deterministic: rerunning it on the same design
// file leaves the output unchanged.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DESIGN_FILE = path.join(REPO_ROOT, 'design', 'Latam Disco Hall.dc.html');
const OUT = path.join(
  REPO_ROOT,
  'src',
  'game',
  'rooms',
  'definitions',
  'latam-disco-hall-floor.ts',
);

/** Matches exactly the dance floor's own markup; nothing else in this design file matches (48 hits, confirmed). */
const TILE_RE =
  /<polygon points="([^"]*)" fill="([^"]*)" stroke="#0E1013" stroke-width="1">\s*<animate attributeName="fill" values="([^"]*)" dur="([^"]*)" begin="([^"]*)" repeatCount="indefinite"\/>\s*<\/polygon>/g;

interface ParsedPoint {
  x: number;
  y: number;
}

interface GeneratedTile {
  points: ParsedPoint[];
  colours: [string, string, string, string];
  durationMs: number;
  beginMs: number;
}

/** `"800.0,350.0 850.0,375.0 800.0,400.0 750.0,375.0"` -> its 4 corners, in order. */
function parsePoints(raw: string): ParsedPoint[] {
  return raw
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x, y };
    });
}

/** `"3.2s"` / `"-0.8s"` -> milliseconds. This design's own `dur`/`begin` values are always plain (fractional) seconds. */
function parseSeconds(token: string): number {
  const match = /^(-?\d*\.?\d+)s$/.exec(token);
  if (!match) throw new Error(`latam-disco-floor: unsupported SMIL clock value "${token}"`);
  return Number(match[1]) * 1000;
}

function parseTiles(html: string): GeneratedTile[] {
  const tiles: GeneratedTile[] = [];
  let match: RegExpExecArray | null;
  while ((match = TILE_RE.exec(html))) {
    const [, points, fill, values, dur, begin] = match;
    const colours = values.split(';');
    if (colours.length !== 4) {
      throw new Error(
        `latam-disco-floor: expected 4 colour stops, got ${colours.length} ("${values}")`,
      );
    }
    if (colours[0] !== fill) {
      throw new Error(
        `latam-disco-floor: polygon fill "${fill}" doesn't match its own animate's first stop "${colours[0]}"`,
      );
    }
    if (colours[0] !== colours[3]) {
      throw new Error(`latam-disco-floor: colour stops don't loop back to the first ("${values}")`);
    }
    tiles.push({
      points: parsePoints(points),
      colours: colours as [string, string, string, string],
      durationMs: parseSeconds(dur),
      beginMs: parseSeconds(begin),
    });
  }
  if (tiles.length === 0) {
    throw new Error('latam-disco-floor: matched no animated dance-floor tiles');
  }
  return tiles;
}

async function main(): Promise<void> {
  const html = await readFile(DESIGN_FILE, 'utf8');
  const tiles = parseTiles(html);

  const lines: string[] = [
    '// GENERATED FILE -- do not hand-edit.',
    '// Run `npm run build:latam-disco-floor` to regenerate (see',
    "// scripts/latam-disco-floor.ts), from `design/Latam Disco Hall.dc.html`'s",
    '// own 48 animated dance-floor polygons.',
    "import type { DiscoFloorTile } from '../disco-floor';",
    '',
    "/** The LATAM Disco Hall's dance floor (owner request, 2026-10-09): one entry per design tile, in document order. */",
    'export const LATAM_DISCO_HALL_FLOOR_TILES: readonly DiscoFloorTile[] = [',
    ...tiles.map((tile) => `  ${JSON.stringify(tile)},`),
    '];',
    '',
  ];

  await writeFile(OUT, lines.join('\n'), 'utf8');
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT)} (${tiles.length} dance-floor tiles)`);
}

await main();
