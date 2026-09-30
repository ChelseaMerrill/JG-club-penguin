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

type RoomId =
  | 'town-center'
  | 'dev-pit'
  | 'the-melt'
  | 'roof-deck'
  | 'igloo'
  | 'the-icebox'
  | 'office-hallway'
  | 'team-room-1'
  | 'team-room-2'
  | 'team-room-3'
  | 'team-room-4'
  | 'bathroom'
  | 'the-mullet';

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
  'office-hallway': 'Room 11 Office Hallway.dc.html', // #51 D1: the design calls it THE CORRIDOR.
  'team-room-1': 'Team Room 1.dc.html',
  'team-room-2': 'Team Room 2.dc.html',
  'team-room-3': 'Team Room 3.dc.html',
  'team-room-4': 'Team Room 4.dc.html',
  bathroom: 'Room 13 Bathroom.dc.html', // #51 D1: the design calls it THE THAW ROOM.
  'the-mullet': 'The Mullet.dc.html', // #51 slice 3: THE MULLET (MEZZANINE).
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
  // Exact CSS selectors (#51), each of which must match exactly one element
  // (the export fails otherwise). For a character the design draws as loose,
  // unlabelled pieces interleaved with the furniture around it (a figure
  // `<svg>` seated between a couch's faces, a shadow drawn before the desk
  // in front of it), which no text-anchored rule can reach without also
  // sweeping up that furniture. Each selector pins the element by its own
  // position attributes, so a design resync that moves it stops the export.
  // Also used for a standalone non-working floor-arrow decal (#132): these
  // are bare, unlabelled `<polygon>`s with no nearby text or animation name
  // to anchor a `labels`/`animation` rule, so each is pinned by its own
  // exact `points` attribute instead.
  | { kind: 'selector'; selectors: string[]; comment: string }
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
      texts: ['Front Desk', 'Welcome to JG HQ!', 'You'],
      comment:
        'Static (non-animated) name/speech labels not wrapped in an animated group: the Front Desk receptionist (a penguin NPC) and her greeting bubble, and the local player\'s "You" nameplate.',
    },
    {
      kind: 'selector',
      selectors: ['rect[x="1162.5"][y="448.25"]', 'text[x="1192.5"][y="459.25"]'],
      comment:
        "#132 review fix: the fish tank's 'Gil · betta' nameplate background and label text, hidden individually rather than through the `labels` rule above -- that rule's 3-sibling walk back from the text passes the nameplate rect and then the tank glass's two closing `<line>` edges, hiding the tank's front vertical edge along with the nameplate and leaving a visibly broken tank in the exported art. Both tank edges stay visible with this rule instead.",
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
      kind: 'selector',
      selectors: [
        'polygon[points="940,740 970,755 935,772.5 945,777.5 890,780 895,752.5 905,757.5"]',
      ],
      comment:
        "#132: an unlabelled floor-arrow decal near the Front Desk that isn't a working door -- Town Center's real exits (The Icebox, Dev Pit, the elevator/stairwell) are the labelled wall signage, not this arrow.",
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
      kind: 'selector',
      selectors: [
        'polygon[points="395,467.5 330,500 395,532.5 420,520 385,502.5 445,502.5 445,482.5 400,495"]',
      ],
      comment:
        "#132: an unlabelled floor-arrow decal by the left-wall counter that isn't a working door -- the Kitchen's real exits (Town Center, Roof Deck) are the labelled wall signage, each a framed door (not an elevator), not this arrow.",
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
      kind: 'selector',
      selectors: [
        'polygon[points="395,467.5 330,500 395,532.5 420,520 385,502.5 445,502.5 445,482.5 400,495"]',
      ],
      comment:
        "#132: an unlabelled floor-arrow decal by the left wall that isn't a working door -- the Icebox's only real exit (Town Center) is the labelled elevator, not this arrow.",
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
  'office-hallway': [
    // #51: every character here is a flat, un-animated `peng()`-style run of
    // shadow, figure, nameplate and (optional) speech bubble.
    {
      kind: 'labels',
      texts: [
        'You',
        'Michael S.',
        'standup in 5',
        'Samantha',
        'Daniel',
        'Emily Smith',
        'Joining JG?',
        'Anthony Conway',
        'Is this link safe?',
      ],
      comment:
        'The local player, the Michael S., Samantha and Daniel Penguins, and Emily Smith and Anthony Conway, with their nameplates and speech bubbles.',
    },
    {
      kind: 'selector',
      selectors: [
        'polygon[points="720,384 655,416.5 720,449 745,436.5 710,419 770,419 770,399 725,411.5"]',
      ],
      comment:
        "The Hallway's unlabelled floor arrow pointing toward TOWN CENTER (#132): unlike the labelled 'TEAM ROOM 7/8/9 ↓' floor markers (disabled doors, kept), clicking this one does nothing. The wall's own '↙ TOWN CENTER' door stays -- see the 'blink' rule below.",
    },
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking '↙ TOWN CENTER' and 'TEAM ROOMS 1–6 ↘' room-exit nav pills (HUD).",
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '11 · OFFICE HALLWAY (O1–O9)'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'THE CORRIDOR',
      companions: ['THE CORRIDOR', 'OFFICES 1–9 · KNOCK BEFORE YOU WADDLE · 4 PENGUINS'],
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
  'team-room-1': [
    {
      kind: 'animation',
      names: ['domrun'],
      comment:
        "Dom's running figure: an HTML overlay whose name bubble and `domtalk` speech bubble are nested inside its own animated wrapper.",
    },
    {
      kind: 'cluster',
      anchor: 'Jethro',
      companions: ['Jethro', "Act natural. Camera's rolling."],
      comment:
        "Jethro's HTML overlay: his speech bubble, nameplate, bobbing figure (camera flash included) and shadow share one un-animated wrapper.",
    },
    {
      kind: 'labels',
      texts: ['You'],
      comment: "The local player's static figure and nameplate.",
    },
    // #132's floor-arrow hide rule is gone (owner request, 2026-09-30, Track
    // D): the 2026-09-27 design resync removed that arrow from the design
    // itself, so the rule matched nothing and stopped this Room's export.
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking 'HALLWAY ↓' room-exit nav pill (HUD).",
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '08 · TEAM ROOM 1 · AI LAB'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'TEAM ROOM 1',
      companions: ['TEAM ROOM 1', 'TEAM RM 1 · 337 SF · 2 GPU RACKS · TRAINING 73% · 3 PENGUINS'],
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
  'team-room-2': [
    {
      kind: 'cluster',
      anchor: 'Ian',
      companions: ['Ian', 'have you installed the atlas plugin yet?', 'TALK · BUG SQUASH'],
      comment:
        "Ian's HTML overlay: his speech bubble, nameplate, bobbing figure, shadow and 'TALK · BUG SQUASH' prompt pill share one un-animated wrapper.",
    },
    {
      kind: 'labels',
      texts: ['You'],
      comment: "The local player's static figure and nameplate.",
    },
    {
      kind: 'selector',
      selectors: [
        'polygon[points="675,605.5 705,620.5 670,638 680,643 625,645.5 630,618 640,623"]',
      ],
      comment:
        "First of two non-working floor arrow decals in this Room (#132): this Room's only working exit is the 'HALLWAY ↓' HUD nav pill below, not this floor paint.",
    },
    {
      kind: 'selector',
      selectors: [
        'polygon[points="890,713 920,728 885,745.5 895,750.5 840,753 845,725.5 855,730.5"]',
      ],
      comment: 'Second non-working floor arrow decal in this Room (#132), same reasoning as above.',
    },
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking 'HALLWAY ↓' room-exit nav pill (HUD).",
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '09 · TEAM ROOM 2 · UX STUDIO'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      // The banner's own mixed-case text.
      anchor: 'TEAM Room 2',
      companions: ['TEAM Room 2', 'TEAM RM 2 · 292 SF · STICKY WALL · 2 PENGUINS · CRIT AT 3PM'],
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
  'team-room-3': [
    {
      kind: 'labels',
      texts: ['Millie', 'Casey', 'Sydney', 'So, open to new roles?'],
      comment:
        "Millie's shadow, figure and nameplate (one flat run), and the nameplates and speech bubble the design draws for Casey and Sydney after all the furniture.",
    },
    {
      kind: 'selector',
      selectors: [
        'svg[x="807.2"][y="325.2"]',
        'svg[x="864.2"][y="547.7"]',
        'ellipse[cx="899"][cy="633.5"]',
      ],
      comment:
        "Casey's figure, seated between the couch's own faces, and Sydney's figure and shadow, drawn before the desk in front of her. The couch's own large shadow ellipse is furniture and stays.",
    },
    {
      kind: 'animation',
      names: ['rats'],
      comment: "Casey's periodic 'RATS' speech bubble.",
    },
    {
      kind: 'label-group',
      texts: ['You'],
      comment: "The local player's own Penguin: a translated <g> of shadow, figure and nameplate.",
    },
    // #132's floor arrow rule is gone: the 2026-09-27 design resync removed
    // that decal from `design/Team Room 3.dc.html` itself, so the selector
    // matched nothing and failed the export (owner request, 2026-09-30,
    // Track D).
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking 'HALLWAY ↓' room-exit nav pill (HUD).",
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '10 · TEAM ROOM 3 · DATA CAVE'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'TEAM ROOM 3',
      companions: [
        'TEAM ROOM 3',
        'TEAM RM 3 · 287 SF · LIGHTS LOW · 2 HUMANS · 1 PENGUIN · 4 DASHBOARDS',
      ],
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
  'team-room-4': [
    {
      kind: 'labels',
      texts: ['You', 'LET IT RIP', 'Sam', 'Ryan'],
      comment:
        "The local player and its 'LET IT RIP' bubble, Ryan's shadow, figure and nameplate, and Sam's nameplate.",
    },
    {
      kind: 'selector',
      selectors: [
        'ellipse[cx="1072"][cy="612"]',
        'svg[x="1042"][y="550.5"]',
        'text[x="1040"][y="560"]',
        'text[x="1098"][y="555"]',
      ],
      comment:
        "Sam's shadow, his bobbing figure and the two music notes floating off him, none of which sit next to his nameplate. The Beystadium's own spinning tops are the stadium prop and stay.",
    },
    {
      kind: 'label-group',
      texts: ['Michael'],
      comment:
        'Michael Prete: a translated <g> of shadow, figure, nameplate and his Beyblade-challenge bubble.',
    },
    {
      kind: 'selector',
      selectors: [
        'polygon[points="700,605 730,620 695,637.5 705,642.5 650,645 655,617.5 665,622.5"]',
      ],
      comment:
        "Non-working floor arrow decal (#132): this Room's only working exit is the 'HALLWAY ↓' HUD nav pill below, not this floor paint.",
    },
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking 'HALLWAY ↓' room-exit nav pill (HUD).",
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '07 · TEAM ROOM 4 · THE POD'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'TEAM ROOM 4',
      companions: [
        'TEAM ROOM 4',
        'TEAM RM 4 · 350 SF · 4 CORNER DESKS · COUCH · BEYSTADIUM · 3 PENGUINS',
      ],
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
  bathroom: [
    {
      kind: 'labels',
      texts: ['You', 'no snowballs in here', 'Jessie', 'occupied since standup'],
      comment:
        'The local player and the Jessie Penguin, each a flat run of shadow, figure, nameplate and speech bubble. The Penguin icons on the wall signs are signage and stay.',
    },
    {
      kind: 'selector',
      selectors: [
        'polygon[points="940,675 970,690 935,707.5 945,712.5 890,715 895,687.5 905,692.5"]',
      ],
      comment:
        "Non-working floor arrow decal (#132): this Room's only working exit is the 'HALLWAY ↘' HUD nav pill below, not this floor paint.",
    },
    {
      kind: 'animation',
      names: ['blink'],
      comment: "Blinking 'HALLWAY ↘' room-exit nav pill (HUD).",
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '13 · BATHROOM (JOKE ROOM)'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'THE THAW ROOM',
      companions: ['THE THAW ROOM', 'BATHROOM · FLOOR 5 · 1 OF 2 STALLS FREE · SNOWBALLS DISABLED'],
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
  'the-mullet': [
    {
      kind: 'labels',
      texts: ['You', 'Jason', 'Nicole', 'Ann Marie'],
      comment:
        "The local player's figure and nameplate, and the nameplates of Jason (at the Ms. Pac-Man) and of Nicole and Ann Marie (on the couch).",
    },
    {
      kind: 'selector',
      selectors: [
        'ellipse[cx="570"][cy="543"]',
        'ellipse[cx="782"][cy="310"]',
        'svg[x="752"][y="246"]',
        'svg[x="962"][y="416"]',
        'svg[x="1047"][y="459"]',
        'circle[cx="0"][cy="0"][r="3.5"]',
        'svg[x="535.2"][y="471.66"]',
        'g:has(> ellipse[cx="1250"][cy="643"])',
        'g:has(> ellipse[cx="880"][cy="738"])',
        'g:has(> ellipse[cx="500"][cy="518"])',
      ],
      comment:
        "The local player's shadow and figure; Jason's shadow and his jiggling figure; Nicole's and Ann Marie's bouncing couch figures, none of which sits next to its nameplate; the moving ping-pong ball; and the moving groups of Jory (her walk), Ashley (her pacing, with Clucknelius and her bubble) and Tony (his walk round the pool table, with his cue and bubble), each pinned by its own ground-shadow ellipse. The design's runtime lifts those three nameplates into a separate label layer, so the `label-group` rule below only reaches the nameplates. The Ms. Pac-Man's own wobbling joystick is the cabinet prop and stays.",
    },
    {
      kind: 'label-group',
      texts: [
        'hehe',
        'haha',
        'Jory',
        'Tribe has spoken.',
        'Ashley',
        'Tony Mercadante',
        'corner pocket',
        'Jon',
        'Brandon',
        'Dom',
      ],
      comment:
        "Nicole's and Ann Marie's floating laughs; Jon's, Brandon's and Dom's whole <g> of shadow, figure, nameplate and bubble (their ping-pong sway and Dom's lap); and the nameplates and bubbles of Jory, Ashley and Tony, which the design's runtime lifts into their own label-layer <g>s.",
    },
    {
      kind: 'selector',
      selectors: [
        'polygon[points="345,490.5 280,523 345,555.5 370,543 335,525.5 395,525.5 395,505.5 350,518"]',
      ],
      comment:
        "Non-working floor arrow decal (#132): this Room's working exits are its HALLWAY and DEV PIT doors, not this floor paint.",
    },
    {
      kind: 'animation',
      names: ['blink', 'confetti'],
      comment:
        "Blinking '↙ HALLWAY' and 'DEV PIT ↘' room-exit nav pills (HUD), and the after-party confetti layer.",
    },
    {
      kind: 'cluster',
      anchor: '← MAP',
      companions: ['← MAP', '15 · THE MULLET (MEZZANINE)'],
      comment: 'Top-left breadcrumb nav (HUD).',
    },
    {
      kind: 'cluster',
      anchor: 'MEZZANINE · MS. PAC-MAN · TV LOUNGE · POOL · PING PONG · END OF THE GAME',
      companions: [
        'THE MULLET',
        'MEZZANINE · MS. PAC-MAN · TV LOUNGE · POOL · PING PONG · END OF THE GAME',
      ],
      comment:
        "Room title/subtitle banner (HUD). Anchored on the subtitle: the wall sign also says 'THE MULLET'.",
    },
    {
      kind: 'cluster',
      anchor: 'MENU',
      companions: ['1,250', '12 ONLINE', 'MENU'],
      comment: 'Top-right token/presence/menu HUD cluster.',
    },
    {
      kind: 'cluster',
      anchor: 'No quests. Arcade unlocked. Tokens still spend at the Market.',
      companions: [
        'No quests. Arcade unlocked. Tokens still spend at the Market.',
        '5 / 5 QUESTS DONE · 3 BADGES',
      ],
      comment:
        "The AFTER-PARTY quest card (HUD). Anchored on its body: the TV on the wall also says 'AFTER-PARTY'.",
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
        'The local player\'s stationary figure/nameplate and speech bubble, and the pet Hexle "Bit" -- a live pet, not fixed furniture (compare Gil the fish in Town Center). This only reaches Bit\'s smile path and two eye circles (the `labels` rule\'s 3-sibling walk back from the "Hexle · Bit" text); see the `selector` rule below for the rest of him.',
    },
    {
      kind: 'selector',
      selectors: [
        'polygon[points="395,467.5 330,500 395,532.5 420,520 385,502.5 445,502.5 445,482.5 400,495"]',
        'polygon[points="800,569 820,580 820,602 800,613 780,602 780,580"]',
        'ellipse[cx="800"][cy="615"]',
      ],
      comment:
        "#132: an unlabelled floor-arrow decal by the left wall that isn't a working door -- the Igloo's only real exit (Town Center) is the labelled elevator, not this arrow. Also (#132 review fix) the pet Hexle Bit's body polygon and ground-shadow ellipse, left baked in by the `labels` rule above.",
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

// Art fixes: geometry corrections applied to the rendered design before
// the screenshot, for flaws in the design itself that the byte-exact
// design/ mirror can't be edited to fix (see design/SYNC-LOG.md). Each fix
// finds its element by an exact `points` attribute of one of its polygons
// and fails the export if that polygon is missing, so a design resync that
// moves or fixes the shape stops the export instead of nudging the wrong
// thing.
type ArtFix = {
  // The exact `points` of a polygon inside the element to move.
  points: string;
  // How many levels to climb from that polygon to the element to move
  // (0 = the polygon itself).
  up: number;
  // Offset in Stage pixels, applied as an SVG `transform="translate(...)"`.
  dx: number;
  dy: number;
  comment: string;
};

/**
 * Furniture a Room design paints *after* an NPC's figure, so it covers that
 * NPC (owner request, 2026-09-30, Track D): each layer is exported on its
 * own, on a transparent Stage, to `public/rooms/<roomId>-front-<name>.png`,
 * and drawn by `RoomScene` just in front of its NPC (`RoomForeground`,
 * `src/game/rooms/room-definition.ts`). The same shapes stay in the Room's
 * own background PNG too, underneath. Selectors match the design's own
 * shapes exactly, one element each.
 */
const FOREGROUND_LAYERS: Partial<
  Record<RoomId, Array<{ name: string; selectors: string[]; comment: string }>>
> = {
  'team-room-3': [
    {
      name: 'millie-desk',
      selectors: [
        'polygon[points="535,448 645,503 595,528 485,473"]',
        'polygon[points="485,520.5 595,575.5 595,528 485,473"]',
        'polygon[points="645,550.5 595,575.5 595,528 645,503"]',
        'polygon[points="535,441.5 650,499 595,526.5 480,469"]',
        'polygon[points="480,473 595,530.5 595,526.5 480,469"]',
        'polygon[points="650,503 595,530.5 595,526.5 650,499"]',
        'polygon[points="530,451.5 575,474 571,476 526,453.5"]',
        'polygon[points="526,481 571,503.5 571,476 526,453.5"]',
        'polygon[points="575,501.5 571,503.5 571,476 575,474"]',
        'polygon[points="560,464.5 595,482 582.5,488.3 547.5,470.8"]',
        'polygon[points="547.5,472.8 582.5,490.3 582.5,488.3 547.5,470.8"]',
        'polygon[points="595,484 582.5,490.3 582.5,488.3 595,482"]',
      ],
      comment:
        "Millie's desk, its monitor and keyboard, drawn after her figure: she sits behind it, hidden from the waist down.",
    },
    {
      name: 'casey-couch-arm',
      selectors: [
        'polygon[points="868,402 882,409 882,425 868,418"]',
        'polygon[points="932,384 882,409 882,425 932,400"]',
        'polygon[points="918,377 932,384 882,409 868,402"]',
      ],
      comment:
        "The couch's right arm, drawn after Casey's figure: she sits in the couch, beside it.",
    },
    {
      name: 'sydney-desk',
      selectors: [
        'polygon[points="780,594 790,599 790,643 780,638"]',
        'polygon[points="840,574 790,599 790,643 840,618"]',
        'polygon[points="830,569 840,574 790,599 780,594"]',
        'polygon[points="880,644 890,649 890,693 880,688"]',
        'polygon[points="940,624 890,649 890,693 940,668"]',
        'polygon[points="930,619 940,624 890,649 880,644"]',
        'polygon[points="780,588 890,643 890,649 780,594"]',
        'polygon[points="940,618 890,643 890,649 940,624"]',
        'polygon[points="830,563 940,618 890,643 780,588"]',
        'polygon[points="818,543 852,560 852,590 818,573"]',
        'polygon[points="856,558 852,560 852,590 856,588"]',
        'polygon[points="822,541 856,558 852,560 818,543"]',
        'polygon[points="825,578.5 833,582.5 833,586.5 825,582.5"]',
        'polygon[points="839,579.5 833,582.5 833,586.5 839,583.5"]',
        'polygon[points="831,575.5 839,579.5 833,582.5 825,578.5"]',
        'polygon[points="840,602 864,614 864,616 840,604"]',
        'polygon[points="874,609 864,614 864,616 874,611"]',
        'polygon[points="850,597 874,609 864,614 840,602"]',
      ],
      comment:
        "Sydney's desk, its monitor, mouse and keyboard, drawn after her figure: she sits behind it, hidden from the waist down.",
    },
  ],
};

/**
 * On a transparent Stage, shows only the elements matching `selectors`
 * (`visibility` is inherited but a descendant can opt back in, in HTML and
 * SVG alike, so their hidden ancestors don't hide them). The Stage element
 * itself stays visible, with no background, border or shadow, so it can
 * still be screenshotted.
 */
function isolateElements({ stage, selectors }: { stage: string; selectors: string[] }): void {
  const style = document.createElement('style');
  style.textContent =
    'html, body, body * { visibility: hidden !important; background: transparent !important; }';
  document.head.append(style);
  const stageElement = document.querySelector<HTMLElement>(stage);
  if (!stageElement) throw new Error(`no Stage element: ${stage}`);
  for (const [property, value] of [
    ['visibility', 'visible'],
    ['border-color', 'transparent'],
    ['box-shadow', 'none'],
    ['outline', 'none'],
  ]) {
    stageElement.style.setProperty(property, value, 'important');
  }
  for (const selector of selectors) {
    const matches = document.querySelectorAll<SVGElement | HTMLElement>(selector);
    if (matches.length !== 1) {
      throw new Error(`foreground selector matched ${matches.length} elements, not 1: ${selector}`);
    }
    matches[0].style.setProperty('visibility', 'visible', 'important');
  }
}

const ART_FIXES: Partial<Record<RoomId, ArtFix[]>> = {
  'the-melt': [
    {
      points: '736.0,183.0 800.0,215.0 750.0,240.0 686.0,208.0',
      up: 1,
      // One iso step along the back counter is (+50, +25). The oven's
      // left edge sits at iso a = -1.08 (a = 0 is the left wall plane
      // through the back corner at (800, 250)), so it drew about a tile
      // through the wall. Moving it +1.08 steps (+54, +27) puts its left
      // edge flush on the wall, over the counter's first tile.
      dx: 54,
      dy: 27,
      comment: "The oven/stove at the back counter's left end, which poked through the left wall.",
    },
  ],
};

// Runs in the browser context (page.evaluate) against one Room's fixes.
function applyArtFixes(fixes: ArtFix[]): void {
  for (const fix of fixes) {
    const matches = Array.from(document.querySelectorAll('polygon')).filter(
      (p) => p.getAttribute('points') === fix.points,
    );
    if (matches.length !== 1) {
      throw new Error(
        `art fix expected exactly one polygon with points "${fix.points}", found ${matches.length}`,
      );
    }
    let el: Element | null = matches[0] ?? null;
    for (let i = 0; i < fix.up && el; i++) el = el.parentElement;
    if (!el) throw new Error(`art fix could not climb ${fix.up} level(s) from "${fix.points}"`);
    const existing = el.getAttribute('transform');
    const offset = `translate(${fix.dx} ${fix.dy})`;
    el.setAttribute('transform', existing ? `${offset} ${existing}` : offset);
  }
}

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

// Runs in the browser context (page.evaluate), after hideLiveElements and
// applyArtFixes: a #132 review hardening check. Every non-working floor-arrow
// decal this design bakes shares one shape -- an unlabelled 7- or 8-point
// `<polygon fill="#00BDFF">` -- so once every Room's hide rules have run, no
// such polygon should still be visible unless it's the Roof Deck's KITCHEN
// arrow (a real, working exit, kept inside its own `<a href="Kitchen.dc.
// html">`). Fails loudly listing the offending polygons' `points` instead of
// silently letting a design resync reintroduce a non-working arrow.
function assertNoStrayArrowPolygons(roomId: string): void {
  const isDisplayedWithin = (el: Element): boolean => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      if (getComputedStyle(n).display === 'none') return false;
    }
    return true;
  };
  const offenders = Array.from(document.querySelectorAll('polygon[fill="#00BDFF"]')).filter(
    (el) => {
      const pointCount = (el.getAttribute('points') ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      if (pointCount !== 7 && pointCount !== 8) return false;
      if (el.closest('a[href]')) return false;
      return isDisplayedWithin(el);
    },
  );
  if (offenders.length > 0) {
    throw new Error(
      `${roomId}: ${offenders.length} visible 7/8-point #00BDFF arrow polygon(s) remain outside an <a href>: ` +
        offenders.map((el) => el.getAttribute('points')).join(' | '),
    );
  }
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

  // #51: hides exactly one element per selector, failing the export loudly
  // when a selector matches none or several (a design resync that moved or
  // duplicated the element), rather than leaving a character baked in.
  function hideSelectors(selectors: string[]): void {
    for (const selector of selectors) {
      const matches = document.querySelectorAll(selector);
      const only = matches[0];
      if (matches.length !== 1 || !only) {
        throw new Error(
          `selector hide rule expected exactly one element for "${selector}", found ${matches.length}`,
        );
      }
      hide(only);
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
    else if (rule.kind === 'selector') hideSelectors(rule.selectors);
    else hideCluster(rule.anchor, rule.companions);
  }
}

/** Opens `roomId`'s design with its animations frozen and fonts loaded, ready to screenshot its Stage. */
async function openRoomStage(
  browser: import('@playwright/test').Browser,
  port: number,
  roomId: RoomId,
): Promise<{
  page: import('@playwright/test').Page;
  stage: import('@playwright/test').Locator;
}> {
  const file = ROOM_FILES[roomId];
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
  return { page, stage };
}

async function exportRoom(
  browser: import('@playwright/test').Browser,
  port: number,
  roomId: RoomId,
): Promise<{ roomId: RoomId; outPath: string; bytes: number }> {
  const rules = LIVE_ELEMENT_RULES[roomId];
  const { page, stage } = await openRoomStage(browser, port, roomId);

  await page.evaluate(hideLiveElements, rules);
  await page.evaluate(applyArtFixes, ART_FIXES[roomId] ?? []);
  await page.evaluate(assertNoStrayArrowPolygons, roomId);
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

/** Exports each of `roomId`'s `FOREGROUND_LAYERS` to its own transparent PNG. */
async function exportForegrounds(
  browser: import('@playwright/test').Browser,
  port: number,
  roomId: RoomId,
): Promise<Array<{ roomId: RoomId; outPath: string; bytes: number }>> {
  const results: Array<{ roomId: RoomId; outPath: string; bytes: number }> = [];
  for (const layer of FOREGROUND_LAYERS[roomId] ?? []) {
    const { page, stage } = await openRoomStage(browser, port, roomId);
    await page.evaluate(isolateElements, {
      stage: STAGE_SELECTORS[roomId] ?? STAGE_SELECTOR,
      selectors: layer.selectors,
    });
    await page.waitForTimeout(POST_HIDE_SETTLE_MS);
    const outPath = path.join(OUTPUT_DIR, `${roomId}-front-${layer.name}.png`);
    await stage.screenshot({ path: outPath, omitBackground: true });
    await page.close();
    const { size } = await stat(outPath);
    results.push({ roomId, outPath, bytes: size });
  }
  return results;
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
      for (const result of [
        await exportRoom(browser, port, roomId),
        ...(await exportForegrounds(browser, port, roomId)),
      ]) {
        results.push(result);
        const kb = (result.bytes / 1024).toFixed(0);
        const warn = result.bytes > MAX_BYTES ? '  ** OVER 1.5 MB **' : '';
        console.log(
          `  ${result.roomId.padEnd(12)} -> ${path.relative(REPO_ROOT, result.outPath)} (${kb} KB)${warn}`,
        );
      }
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
