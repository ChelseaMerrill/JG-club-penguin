// Exports the Room backgrounds from the design/ mirror
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
// Run with `npm run export:room-art` to export every Room, or name Room ids
// to export only those (`npm run export:room-art -- the-icebox`), so adding
// one Room never re-encodes the others' PNGs (#51 D3). Rerunning after a
// design resync is safe and idempotent (same rules, same output paths).
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
// The Stage element's own CSS selector (`data-screen-label` is the design
// runtime's per-Room Stage marker -- see every `design/Room *.dc.html`'s
// `<div data-screen-label="...">`). Every export screenshots exactly this
// element, never the viewport: the design's outer `<section>` has 40px of
// padding and a breadcrumb row above the Stage, so once
// `hideLiveElements`'s HUD cluster rule removes that breadcrumb, the Stage
// sits at roughly (40, 40) in the *viewport*, not (0, 0) -- clipping the
// viewport itself (#16 fix 1) shifted every exported PNG by that offset and
// cropped its right/bottom 40px. A locator screenshot of the Stage element
// is immune to this: it captures exactly the element's own 1600x900 box
// regardless of where the surrounding layout puts it.
const STAGE_SELECTOR = '[data-screen-label]';
// How long `hideLiveElements`'s DOM mutations (display:none on hidden
// clusters) take to settle before the screenshot, so the layout reflow from
// hiding elements never lands mid-frame.
const POST_HIDE_SETTLE_MS = 50;
const PAGE_LOAD_TIMEOUT_MS = 15_000;
// Page errors every design with its own logic raises harmlessly (#51): the
// browser also runs a file's inline `<script data-dc-script>` as a classic
// script while parsing, where its `class Component extends DCLogic` throws
// because `DCLogic` is no global; `design/support.js` then reads that same
// script's text and runs it itself with `DCLogic` in scope, which is the
// run that actually drives the Room. The Icebox is the first exported Room
// with such a script.
const BENIGN_PAGE_ERRORS: readonly RegExp[] = [/^DCLogic is not defined$/];

type RoomId = 'town-center' | 'dev-pit' | 'the-melt' | 'roof-deck' | 'igloo' | 'the-icebox';

// Per-Room overrides of STAGE_SELECTOR (#51 D3), for a design file whose
// first `data-screen-label` element isn't the Stage this Room exports (e.g.
// a file drawing several Stages). A Room not listed here uses the default.
const STAGE_SELECTORS: Partial<Record<RoomId, string>> = {
  // The Icebox file's only Stage element. Its label also appears a second
  // time inside the design's own <script> (a `querySelector` string), which
  // is text, not an element, so the default already matches just this one;
  // named explicitly so the exported Stage is unambiguous.
  'the-icebox': '[data-screen-label="THE ICEBOX (CONFERENCE)"]',
};

// D1: Room -> design file mapping (see the #16 execution plan comment).
const ROOM_FILES: Record<RoomId, string> = {
  'town-center': 'Room 01 Town Center.dc.html',
  'dev-pit': 'Room 02 Dev Pit.dc.html',
  'the-melt': 'Kitchen.dc.html', // RoomId `the-melt` stays; the design now calls it THE KITCHEN (#92 D1).
  'roof-deck': 'Room 05 Roof Deck.dc.html', // not the "05b ... Day" variant.
  igloo: 'Room 06 Igloo.dc.html',
  'the-icebox': 'Room 03 The Icebox.dc.html', // #51 D1.
};

