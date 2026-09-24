// Exports the five prototype Room backgrounds from the design/ mirror
// (see design/SYNC-LOG.md — design/ is a byte-exact mirror, never edited by
// this script) into public/rooms/<RoomId>.png.
//
// For each Room this:
//   1. Serves design/ over a local static HTTP server (the .dc.html pages
//      load ./support.js and _ds/** relatively, and support.js itself pulls
//      React/ReactDOM/Babel from a CDN — see design/support.js's cdn.ts
//      section — so this needs network access to unpkg.com).
//   2. Opens the mapped .dc.html file in Playwright Chromium at 1600x900.
//   3. Freezes all CSS animations at their rest frame (see freezeAnimations)
//      before the design runtime boots, so nothing is mid-transition.
//   4. Hides every element listed in that Room's LIVE_ELEMENT_RULES entry —
//      HUD chrome, NPCs/walking characters/Penguins, and speech/name
//      bubbles — leaving only the floor, walls, furniture and fixed props.
//   5. Screenshots the resulting 1600x900 Stage to public/rooms/<id>.png.
//
// Run with `npm run export:room-art`. Rerunning after a design resync is
// safe and idempotent (same rules, same output paths).
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DESIGN_DIR = path.join(REPO_ROOT, 'design');
const OUTPUT_DIR = path.join(REPO_ROOT, 'public', 'rooms');
const STAGE_WIDTH = 1600;
const STAGE_HEIGHT = 900;
const MAX_BYTES = 1.5 * 1024 * 1024;

type RoomId = 'town-center' | 'dev-pit' | 'the-melt' | 'roof-deck' | 'igloo';

// D1: Room -> design file mapping (see the #16 execution plan comment).
const ROOM_FILES: Record<RoomId, string> = {
  'town-center': 'Room 01 Town Center.dc.html',
  'dev-pit': 'Room 02 Dev Pit.dc.html',
  'the-melt': 'Room 04 Kitchen.dc.html', // The Melt is the Kitchen.
  'roof-deck': 'Room 05 Roof Deck.dc.html', // not the "05b ... Day" variant.
  igloo: 'Room 06 Igloo.dc.html',
};

// A hide rule targets one of three shapes the design markup uses for a live
// (non-architectural) element — see the per-room comments below for why
// each one was classified as live.
type HideRule =
  // Elements whose inline style plays one of these CSS @keyframes. Used for
  // moving/blinking figures and props; hiding a character's outer wrapper
  // also hides anything the design nests inside it (name bubble, held
  // props, etc.) for free.
  | { kind: 'animation'; names: string[]; comment: string }
  // Static (non-animated) SVG <text> labels — name plates and speech
  // bubbles. The design draws each as a flat, ungrouped run of sibling
  // elements (an optional character <svg>, then a <rect> background, then
  // an optional <polygon> speech-bubble tail, then the <text>) rather than
  // wrapping them in their own <g>, so hiding one means walking back over
  // up to 2 preceding svg/rect/polygon siblings of the exact-matching text.
  | { kind: 'labels'; texts: string[]; comment: string }
  // HTML/DIV HUD chrome. `anchor` is a literal text string known to be
  // unique on the page; `companions` (which includes the anchor) is the
  // full set of literal strings that must all appear somewhere in the
  // hidden container, so the algorithm climbs from the anchor's own
  // element up through ancestors until it finds the smallest one whose
  // combined text contains every companion string.
  | { kind: 'cluster'; anchor: string; companions: string[]; comment: string };

