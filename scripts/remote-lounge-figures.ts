// Generates src/game/npcs/remote-lounge-figures.ts from the design/ mirror:
// the Remote Lounge's JGers (`design/Remote Area.html`'s `REMOTE` list) with
// each one's finished figure markup.
//
// The design builds each figure as `jgMod(key, human(spec, uid), uid)`:
// `human()` from `design/build/humans.js`, then a per-person override that
// either redraws the whole figure or patches a detail (Tommy's trumpet,
// Dani's broccoli suit, Steven's grey hair and alien badge). This runs that
// same code, verbatim, in a Node `vm` sandbox, so the figures can't drift
// from the design. The uid is `__ID__`, which `renderCardFigure` replaces
// with a per-NPC id, exactly like a Characters-sheet card.
//
// Run with `npm run build:remote-lounge` after a design resync touches
// `Remote Area.html` or `humans.js`. Deterministic: rerunning it on the same
// design files leaves the output unchanged.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const REPO_ROOT = process.cwd();
const LOUNGE = path.join(REPO_ROOT, 'design', 'Remote Area.html');
const HUMANS = path.join(REPO_ROOT, 'design', 'build', 'humans.js');
const OUT = path.join(REPO_ROOT, 'src', 'game', 'npcs', 'remote-lounge-figures.ts');

interface RemoteJger {
  key: string;
  name: string;
  title: string;
  city: string;
  lon: number;
  lat: number;
  line: string;
  svg: string;
}

/** The design's script from `const HQ=` up to `const HUM=`: HQ, REMOTE and jgMod, nothing that touches the DOM. */
function designData(html: string): string {
  const start = html.indexOf('const HQ=');
  const end = html.indexOf('const HUM=');
  if (start < 0 || end < start) {
    throw new Error('Remote Area.html: could not find its HQ/REMOTE/jgMod block');
  }
  return html
    .slice(start, end)
    .replace('const HQ=', 'var HQ=')
    .replace('const REMOTE=', 'var REMOTE=');
}

/** The design's quote, minus the literal quote marks it wraps each one in. */
function unquote(line: string): string {
  return line.replace(/^"(.*)"$/, '$1');
}

/**
 * Design keys left out of the game on purpose, though the design still lists
 * them. `anderson`: Matt Anderson, removed from the lounge at the owner's
 * request (2026-10-08).
 */
const OMIT: ReadonlySet<string> = new Set(['anderson']);

function cardKey(key: string): string {
  return `remote${key[0]!.toUpperCase()}${key.slice(1)}`;
}

async function main(): Promise<void> {
  const [html, humans] = await Promise.all([readFile(LOUNGE, 'utf8'), readFile(HUMANS, 'utf8')]);
  const sandbox: Record<string, unknown> = { Math };
  vm.createContext(sandbox);
  vm.runInContext(
    `${humans}\n${designData(html)}\n` +
      'var OUT = { hq: HQ, people: REMOTE.map((p) => ({ key: p.key, name: p.name, title: p.title, city: p.city, lon: p.lon, lat: p.lat, line: p.line, svg: jgMod(p.key, human(p.spec, "__ID__"), "__ID__") })) };',
    sandbox,
  );
  const out = sandbox.OUT as {
    hq: { city: string; lon: number; lat: number };
    people: RemoteJger[];
  };
  out.people = out.people.filter((p) => !OMIT.has(p.key));

  const lines: string[] = [
    '// GENERATED FILE -- do not hand-edit.',
    '// Run `npm run build:remote-lounge` to regenerate (see',
    '// scripts/remote-lounge-figures.ts), from `design/Remote Area.html` and',
    '// `design/build/humans.js`.',
    '',
    '/** One JGer outside HQ, from the Remote Lounge design, in its own order. */',
    'export interface RemoteJger {',
    "  /** The design's own key, e.g. `bessler`. */",
    '  key: string;',
    "  /** This person's `CARD_FIGURES` key. */",
    '  card: RemoteLoungeCardId;',
    '  name: string;',
    '  /** The design\'s title, verbatim (it still says "Title TBD" where it has none). */',
    '  title: string;',
    '  city: string;',
    '  lon: number;',
    '  lat: number;',
    "  /** The design's quote, without its literal quote marks. */",
    '  line: string;',
    '}',
    '',
    `export const HQ_LOCATION = ${JSON.stringify(out.hq)} as const;`,
    '',
    "/** Each remote JGer's finished figure, in figure viewBox units (`0 0 120 130`). */",
    'export const REMOTE_LOUNGE_CARD_FIGURES = {',
  ];
  for (const p of out.people) {
    lines.push(`  ${cardKey(p.key)}: ${JSON.stringify(p.svg)},`);
  }
  lines.push(
    '};',
    '',
    'export type RemoteLoungeCardId = keyof typeof REMOTE_LOUNGE_CARD_FIGURES;',
    '',
  );
  lines.push('export const REMOTE_JGERS: readonly RemoteJger[] = [');
  for (const p of out.people) {
    const entry = {
      key: p.key,
      card: cardKey(p.key),
      name: p.name,
      title: p.title,
      city: p.city,
      lon: p.lon,
      lat: p.lat,
      line: unquote(p.line),
    };
    lines.push(`  ${JSON.stringify(entry)},`);
  }
  lines.push('];', '');

  await writeFile(OUT, lines.join('\n'), 'utf8');
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT)} (${out.people.length} remote JGers)`);
}

await main();
