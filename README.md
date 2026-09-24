# JG Club Penguin

A Jahnel Group hackathon project: a multiplayer social game inspired by the classic *Club Penguin*, set in the JG universe.

## Concept

Players create and customize their own penguin, just like in the original Club Penguin. But instead of a snowy island, the world is **JG headquarters**. Players explore the office, meet other players, and team up with JG characters to complete tasks.

## Core Features

- **Penguin creation:** design and customize your own penguin avatar.
- **JG headquarters world:** explore rooms and areas based on the real JG office.
- **JG characters:** in-game characters from the JG universe who give out tasks and interact with players.
- **Tasks and quests:** finish challenges handed out by JG characters.
- **Multiplayer:** see, chat with, and interact with other players in real time.

## Tech Stack

Locked in issue #7:

- **Game:** Phaser 3 with Vite and TypeScript (no React wrapper)
- **Realtime and auth:** Supabase Realtime and Supabase Auth (Google OAuth)
- **Hosting:** Vercel static hosting
- **Tooling:** ESLint, Prettier, Vitest, Playwright, GitHub Actions CI

## Project Status

🚧 **Initial codebase.** A blank Phaser scene with a DOM overlay layer (`#ui`) for UI such as the login button.

## Getting Started

Requires Node 22.12 or newer (see `.nvmrc`).

```sh
nvm use
npm ci
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the app refuses to boot without them)
npm run dev            # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck and build the production bundle to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Typecheck browser code (`tsconfig.json`) and Node tooling/e2e (`tsconfig.node.json`) |
| `npm run lint` | Run ESLint |
| `npm run format` / `format:check` | Format with Prettier / check formatting |
| `npm test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright browser tests (first run: `npx playwright install chromium`) |

CI runs typecheck, lint, format check, unit tests, and build on every pull request.

## Team

Built by the JG hackathon team.

<!-- atlas-v3:readme:start -->
## Atlas

This repo uses Atlas, a Claude Code plugin that acts as a shared path for AI-assisted development — generated, customizable policies, guidelines, and guardrails that keep agent-driven work safe and consistent without locking teams into one rigid workflow. Read [`docs/atlas-operators-guide.md`](./docs/atlas-operators-guide.md) for how to work in this repo, in plain language, and the **Atlas** section in [`CLAUDE.md`](./CLAUDE.md) for the policy the agents follow.

Everything Atlas generated here — hooks, the `CLAUDE.md` section, `docs/agents/` — is a **base recommendation**, not fixed policy. Adapt it to this project's actual needs and processes.
<!-- atlas-v3:readme:end -->