// A hide rule targets one of three shapes the design markup uses for a live
// (non-architectural) element — see the per-room comments below for why
// each one was classified as live.
type HideRule =
  // Elements whose inline style plays one of these CSS @keyframes. Used for
  // moving/blinking figures and props; hiding a character's outer wrapper
  // also hides anything the design nests inside it (name bubble, held
  // props, etc.) for free. `except` (#100) protects elements that would
  // otherwise match by shared animation name but must stay in the art. A
  // matching element that is, or sits inside, a node matching one of these
  // selectors is skipped whole. A matching element that merely *contains* a
  // protected node is not skipped wholesale: only the branch leading down to
  // the protected node is kept, and every sibling subtree along that branch
  // is hidden (see `hideAnimationNames`).
  | { kind: 'animation'; names: string[]; except?: string[]; comment: string }
  // Static (non-animated) SVG <text> labels — name plates and speech
  // bubbles. The design draws each as a flat, ungrouped run of sibling
  // elements (an optional character <svg>, then a <rect> background, then
  // an optional <polygon> speech-bubble tail, then the <text>) rather than
  // wrapping them in their own <g>, so hiding one means walking back over
  // up to 2 preceding svg/rect/polygon siblings of the exact-matching text.
  | { kind: 'labels'; texts: string[]; comment: string }
  // Static <text> labels whose whole character is wrapped in one plain,
  // un-animated <g> (#51): hides the exact-matching <text>'s parent <g>, so
  // the figure, its ground shadow, nameplate and nested speech bubbles all
  // go with it. `labels` can't reach these: its sibling walk stops at the
  // <g> wrapping the figure, leaving the shadow ellipse baked in.
  | { kind: 'label-group'; texts: string[]; comment: string }
  // Exact-matching <text> elements only (#77): unlike `labels`, this never
  // touches preceding siblings, so a backing shape the <text> sits inside
  // (a hexagon badge, a banner plate) stays in the exported art -- only the
  // baked glyph run itself is hidden, because a live DOM overlay redraws it
  // sharp instead (see the #77 execution plan and `src/ui/wall-text/
  // wall-text.ts`). Matches on the element's own `transform` attribute too,
  // not text content alone: Town Center's "SERVE" text also appears a second
  // time (an already-hidden trophy-badge icon nested in Sydney's own
  // `walkSyd`/`trophyShow` animation group), and the two would otherwise be
  // ambiguous. Matching by `transform` also means a future design change
  // that moves a label harmlessly stops matching, rather than silently
  // hiding the wrong node.
  | { kind: 'text-only'; entries: { text: string; transform: string }[]; comment: string }
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
      kind: 'text-only',
      // Each `transform` is copied verbatim from `design/Room 01 Town
      // Center.dc.html`'s own five `<text transform="matrix(1 0.5 0 1 x
      // y)">` elements (#77 D2): this is also what `RoomWallText.x`/`y`/
      // `skewY` in `src/game/rooms/definitions/town-center.ts` were traced
      // from.
      entries: [
        { text: 'CORE VALUES', transform: 'matrix(1 0.5 0 1 1045.0 217.5)' },
        { text: 'SERVE', transform: 'matrix(1 0.5 0 1 995.0 224.0)' },
        { text: 'GRIND', transform: 'matrix(1 0.5 0 1 1028.5 240.8)' },
        { text: 'GROW', transform: 'matrix(1 0.5 0 1 1062.0 257.5)' },
        { text: 'INSPIRE', transform: 'matrix(1 0.5 0 1 1095.5 274.3)' },
      ],
      comment:
        'The Core Values poster\'s heading and four hexagon labels (#77): redrawn live by src/ui/wall-text/wall-text.ts, since the design bakes them at a font-size/letter-spacing that overflows their hexagons. The hexagon/banner backing shapes themselves are kept (only the exact-matching <text> is hidden, not preceding siblings) -- see the "text-only" HideRule kind above.',
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
    // #92 D3 resync: the design now names a single "Chelsea" (near the
    // pancake station) instead of the pre-resync "Chef Chelsea"/"Chelsea
    // Merrill" pair, and adds "Tom", a walking, coffee-obsessed NPC.
    // Chelsea, Tonya and Jesse are still flat, non-animated svg+nameplate
    // pairs; only Tom and every speech bubble use CSS keyframes.
    {
      kind: 'animation',
      names: ['blink'],
      comment:
        "Blinking '↙ TOWN CENTER' / 'ROOF DECK ↗' room-exit nav pills, and the new 'TALK · PANCAKE FLIP' / 'TALK · COFFEE RUSH' minigame prompt pills (all HUD).",
    },
    {
      kind: 'animation',
      names: ['tomWalk'],
      comment:
        "Tom's walking figure: unlike this Room's other NPCs, his nested name/speech bubbles all sit inside his own animated group, so this one rule hides his entire figure.",
    },
    {
      kind: 'animation',
      names: ['idle'],
      comment:
        "Tonya's and Jesse's subtle idle body motion (their nameplates are static -- see the labels rule below).",
    },
    {
      kind: 'animation',
      names: ['say'],
      comment:
        'Every speech bubble in this Room (Chelsea, Tonya, Jesse and the floating "who took my yogurt" bubble), all sharing this one keyframe.',
    },
    {
      kind: 'labels',
      texts: ['Chelsea', 'Tonya', 'Jesse', 'You'],
      comment:
        'Stationary NPCs/Penguins and their nameplates: the Chelsea and Tonya/Jesse penguin NPCs, and the local player.',
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '04 · KITCHEN (BREAK ROOM)'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'THE KITCHEN',
      companions: ['THE KITCHEN', 'KITCHEN · FLOOR 5 · 4 PENGUINS HERE · COFFEE: FRESH'],
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
      // #100: the new KITCHEN floor arrow's `<a>` is the first child of
      // Kevin's own `idle` vendor wrapper (which also holds his shadow,
      // penguin svg, nameplate and say bubbles). Without this exception the
      // arrow, its shadow and its label would be hidden along with Kevin.
      // With it, the wrapper itself stays displayed but every child that
      // isn't the arrow's `<a>` -- i.e. all of Kevin -- is still hidden
      // (`hideAnimationNames`'s ancestor branch). Keeping the wrapper is safe
      // because `freezeAnimations` pins `idle` at its 0% frame,
      // `translateY(0)`, so the arrow isn't offset.
      except: ["a[href='Kitchen.dc.html']"],
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
      // #100: the new KITCHEN floor arrow's own polygon group also plays
      // `blink` (it's a real, in-scene door-equivalent, meant to stay in
      // the art); without this exception it would be hidden alongside the
      // unrelated HUD nav pill below, which shares the same keyframe name.
      except: ["a[href='Kitchen.dc.html']"],
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
  'the-icebox': [
    // #51: every character here except the local player walks a `*Roam`
    // loop, with its name bubble and `say` speech bubbles nested inside that
    // animated group, so one rule per character hides all of it.
    {
      kind: 'animation',
      names: ['milRoam'],
      comment: "Millie's roaming figure, with her nested name bubble and speech bubbles.",
    },
    {
      kind: 'animation',
      names: ['nicRoam'],
      comment:
        "Nicole's roaming figure (seated with a laptop), with her nested name bubble and speech bubbles.",
    },
    {
      kind: 'animation',
      names: ['jasRoam'],
      comment: "Jason's roaming figure, with his nested name bubble and speech bubbles.",
    },
    {
      kind: 'animation',
      names: ['jetRoam'],
      comment:
        "Jethro's roaming figure and camera rig (its flash bulb included), with his nested name bubble and speech bubbles.",
    },
    {
      kind: 'animation',
      names: ['darRoam'],
      comment: "Darrin's roaming figure, with his nested name bubble and speech bubbles.",
    },
    {
      kind: 'label-group',
      texts: ['You'],
      comment:
        'The local player\'s own Penguin: a static <g> of shadow, figure, "You" nameplate and its "Wait, I blinked." bubble.',
    },
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking '↙ TOWN CENTER' room-exit nav pill (HUD).",
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '03 · THE ICEBOX (CONFERENCE)'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'THE ICEBOX',
      companions: ['THE ICEBOX', 'CONFERENCE · 604 SF · GLASS WALL · KICKOFF IN 04:32'],
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
      anchor: 'ASK JETHRO FOR A PHOTO',
      companions: ['ASK JETHRO FOR A PHOTO', 'JETHRO ALSO SNAPS ON HIS OWN'],
      comment:
        "The design's photo panel: the ASK JETHRO FOR A PHOTO button, its photo counter and Jethro's quote pill (HUD).",
    },
    {
      kind: 'cluster',
      anchor: 'EMOTE',
      companions: ['EMOTE', 'SNOWBALL', 'QUESTS'],
      comment: 'Bottom chat/action toolbar (HUD).',
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

// Runs in the browser context (page.evaluate), after the design's React
// runtime has actually rendered the Room's `<svg>` (unlike `freezeAnimations`
// above, which runs via `addInitScript` before any of it exists): pauses
// every `<svg>`'s own SMIL (`<animate>`) timeline and resets it to time 0.
// The Kitchen's oven glow (#92 round 2 nit 5) uses `<animate>`, which
// `animation-play-state` never reaches (that CSS property only ever applies
// to CSS animations), so without this a re-export could land on whatever
// glow phase happened to be current when the screenshot fired.
function freezeSmilAnimations(): void {
  document.querySelectorAll('svg').forEach((svg) => {
    const smilSvg = svg as SVGSVGElement & {
      pauseAnimations?: () => void;
      setCurrentTime?: (time: number) => void;
    };
    smilSvg.pauseAnimations?.();
    smilSvg.setCurrentTime?.(0);
  });
}

// Runs in the browser context (page.evaluate) against one Room's rules.
function hideLiveElements(rules: HideRule[]): void {
  const CHROME_TAGS = new Set(['rect', 'polygon', 'svg', 'path', 'circle', 'ellipse', 'line']);

  const hide = (el: Element): void =>
    (el as HTMLElement | SVGElement).style.setProperty('display', 'none', 'important');

  function hideAnimationNames(names: string[], except: string[] = []): void {
    const wanted = new Set(names);
    // Elements matching an `except` selector (#100). The two tree directions
    // are handled differently:
    // - A candidate that is, or sits inside, a protected node (the Kitchen
    //   arrow's inner `blink` group is a *descendant* of its `<a>`) is
    //   skipped whole.
    // - A candidate that *contains* a protected node (Kevin's `idle` vendor
    //   wrapper is an *ancestor* of that `<a>`) is not exempted wholesale --
    //   that let all of Kevin survive in the art. Instead it stays displayed
    //   and `hideAllButProtectedBranch` hides everything in it that neither
    //   is nor contains a protected node.
    const protectedEls =
      except.length > 0 ? Array.from(document.querySelectorAll(except.join(','))) : [];
    const isInsideProtected = (el: Element): boolean =>
      protectedEls.some((p) => p === el || p.contains(el));
    const containsProtected = (el: Element): boolean => protectedEls.some((p) => el.contains(p));

    // Walks down only the branch(es) leading to a protected node, hiding every
    // sibling subtree along the way that has no protected descendant.
    function hideAllButProtectedBranch(el: Element): void {
      for (const child of Array.from(el.children)) {
        if (isInsideProtected(child)) continue;
        if (containsProtected(child)) hideAllButProtectedBranch(child);
        else hide(child);
      }
    }

    const keptAncestors: Element[] = [];
    document.querySelectorAll<HTMLElement | SVGElement>('[style]').forEach((el) => {
      const raw = el.getAttribute('style') ?? '';
      if (!raw.includes('animation')) return;
      const animationName = getComputedStyle(el).animationName;
      if (!animationName || animationName === 'none') return;
      const active = animationName.split(',').map((n) => n.trim());
      if (!active.some((n) => wanted.has(n))) return;
      if (isInsideProtected(el)) return;
      if (containsProtected(el)) {
        hideAllButProtectedBranch(el);
        keptAncestors.push(el);
        return;
      }
      hide(el);
    });

    // Guard (#100 review): an animated ancestor kept only for a protected
    // node's sake must not still render any other drawable content -- that
    // is exactly how Kevin leaked into `roof-deck.png`. Fails the export
    // loudly instead of baking a stray figure into the art. Walks each
    // element's own ancestor chain for a computed `display: none` rather
    // than using `Element.checkVisibility()`, which Chromium reports as
    // visible for an SVG shape inside a `display: none` `<g>`.
    const DRAWABLE = 'rect, polygon, svg, path, circle, ellipse, line, polyline, text, image, use';
    const isDisplayedWithin = (el: Element, root: Element): boolean => {
      for (let n: Element | null = el; n && n !== root.parentElement; n = n.parentElement) {
        if (getComputedStyle(n).display === 'none') return false;
      }
      return true;
    };
    for (const ancestor of keptAncestors) {
      const leaked = Array.from(ancestor.querySelectorAll(DRAWABLE)).filter(
        (d) => !isInsideProtected(d) && !containsProtected(d) && isDisplayedWithin(d, ancestor),
      );
      if (leaked.length > 0) {
        throw new Error(
          `animation hide rule kept an ancestor of a protected node that still draws ${leaked.length} non-protected element(s), e.g. <${leaked[0]?.tagName.toLowerCase()}>`,
        );
      }
    }
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
      // 3, not 2 (#92 round 2 nit 5): the shared `peng()` sprite this design
      // draws every static NPC/Penguin with is exactly four flat siblings --
      // ellipse (ground shadow), svg (body), rect (nameplate background),
      // text (name) -- so a 2-hop walk back from the name stopped one short,
      // at the nameplate background, always leaving the shadow ellipse
      // behind. Caught as Ian's shadow bleeding onto Dev Pit's desk B in the
      // exported art; the same shape for every other static character in
      // every Room, so the limit is raised generally rather than patched
      // per-character. Still bounded (not unlimited) so an unrelated
      // preceding shape of one of these tag kinds can never be swept in.
      while (sibling && hops < 3 && CHROME_TAGS.has(sibling.tagName.toLowerCase())) {
        toHide.push(sibling);
        sibling = sibling.previousElementSibling;
        hops++;
      }
      for (const el of toHide)
        (el as HTMLElement | SVGElement).style.setProperty('display', 'none', 'important');
    }
  }

  // #77: hides only the exact-matching <text> element itself, never any
  // preceding sibling -- unlike `hideLabels`, which also walks back over
  // chrome siblings to hide a whole name-plate/speech-bubble group. Matches
  // on both text content and the element's own `transform` attribute (see
  // the `text-only` HideRule variant's own comment for why: text content
  // alone isn't unique enough on this page).
  function hideTextOnly(entries: { text: string; transform: string }[]): void {
    // #77 review round 1 nit 8: tracks which `entries` actually matched
    // something, so a design resync that renames/moves/removes a targeted
    // label fails the export loudly instead of silently leaving a baked
    // label in the art that a live DOM overlay is also drawing over.
    const matchCounts = new Map<(typeof entries)[number], number>(entries.map((e) => [e, 0]));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue ? node.nodeValue.trim() : '';
      const el = node.parentElement;
      if (!el) continue;
      const match = entries.find(
        (entry) => entry.text === value && el.getAttribute('transform') === entry.transform,
      );
      if (match) {
        matchCounts.set(match, (matchCounts.get(match) ?? 0) + 1);
        (el as HTMLElement | SVGElement).style.setProperty('display', 'none', 'important');
      }
    }
    for (const [entry, count] of matchCounts) {
      if (count === 0) {
        throw new Error(
          `text-only hide rule matched nothing for "${entry.text}" (transform: ${entry.transform})`,
        );
      }
    }
  }

  // #51: hides the plain <g> wrapping each exact-matching <text>, and fails
  // the export loudly if a label matches nothing or sits outside such a <g>
  // (a design resync that changed the markup), rather than silently leaving
  // a baked character in the art.
  function hideLabelGroups(texts: string[]): void {
    for (const text of texts) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let group: Element | null = null;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (node.nodeValue?.trim() === text && parent?.tagName.toLowerCase() === 'text') {
          group = parent.parentElement;
          break;
        }
      }
      if (!group || group.tagName.toLowerCase() !== 'g') {
        throw new Error(`label-group hide rule found no <g>-wrapped <text> for "${text}"`);
      }
      (group as SVGElement).style.setProperty('display', 'none', 'important');
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
    if (rule.kind === 'animation') hideAnimationNames(rule.names, rule.except);
    else if (rule.kind === 'labels') hideLabels(rule.texts);
    else if (rule.kind === 'label-group') hideLabelGroups(rule.texts);
    else if (rule.kind === 'text-only') hideTextOnly(rule.entries);
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
  page.on('pageerror', (err) => {
    if (!BENIGN_PAGE_ERRORS.some((pattern) => pattern.test(err.message))) {
      pageErrors.push(err.message);
    }
  });

  await page.addInitScript(freezeAnimations);
  await page.goto(`http://127.0.0.1:${port}/${encodeURIComponent(file)}`, { waitUntil: 'load' });
  await page.waitForSelector('#dc-root', { timeout: PAGE_LOAD_TIMEOUT_MS });
  const stage = page.locator(STAGE_SELECTORS[roomId] ?? STAGE_SELECTOR);
  await stage.waitFor({ state: 'visible', timeout: PAGE_LOAD_TIMEOUT_MS });
  // Let the @font-face fonts finish loading before screenshotting -- without
  // this, two runs can race a fallback-vs-real-font repaint and produce
  // slightly different pixels.
  await page.evaluate(() => document.fonts.ready);
  // Only reachable now that the design's `<svg>` actually exists (see
  // `freezeSmilAnimations`'s own comment).
  await page.evaluate(freezeSmilAnimations);

  if (pageErrors.length > 0) {
    await page.close();
    throw new Error(`${file} raised page errors: ${pageErrors.join('; ')}`);
  }

  await page.evaluate(hideLiveElements, rules);
  await page.waitForTimeout(POST_HIDE_SETTLE_MS);

  const outPath = path.join(OUTPUT_DIR, `${roomId}.png`);
  // A locator screenshot of the Stage element itself (#16 fix 1), not a
  // viewport clip: the Stage never actually sits at viewport (0, 0) once its
  // breadcrumb sibling is hidden (see STAGE_SELECTOR's comment above).
  await stage.screenshot({ path: outPath });
  await page.close();

  const { size } = await stat(outPath);
  return { roomId, outPath, bytes: size };
}

/**
 * The Rooms to export: every Room when no ids are given, otherwise exactly
 * the named ones (#51 D3). Throws on an unknown id rather than skipping it.
 */
function selectRoomIds(args: readonly string[]): RoomId[] {
  const all = Object.keys(ROOM_FILES) as RoomId[];
  if (args.length === 0) return all;
  const unknown = args.filter((arg) => !(all as string[]).includes(arg));
  if (unknown.length > 0) {
    throw new Error(`Unknown Room id(s): ${unknown.join(', ')}. Known: ${all.join(', ')}`);
  }
  return all.filter((id) => args.includes(id));
}

async function main(): Promise<void> {
  const roomIds = selectRoomIds(process.argv.slice(2));
  await mkdir(OUTPUT_DIR, { recursive: true });
  const { server, port } = await serveDesignDir();
  const browser = await chromium.launch();

  try {
    const results: Array<{ roomId: RoomId; outPath: string; bytes: number }> = [];
    for (const roomId of roomIds) {
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
