# Research: 2D rendering/game framework options

Ticket: [#2 Research: 2D rendering/game framework options](https://github.com/ChelseaMerrill/JG-club-penguin/issues/2) (part of #1, the wayfinder map).

Domain vocabulary used below (see `CONTEXT.md`): Player, Penguin, World, Room, Session, Presence, NPC, Interaction, Minigame.

## Question

For a 4-person team of web developers (React/Vue/vanilla JS/TS/Python) with **zero game-dev experience**, building a multi-Room, tile-based World for "JG Club Penguin" in a **3-day hackathon**, which browser-based 2D top-down rendering approach should we use? Candidates: Phaser 3, PixiJS, react-konva, raw Canvas, plus any other strong candidate.

## Candidates evaluated

### Phaser 3

- **What it is**: A batteries-included 2D **game framework** (not just a renderer) — scene management, physics (Arcade/Matter), input, animation, audio, and a first-class **Tilemap** system, on top of WebGL/Canvas. MIT licensed. Source: [github.com/phaserjs/phaser](https://github.com/phaserjs/phaser) (README, license footer).
- **Scale/activity**: 40.4k GitHub stars, 7.2k forks, 20,972 commits, actively maintained (current release v4.2.1 at time of research). ~276k npm downloads/week for `phaser`.
- **Learning curve**: Purpose-built onboarding path — "Making your first Phaser Game" tutorial, a free 500-page "Phaser by Example" book, 700+ community tutorials. The official first-game tutorial walks through scene setup → physics → input → collectibles → enemies, an incremental path suited to devs with zero game-engine background. Source: [phaser.io/tutorials/making-your-first-phaser-3-game](https://phaser.io/tutorials/making-your-first-phaser-3-game).
- **Tile maps / multi-Room tooling**: Native `Tilemap`/`TilemapGPULayer` classes that load **Tiled** (Mapeditor.org) JSON exports directly — the de facto free tile-map editor. Official **Tilemap Editor** tool supports editing multiple connected maps side by side, explicitly useful for designing connected rooms/levels sharing a tileset — directly maps to the World/Room structure. Community plugins extend this further (e.g. `phaser-animated-tiles` for animated tiles, `phaser-tilemap-plus` for physics/events on Tiled layers). Sources: [phaser.io/tools/tilemap-editor](https://phaser.io/tools/tilemap-editor), [github.com/nkholski/phaser-animated-tiles](https://github.com/nkholski/phaser-animated-tiles).
- **AI assistant familiarity**: Phaser is one of the most-tutorialized JS game frameworks on the web (700+ tutorials per its own docs, huge Stack Overflow/YouTube corpus), which in practice means AI coding assistants have seen a large volume of idiomatic Phaser code and official docs — fewer dead ends pairing with AI-assisted coding than with smaller/newer libraries.
- **Multiplayer compatibility**: Official first-party tutorial and reference client for **Colyseus** (a popular free/open-source realtime multiplayer room-based server), covering exactly this project's shape — multiple players in a room, keyboard movement, client-side interpolation, client-prediction, fixed tickrate. Colyseus's own room/session model maps closely to this project's Room/Session/Presence vocabulary. Sources: [docs.colyseus.io/learn/tutorial/phaser](https://docs.colyseus.io/learn/tutorial/phaser), [github.com/colyseus/tutorial-phaser](https://github.com/colyseus/tutorial-phaser). Phaser is also used in official multiplayer-Discord-game tutorials, showing a track record of pairing with arbitrary WebSocket backends (Socket.IO, raw WS), not just Colyseus.
- **License**: MIT.

### PixiJS

- **What it is**: A **rendering engine**, not a game framework — "the fastest, most lightweight 2D library available for the web," a WebGL/WebGPU renderer for rich interactive graphics, explicitly scoped below a full game framework (no built-in physics, scenes, tilemap loader, or input/camera abstractions out of the box). Source: [github.com/pixijs/pixijs](https://github.com/pixijs/pixijs) README.
- **Scale/activity**: 48.2k GitHub stars, 5.1k forks, active development. ~803k npm downloads/week for `pixi.js` (higher than Phaser, but PixiJS is used broadly beyond games — data viz, creative-coding, ad units).
- **Learning curve**: Lower-level than Phaser — a team would need to hand-roll scene/room switching, a tile-map loader, camera/viewport logic, and collision, on top of Pixi's renderer, all within a 3-day window. Good for teams that want full control or are building something Phaser's opinions don't fit; adds real setup cost for a team with zero game-dev background.
- **Tile maps / multi-Room tooling**: Community layers exist (e.g. `@pixi/tilemap`) but no first-party Tiled-import pipeline comparable to Phaser's; more assembly required.
- **AI assistant familiarity**: Strong, but Pixi's own docs/examples skew toward general graphics/creative-coding use rather than game-shaped code (scenes, rooms, players, NPCs), so AI-generated code is less likely to already look like "a game."
- **Multiplayer compatibility**: No built-in room/session concept; multiplayer wiring is fully bespoke (fine with Colyseus/Socket.IO, but more code to write than Phaser's ready-made tutorial gives you).
- **License**: MIT.

### react-konva

- **What it is**: Declarative React bindings ("Konva is to react-konva what the DOM is to React") over **Konva.js**, an HTML5 Canvas framework for 2D shapes. Explicitly aimed at design editors, whiteboards, node editors, annotation tools, and interactive maps — not games. Source: [konvajs.org/docs/react](https://konvajs.org/docs/react/index.html).
- **Scale/activity**: Highest raw npm downloads of the four evaluated (~1.48M/week for `react-konva`), but this reflects its dominance in non-game canvas UI (design tools, diagramming), not game usage.
- **Learning curve**: Lowest *conceptual* curve for a React-heavy team (JSX-style canvas), but it fights the team on a top-down game's core needs — no game loop, no sprite/animation system, no tilemap support, no camera; React's render-diffing model is also a poor fit for a 30-60fps position-syncing loop for multiple Penguins.
- **Tile maps / multi-Room tooling**: None built-in or in the surrounding ecosystem; would be hand-built on primitives.
- **AI assistant familiarity**: Good for its actual use case (React canvas UI), poor fit for "game" prompts — AI assistants would be generating idiomatic *design-tool* code, not game code, more likely to produce awkward patterns for a real-time multiplayer game loop.
- **Multiplayer compatibility**: No known-good multiplayer/game-server integration pattern; would be the most novel/least-trodden path of the four.
- **License**: MIT (Konva/react-konva).

### Raw Canvas (2D Context API)

- **What it is**: The browser-native `CanvasRenderingContext2D` API (MDN), no library at all.
- **Learning curve**: Deceptively low to start (draw a rectangle in 5 lines), steep in practice — the team would build their own game loop, sprite/animation system, input handling, camera, and a tilemap renderer/loader from scratch, all in 3 days, on top of a team with zero game-dev background. This is the highest total-cost option despite the lowest "day 1" cost.
- **Tile maps / multi-Room tooling**: None; 100% custom.
- **AI assistant familiarity**: AI assistants know the Canvas API very well (it's a stable web standard), but that only helps with primitives — it can't hand you "a tilemap loader" or "a game loop" the way Phaser's own docs/tutorials can, so the assistant ends up generating bespoke game-engine code that the team then has to debug without framework conventions to lean on.
- **Multiplayer compatibility**: Fully bespoke; no reference architecture.
- **License**: N/A (browser standard, no license to track).

## Comparison summary

| Criterion | Phaser 3 | PixiJS | react-konva | Raw Canvas |
|---|---|---|---|---|
| Learning curve (zero game-dev bg) | Low — guided path | Medium — DIY scene/tilemap layer | Low-to-start, poor fit for game loop | Low-to-start, highest total cost |
| AI assistant familiarity (game-shaped code) | High | High (but not game-shaped) | Medium (design-tool-shaped) | High on primitives only |
| Tile map / multi-Room tooling | Native Tiled support + multi-map editor | Community plugin only | None | None |
| License | MIT | MIT | MIT | N/A (web standard) |
| Realtime multiplayer fit | Official Colyseus tutorial matches Room/Session/Presence shape | DIY, workable | No known-good pattern | DIY, workable |

## Recommendation

**Phaser 3.** One-paragraph rationale: Phaser is the only candidate that is simultaneously a full game framework (scene/Room management, sprites, input, a game loop) *and* ships first-party tooling that maps directly onto this project's domain model — its Tilemap system loads Tiled-editor maps and its Tilemap Editor is designed for authoring multiple connected rooms sharing a tileset, which is exactly the multi-Room World this project needs; its official, step-by-step Colyseus integration tutorial demonstrates player movement, interpolation, and client-prediction in a room-based multiplayer model that lines up almost one-to-one with this project's Session/Presence vocabulary, de-risking the realtime-sync work; and its huge tutorial/community footprint (700+ tutorials, 40k+ stars) means AI coding assistants are well-trained on idiomatic Phaser code, reducing dead ends for a team leaning on AI-assisted coding with no prior game-engine experience. PixiJS and raw Canvas would require the team to hand-build the scene/tilemap/camera layer Phaser gives for free — a bad trade in a 3-day hackathon — and react-konva's ecosystem and mental model are built for design-tool UIs, not real-time multiplayer games, with no known-good multiplayer integration pattern.

## Pairing synergy with realtime backend

Phaser + **Colyseus** is a documented, first-party-supported pairing (official tutorial + reference GitHub repos), with Colyseus's room-based model matching this project's Room/Session/Presence terms closely: a Colyseus "room" ≈ this project's Room-scoped Presence, a Colyseus client session ≈ this project's Session. If the parallel realtime-backend research ticket lands on Colyseus (or another room-based WebSocket framework like Socket.IO with manual room logic), Phaser is the rendering choice with the least integration risk. This is a strong signal to flag to whichever agent is researching the realtime backend ticket.

## Sources

- [github.com/phaserjs/phaser](https://github.com/phaserjs/phaser) — README, license, stars/activity
- [phaser.io/tutorials/making-your-first-phaser-3-game](https://phaser.io/tutorials/making-your-first-phaser-3-game)
- [phaser.io/tools/tilemap-editor](https://phaser.io/tools/tilemap-editor)
- [github.com/nkholski/phaser-animated-tiles](https://github.com/nkholski/phaser-animated-tiles)
- [github.com/colinvella/phaser-tilemap-plus](https://github.com/colinvella/phaser-tilemap-plus)
- [github.com/pixijs/pixijs](https://github.com/pixijs/pixijs) — README, license, stars/activity
- [konvajs.org/docs/react](https://konvajs.org/docs/react/index.html)
- [github.com/konvajs/konva/blob/master/LICENSE](https://github.com/konvajs/konva/blob/master/LICENSE)
- [docs.colyseus.io/learn/tutorial/phaser](https://docs.colyseus.io/learn/tutorial/phaser)
- [github.com/colyseus/tutorial-phaser](https://github.com/colyseus/tutorial-phaser)
- [phaser.io/tutorials/creating-multiplayer-discord-games-with-phaser](https://phaser.io/tutorials/creating-multiplayer-discord-games-with-phaser)
- npm download counts (week of 2026-09-15 to 2026-09-21): `api.npmjs.org/downloads/point/last-week/phaser`, `/pixi.js`, `/react-konva`
