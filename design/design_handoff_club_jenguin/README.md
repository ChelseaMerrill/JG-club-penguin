# Handoff: Club JenGuin

## Overview
Club JenGuin is a browser-based, isometric social world set inside the Jahnel Group office (108 State St, Schenectady). Players create a penguin, walk between rooms (Town Center, Dev Pit, team rooms, kitchen, roof deck, stairwell, elevator…), chat with coworker NPCs, play mini-games and collect trophies. This bundle contains the full set of screen designs, the logo, a character sheet, HUD/menu states and a world map that links every screen.

## About the Design Files
The `.dc.html` files are **design references built in HTML** — prototypes that show intended look and behavior, not production code. Recreate them in the target codebase's environment (e.g. a web game stack such as React + PixiJS/Phaser, or a canvas/WebGL engine) using its own patterns. If no codebase exists yet, pick an appropriate framework — an isometric 2D engine is the natural fit (rooms are drawn on a 2:1 isometric grid, tiles 100×50px).

Each file opens directly in a browser (serve the folder over a local web server, e.g. `npx serve .`, so relative paths resolve). `support.js` is the runtime that renders `.dc.html` files — reference only, not something to ship.

## Fidelity
**High-fidelity.** Colors, type, sizing, copy and layout are final. Recreate pixel-accurately. All rooms are authored on a fixed **1600×900** stage.

## Screens / Views

Start at **`Club JenGuin Map.dc.html`** — an index of every screen, with links.

Brand / meta
- **Club JenGuin Logo Final** — the final lockup (primary, transparent, icon mark). Wordmark uses the Bumbastika display font.
- **Club JenGuin Logo** — the logo explorations (1a–2c) that came before the final; kept for history.
- **Club JenGuin Landing** — the marketing/landing page: hero, CTAs into the Penguin Creator, Town Center, Characters and Trophy Case.
- **Characters** — the character sheet for coworker NPC penguins (names, outfits, idle "bob" animation).

Onboarding / UI
- **Penguin Creator** — the avatar builder, and the only screen with real logic. State: `name, body, cap, beak, feet, belly` (colors), `hat, pattern, eyes, igloo, emote` (option picks). Defaults are body `#161719`, cap/beak/feet `#00BDFF`, belly `#F4F4F4`, hat "JG CAP", pattern "PLAIN", eyes "ROUND", igloo "DEV CAVE", emote "WADDLE". Live preview with a waddle animation.
- **Club JenGuin HUD Menus** — in-room HUD states: Emote picker open, Snowball mode (aiming), Quests panel open.
- **Club JenGuin Rooms** — an early overview of three rooms (Town Center, Dev Pit, Conference Room); the individual room files below are the final versions.
- **Elevator** — the loading screen used between floors, plus the "Jason" pop-up.
- **Trophy Case** — the trophy/awards screen inside the player's igloo.

Rooms (isometric, 1600×900 each)
- Room 01 Town Center · Room 02 Dev Pit · Room 03 The Icebox (conference room) · Room 04 Kitchen (break room)
- Room 05 Roof Deck Market (night) · Room 05b Roof Deck Market (day)
- Room 06 Igloo (the player's home) · Room 07 Team Room 4 "The Pod"
- Team Room 1 "AI Lab" · Team Room 2 "UX Studio" · Team Room 3 "Data Cave"
- Room 11 Office Hallway (offices O1–O9) · Room 13 Bathroom (joke room) · Room 15 The Mullet (mezzanine)
- Stairwell — one screen per floor, Floor 5 down to Floor 0 (street level)

Mini-games
- **Bug Squash** (Dev Pit) · **Coffee Rush + Pancakes** ("The Melt" kitchen) · **Snow Cone Stand** (Roof Deck market)

### Common room anatomy
- The stage is 1600×900 with a `#0E1013` background and a framing ring of `0 0 0 6px #0C4B5F, 0 0 0 9px #00BDFF`.
- The room art is a single inline SVG (floor tiles alternating `#17181b`/`#1c1e21`, left wall `#121316`, right wall `#17181b`, wall edges `#0C4B5F`).
- **Door signs** are parallelograms skewed ±0.5 to sit flat on the wall: fill `#0C4B5F`, 2px `#00BDFF` stroke, height 25, at least 80 wide. The label is Anton 12px `#F4F4F4`, centered, with the arrow pointing toward the destination (`HALLWAY →`, `← TOWN CENTER`). Signs with longer labels get wider boxes, so text never spills outside the sign.
- The room title sits top-left: Bumbastika 44px `#00BDFF`, with a 5px `#0C4B5F` text stroke and a 4px `#0C4B5F` drop shadow.
- The chat bar sits along the bottom: a 52px-tall field on `rgba(22,23,25,.9)` with a 2px `#0C4B5F` border.
- NPC speech bubbles are white rounded pills with dark Libre Franklin bold text; the name tag sits below each bubble.

## Interactions & Behavior
- Navigation is by door: clicking a door sign or doorway goes to the linked room. The top bar's "MAP" link returns to the Map.
- **Animations**
  - `bob`: a 6px vertical float with ±2° rotation, used for idle penguins.
  - `blink`: opacity drops to 0.35 at 50%, used for screens and lights.
  - `waddle`: used in the creator preview.
  - Transitions are otherwise 250ms ease.
- HUD states show as overlays on top of the room: emote picker, snowball aiming reticle, quests panel.
- Elevator acts as the loading/transition screen between floors.
- Hover (Jahnel Group system): buttons use `filter: brightness(.9)`; links turn from cyan to `#F4F4F4`.

## State Management
- Player profile: the Penguin Creator fields listed above, persisted and applied to the avatar in every room.
- Current room/floor, player position on the iso grid.
- HUD: active overlay (none | emotes | snowball | quests), quest progress, trophies earned.
- Mini-game state: score and timer for each game.
- Multiplayer presence, NPC dialog and chat are implied by the designs; the backend is not specified.

## Design Tokens
Colors
- `#00BDFF` primary cyan
- `#0C4B5F` secondary teal
- `#F4F4F4` light
- `#161719` dark
- `#0E1013` stage background
- `#202124` and `#494949` inlays
- `#B3B6C9` muted text
- `#808080` inactive
- `#0a0b0d`, `#121316`, `#17181b` and `#1c1e21` room surfaces

Type
- **Bumbastika** (`assets/bumbastika.ttf`) — game display titles and the logo
- **Anton** — signs, labels and all-caps headings
- **Libre Franklin** 300/500/700/900 — body text, UI and chat

Radius
- 4px for fields and cards
- Pills for buttons and speech bubbles

Shadows
- No soft shadows. Use hard offset text shadows and colored rings/strokes instead.

The full Jahnel Group tokens are in `_ds/…/colors_and_type.css`.

## Assets
- `assets/bumbastika.ttf` — display font
- `assets/jg-logo-light.svg`, `assets/jg-logo-bars.svg`, `assets/jg-pin.png` — Jahnel Group marks
- `assets/awards/` — award badge images (Trophy Case)
- `build/isolib.js`, `build/humans.js` — helper scripts used to generate the isometric room SVG and the human/penguin figures
- `build/*.jpg` — reference renders
- `_ds/` — the Jahnel Group Design System (tokens, component bundle)

## Files
- Every `*.dc.html` file at the root of this folder (listed under Screens above)
- `support.js` — the runtime that renders the `.dc.html` files (reference only)
- `assets/`, `build/`, `_ds/`

## Screenshots
See `screenshots/` — one JPG per screen, named after its source file (the Map page is too large to capture — open `Club JenGuin Map.dc.html` directly).