// LIVE_ELEMENT_RULES: one entry per Room, hand-derived by rendering each
// design file and inspecting its DOM (see #16 execution plan, D2-D4).
// Anything not covered by a rule here is treated as static Room art (floor,
// walls, furniture, fixed signage/props) and is kept.
const LIVE_ELEMENT_RULES: Record<RoomId, HideRule[]> = {
  'town-center': [
    {
      kind: 'animation',
      names: ['walkDarrin'],
      comment:
        "Darrin Jahnel's walking figure. His name bubble, fist-pump gesture, and both speech bubbles are nested inside this group and are hidden with it.",
    },
    {
      kind: 'animation',
      names: ['walkSyd'],
      comment:
        "Sydney Murauskas's walking figure, with her nested name bubble, trophy-reach/trophy-show props, and both speech bubbles.",
    },
    {
      kind: 'animation',
      names: ['walkJon'],
      comment:
        "Jon Keller's walking figure, with his nested name bubble, the 'magic trick' prop, and his speech bubble.",
    },
    {
      kind: 'animation',
      names: ['jump'],
      comment:
        "Jory Hutchins's bouncing 'SURVIVOR' trophy-case badge, with her nested name bubble. Ambiguous: this reads as much like a fixed trophy-case fixture as a live NPC easter egg -- treated as live (it's an animated, individually-named character moment) and hidden; reviewable.",
    },
    {
      kind: 'animation',
      names: ['sayJory'],
      comment: "Jory Hutchins's speech bubble (a sibling of, not nested in, the jump group above).",
    },
    {
      kind: 'animation',
      names: ['swim'],
      comment: 'Gil the betta fish swimming in his desk tank -- a live pet, not fixed furniture.',
    },
    { kind: 'animation', names: ['feedMe'], comment: "'feed me' speech bubble for Gil the fish." },
    {
      kind: 'animation',
      names: ['riders'],
      comment: 'Silhouettes of penguins riding the elevator, visible through its window.',
    },
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking 'KITCHEN' room-exit nav pill (HUD).",
    },
    {
      kind: 'labels',
      texts: ['Front Desk', 'Welcome to JG HQ!', 'You', 'Gil · betta'],
      comment:
        'Static (non-animated) name/speech labels not wrapped in an animated group: the Front Desk receptionist (a penguin NPC) and her greeting bubble, the local player\'s "You" nameplate, and the fish tank\'s name label.',
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '01 · TOWN CENTER'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'TOWN CENTER',
      companions: ['TOWN CENTER', 'JG HQ · 108 STATE ST · FLOOR 5 · 4 PENGUINS HERE'],
      comment: 'Room title/subtitle banner (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'MENU',
      companions: ['1,250', '12 ONLINE', 'MENU', 'QUEST'],
      comment: 'Top-right token/presence/menu/quest HUD cluster.',
    },
    {
      kind: 'cluster',
      anchor: 'EMOTE',
      companions: ['EMOTE', 'SNOWBALL', 'QUESTS'],
      comment: 'Bottom chat/action toolbar (HUD).',
    },
  ],
  'dev-pit': [
    {
      kind: 'animation',
      names: ['domHop', 'hop2'],
      comment:
        "Dom's parkour-hopping walking figure (with nested name/speech) and his hop sub-animation.",
    },
    {
      kind: 'animation',
      names: ['ryanWalk', 'ryanDance'],
      comment: "Ryan's walking figure (with nested name/speech) and his dance sub-animation.",
    },
    {
      kind: 'animation',
      names: ['samWalk', 'samSpin'],
      comment: "Sam's walking figure (with nested name/speech) and his spin sub-animation.",
    },
    { kind: 'animation', names: ['doodle'], comment: 'Animated whiteboard doodle prop.' },
    {
      kind: 'animation',
      names: ['scribble'],
      comment: "Pen-scribbling prop motion, reused by Ryan's and Sam's figures.",
    },
    { kind: 'animation', names: ['chuck'], comment: 'A thrown object animating near Ashley.' },
    {
      kind: 'animation',
      names: ['idle'],
      comment: 'Subtle idle motion inside stationary NPC figures (Ian, Steven).',
    },
    {
      kind: 'animation',
      names: ['say'],
      comment: 'Generic speech-bubble caption keyframe, reused by every character in this Room.',
    },
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking '↙ TOWN CENTER' room-exit nav pill (HUD).",
    },
    {
      kind: 'labels',
      texts: ['Ashley', 'Ian', 'Matt', 'Steven', 'You'],
      comment:
        'Stationary NPCs/Penguins drawn as flat, non-animated svg+nameplate pairs (Matt and "You" are Penguins; the rest are human NPCs).',
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '02 · DEV PIT'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'DEV PIT',
      companions: ['DEV PIT', 'TEAM RMS 1–4 · FLOOR 5 · 4 PENGUINS HERE · BUILD PASSING'],
      comment: 'Room title/subtitle banner (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'MENU',
      companions: ['1,250', '12 ONLINE', 'MENU', 'QUEST'],
      comment: 'Top-right token/presence/menu/quest HUD cluster.',
    },
    {
      kind: 'cluster',
      anchor: 'EMOTE',
      companions: ['EMOTE', 'SNOWBALL', 'QUESTS'],
      comment: 'Bottom chat/action toolbar (HUD).',
    },
  ],
  'the-melt': [
    // Every character in this Room is a flat, non-animated svg+nameplate
    // pair (confirmed by inspection -- no CSS keyframes are applied to any
    // figure here), so this Room has no `animation` rules for characters.
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking '↙ TOWN CENTER' / 'ROOF DECK ↗' room-exit nav pills (HUD).",
    },
    {
      kind: 'labels',
      texts: [
        'Chef Chelsea',
        'Fresh pot!',
        'Chelsea Merrill',
        'Flip it NOW.',
        'who took my yogurt',
        'Tonya',
        'Jesse',
        'You',
      ],
      comment:
        'Stationary NPCs/Penguins and their name/speech labels: two cook NPCs (Chef Chelsea, Chelsea Merrill) plus their bubbles, a floating "who took my yogurt" bubble, the Tonya and Jesse penguin NPCs, and the local player.',
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '04 · KITCHEN (BREAK ROOM)'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'THE MELT',
      companions: ['THE MELT', 'KITCHEN · FLOOR 5 · 4 PENGUINS HERE · COFFEE: FRESH'],
      comment: 'Room title/subtitle banner (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'MENU',
      companions: ['1,250', '12 ONLINE', 'MENU', 'QUEST'],
      comment: 'Top-right token/presence/menu/quest HUD cluster.',
    },
    {
      kind: 'cluster',
      anchor: 'EMOTE',
      companions: ['EMOTE', 'SNOWBALL', 'QUESTS'],
      comment: 'Bottom chat/action toolbar (HUD).',
    },
  ],
  'roof-deck': [
    {
      kind: 'animation',
      names: ['idle'],
      comment: 'Subtle idle motion inside stationary vendor NPCs (Kevin, Ann Marie, Josh, Casey).',
    },
    {
      kind: 'animation',
      names: ['say'],
      comment: 'Generic speech-bubble caption keyframe, reused by every character in this Room.',
    },
    {
      kind: 'animation',
      names: ['hop'],
      comment:
        "The Hexle toy demo bouncing near Kevin's stall (matches his 'Hexles bounce' line), and Millie/You's own hop sub-animation.",
    },
    {
      kind: 'animation',
      names: ['mkMillie'],
      comment: "Millie's stationary vendor figure and nested name/speech.",
    },
    {
      kind: 'animation',
      names: ['mkBrandonGallop', 'gallop'],
      comment:
        "Brandon's figure (riding a Hexle) with nested name/speech, and his gallop sub-animation.",
    },
    {
      kind: 'animation',
      names: ['mkAnthony', 'cast', 'line'],
      comment:
        "Anthony's phishing-themed figure with nested name/speech, and his fishing cast/line props.",
    },
    {
      kind: 'animation',
      names: ['mkTristin'],
      comment: "Tristin's figure with nested name/speech.",
    },
    {
      kind: 'animation',
      names: ['mkYou'],
      comment: "The local player's figure with nested name/speech.",
    },
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking '↙ ELEVATOR · STAIRS · KITCHEN' room-exit nav pill (HUD).",
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '05 · ROOF DECK MARKET'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'THE MARKET',
      companions: ['THE MARKET', 'ROOF DECK MARKETPLACE · SPEND YOUR TOKENS · 12°F · 9 SHOPPERS'],
      comment: 'Room title/subtitle banner (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'MENU',
      companions: ['1,250', '12 ONLINE', 'MENU'],
      comment: 'Top-right token/presence/menu HUD cluster (this Room has no quest tracker).',
    },
    {
      kind: 'cluster',
      anchor: 'EMOTE',
      companions: ['EMOTE', 'SNOWBALL', 'QUESTS'],
      comment: 'Bottom chat/action toolbar (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'TALK TO A VENDOR TO OPEN',
      companions: ['TALK TO A VENDOR TO OPEN', 'BALANCE'],
      comment:
        'The open shop/market side panel (CAPS/HEXLES/IGLOO/EMOTES tabs, item cards, balance) (HUD).',
    },
  ],
  igloo: [
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking '↙ TOWN CENTER' room-exit nav pill (HUD).",
    },
    {
      kind: 'labels',
      texts: ['home sweet ice', 'You', 'Hexle · Bit'],
      comment:
        'The local player\'s stationary figure/nameplate and speech bubble, and the pet Hexle "Bit" -- a live pet, not fixed furniture (compare Gil the fish in Town Center).',
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '06 · IGLOO (PLAYER HOME)'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'YOUR IGLOO',
      companions: ['YOUR IGLOO', 'PLAYER HOME · 1 PENGUIN · 1 HEXLE · 6 FURNITURE SLOTS'],
      comment: 'Room title/subtitle banner (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'MENU',
      companions: ['1,250', '12 ONLINE', 'MENU', 'QUEST'],
      comment: 'Top-right token/presence/menu/quest HUD cluster.',
    },
    {
      kind: 'cluster',
      anchor: 'EMOTE',
      companions: ['EMOTE', 'SNOWBALL', 'QUESTS'],
      comment: 'Bottom chat/action toolbar (HUD).',
    },
  ],
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function serveDesignDir(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const requestUrl = req.url ?? '/';
      const decodedPath = decodeURIComponent(requestUrl.split('?')[0] ?? '/');
      const filePath = path.join(DESIGN_DIR, decodedPath);
      if (!filePath.startsWith(DESIGN_DIR)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      readFile(filePath)
        .then((data) => {
          const ext = path.extname(filePath);
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
          res.end(data);
        })
        .catch(() => {
          res.writeHead(404);
          res.end('not found');
        });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('failed to bind static server'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

// Runs in the browser context (page.addInitScript): pauses every CSS
// animation at its 0% keyframe before the design runtime boots, so the
// screenshot never lands mid-transition.
function freezeAnimations(): void {
  const style = document.createElement('style');
  style.textContent =
    '*, *::before, *::after { animation-play-state: paused !important; animation-delay: 0s !important; transition: none !important; }';
  const attach = () => {
    if (document.head) document.head.appendChild(style);
  };
  attach();
  document.addEventListener('DOMContentLoaded', attach);
}

// Runs in the browser context (page.evaluate) against one Room's rules.
function hideLiveElements(rules: HideRule[]): void {
  const CHROME_TAGS = new Set(['rect', 'polygon', 'svg', 'path', 'circle', 'ellipse', 'line']);

  function hideAnimationNames(names: string[]): void {
    const wanted = new Set(names);
    document.querySelectorAll<HTMLElement | SVGElement>('[style]').forEach((el) => {
      const raw = el.getAttribute('style') ?? '';
      if (!raw.includes('animation')) return;
      const animationName = getComputedStyle(el).animationName;
      if (!animationName || animationName === 'none') return;
      const active = animationName.split(',').map((n) => n.trim());
      if (active.some((n) => wanted.has(n))) {
        el.style.setProperty('display', 'none', 'important');
      }
    });
  }

  function hideLabels(texts: string[]): void {
    const wanted = new Set(texts);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const matches: Element[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue ? node.nodeValue.trim() : '';
      if (wanted.has(value) && node.parentElement) matches.push(node.parentElement);
    }
    for (const textEl of matches) {
      const toHide: Element[] = [textEl];
      let sibling = textEl.previousElementSibling;
      let hops = 0;
      while (sibling && hops < 2 && CHROME_TAGS.has(sibling.tagName.toLowerCase())) {
        toHide.push(sibling);
        sibling = sibling.previousElementSibling;
        hops++;
      }
      for (const el of toHide)
        (el as HTMLElement | SVGElement).style.setProperty('display', 'none', 'important');
    }
  }

  function hideCluster(anchor: string, companions: string[]): void {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    let anchorNode: Node | null = null;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim() === anchor) {
        anchorNode = node;
        break;
      }
    }
    if (!anchorNode?.parentElement) {
      console.warn('[export-room-art] cluster anchor not found: ' + anchor);
      return;
    }
    let el: Element | null = anchorNode.parentElement;
    let levels = 0;
    while (el && levels < 8) {
      const text = el.textContent ?? '';
      if (companions.every((c) => text.includes(c))) break;
      el = el.parentElement;
      levels++;
    }
    if (!el) {
      console.warn('[export-room-art] cluster ancestor not found for: ' + anchor);
      return;
    }
    (el as HTMLElement).style.setProperty('display', 'none', 'important');
  }

  for (const rule of rules) {
    if (rule.kind === 'animation') hideAnimationNames(rule.names);
    else if (rule.kind === 'labels') hideLabels(rule.texts);
    else hideCluster(rule.anchor, rule.companions);
  }
}

async function exportRoom(
  browser: import('@playwright/test').Browser,
  port: number,
  roomId: RoomId,
): Promise<{ roomId: RoomId; outPath: string; bytes: number }> {
  const file = ROOM_FILES[roomId];
  const rules = LIVE_ELEMENT_RULES[roomId];
  const page = await browser.newPage({ viewport: { width: STAGE_WIDTH, height: STAGE_HEIGHT } });

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.addInitScript(freezeAnimations);
  await page.goto(`http://127.0.0.1:${port}/${encodeURIComponent(file)}`, { waitUntil: 'load' });
  await page.waitForSelector('#dc-root', { timeout: 15_000 });
  // Let the CDN-loaded React/design runtime finish its first paint, and let
  // the @font-face fonts finish loading -- without this, two runs can race
  // a fallback-vs-real-font repaint and produce slightly different pixels.
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.fonts.ready);

  if (pageErrors.length > 0) {
    await page.close();
    throw new Error(`${file} raised page errors: ${pageErrors.join('; ')}`);
  }

  await page.evaluate(hideLiveElements, rules);
  await page.waitForTimeout(50);

  const outPath = path.join(OUTPUT_DIR, `${roomId}.png`);
  await page.screenshot({
    path: outPath,
    clip: { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT },
  });
  await page.close();

  const { size } = await stat(outPath);
  return { roomId, outPath, bytes: size };
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const { server, port } = await serveDesignDir();
  const browser = await chromium.launch();

  try {
    const results: Array<{ roomId: RoomId; outPath: string; bytes: number }> = [];
    for (const roomId of Object.keys(ROOM_FILES) as RoomId[]) {
      const result = await exportRoom(browser, port, roomId);
      results.push(result);
      const kb = (result.bytes / 1024).toFixed(0);
      const warn = result.bytes > MAX_BYTES ? '  ** OVER 1.5 MB **' : '';
      console.log(
        `  ${result.roomId.padEnd(12)} -> ${path.relative(REPO_ROOT, result.outPath)} (${kb} KB)${warn}`,
      );
    }

    const oversized = results.filter((r) => r.bytes > MAX_BYTES);
    if (oversized.length > 0) {
      throw new Error(
        `${oversized.length} Room PNG(s) exceed the 1.5 MB budget: ${oversized.map((r) => r.roomId).join(', ')}`,
      );
    }
    console.log(
      `\nExported ${results.length} Room background(s) to ${path.relative(REPO_ROOT, OUTPUT_DIR)}/`,
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
