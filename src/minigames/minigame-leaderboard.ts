// The Minigame done screen's leaderboard panel (#70 D7/D8). Mounted once,
// after the shell's own save try/catch settles (success or failure) --
// never before, and never twice for the same round (see `minigame-shell.ts`
// R4). Reads through `ProgressStore.leaderboard` only; nothing here ever
// imports Supabase (D9).

import type { MinigameId } from '../contracts/game-events';
import { maskName } from '../ui/mask-names';
import {
  LEADERBOARD_DEFAULT_ROWS,
  type LeaderboardEntry,
  type ProgressStore,
} from '../persistence/progress-store';
import './minigame-leaderboard.css';

export interface MinigameLeaderboardDeps {
  store: ProgressStore;
  minigameId: MinigameId;
  maxRows?: number;
}

type LeaderboardState = 'loading' | 'ready' | 'empty' | 'error';

function setState(root: HTMLElement, state: LeaderboardState): void {
  root.dataset.state = state;
}

function buildRow(entry: LeaderboardEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'minigame-leaderboard__row';
  row.dataset.rank = String(entry.rank);
  if (entry.isMe) {
    row.dataset.me = 'true';
  }

  const rank = document.createElement('span');
  rank.className = 'minigame-leaderboard__rank';
  rank.textContent = `#${entry.rank}`;

  const name = document.createElement('span');
  name.className = 'minigame-leaderboard__name';
  // R1/R6: masked under `?masknames` (recorded proof videos), and isolated
  // from the surrounding layout direction either way -- a name is
  // untrusted, arbitrary-direction text, never markup (`textContent` only).
  name.dir = 'auto';
  name.textContent = maskName(entry.penguinName);

  const score = document.createElement('span');
  score.className = 'minigame-leaderboard__score';
  score.textContent = String(entry.bestScore);

  row.append(rank, name, score);
  return row;
}

function buildGap(): HTMLElement {
  const gap = document.createElement('div');
  gap.className = 'minigame-leaderboard__gap';
  gap.textContent = '⋯'; // "⋯" midline horizontal ellipsis
  return gap;
}

function renderReady(root: HTMLElement, body: HTMLElement, entries: LeaderboardEntry[]): void {
  if (entries.length === 0) {
    setState(root, 'empty');
    body.textContent = '';
    body.textContent = 'No scores yet';
    return;
  }

  setState(root, 'ready');
  body.textContent = '';

  let previousRank: number | null = null;
  for (const entry of entries) {
    // R5: a gap only ever separates the top rows from the caller's own
    // appended row (a rank jump of more than 1); consecutive top rows never
    // get one, and a named caller with no best -- no appended row at all --
    // shows the top rows with no trailing gap either.
    if (previousRank !== null && entry.rank > previousRank + 1) {
      body.append(buildGap());
    }
    body.append(buildRow(entry));
    previousRank = entry.rank;
  }
}

function renderError(root: HTMLElement, body: HTMLElement): void {
  setState(root, 'error');
  body.textContent = '';
  body.textContent = 'Leaderboard unavailable';
}

/**
 * Builds the panel (loading state) inside `container` and kicks off the
 * read. `Promise.resolve().then(() => deps.store.leaderboard(...))` turns
 * even a *synchronous* throw from `deps.store.leaderboard` into a rejection
 * routed to `renderError`, so a broken store can never throw back into
 * `minigame-shell.ts`'s caller (#70 R4).
 */
export function mountMinigameLeaderboard(
  container: HTMLElement,
  deps: MinigameLeaderboardDeps,
): void {
  const root = document.createElement('div');
  root.className = 'minigame-leaderboard';
  setState(root, 'loading');

  const title = document.createElement('div');
  title.className = 'minigame-leaderboard__title';
  title.textContent = 'LEADERBOARD';

  const body = document.createElement('div');
  body.className = 'minigame-leaderboard__body';
  body.textContent = 'LOADING…';

  root.append(title, body);
  container.append(root);

  Promise.resolve()
    .then(() => deps.store.leaderboard(deps.minigameId, deps.maxRows ?? LEADERBOARD_DEFAULT_ROWS))
    .then(
      (entries) => renderReady(root, body, entries),
      () => renderError(root, body),
    );
}
