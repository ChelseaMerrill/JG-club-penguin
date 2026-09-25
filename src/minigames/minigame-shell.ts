import {
  gameEvents,
  type BadgeId,
  type MinigameCompleted,
  type MinigameId,
  type MinigameStatsMap,
} from '../contracts';
import { MINIGAME_RULES } from '../persistence/minigame-rules';
import { ProgressStoreError, type ProgressStore } from '../persistence/progress-store';
import type { OverlayManager } from '../ui/hud/overlay-manager';
import { badgeDisplayName } from './badge-names';
import { setMinigameOpen } from './is-minigame-open';
import { mountMinigameLeaderboard } from './minigame-leaderboard';
import type { Minigame, MinigameContext } from './minigame';

/** The id `createMinigameShell` registers with `hud.overlays`, so only one
 *  overlay (MENU, the Map, the Creator, a Minigame) is ever open at once. */
export const MINIGAME_OVERLAY_ID = 'minigame';

/** How often the play-phase countdown re-renders while running. */
const TICK_INTERVAL_MS = 250;

export interface MinigameShellDeps<K extends MinigameId = MinigameId> {
  /** The `#ui` layer (`getUiLayer()`), same as the HUD. */
  layer: HTMLElement;
  /** The HUD's `OverlayManager` (`hud.overlays`); Escape closes this
   *  Minigame the same way it closes MENU. */
  overlays: OverlayManager;
  store: ProgressStore;
  /** The current Room's display title, for "QUIT TO <ROOM>". */
  roomTitle: string;
  minigame: Minigame<K>;
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function hexagonButton(modifier: 'start' | 'pause' | 'quit', text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `minigame__button minigame__button--${modifier}`;
  button.textContent = text;
  return button;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Mounts one round's full-Stage DOM overlay: how-to-play -> play -> done,
 * reproducing `design/Minigame Bug Squash.dc.html` and `design/Minigame
 * Pancake Flip.dc.html`'s shared shell chrome (title, SCORE/TIME/per-game
 * counters, PAUSE, QUIT TO <ROOM>, the done screen's payout/personal
 * best/Badge panel). The shell owns the round's timer and phase;
 * `deps.minigame` only renders itself into the play area and reports
 * score/stats back through the `MinigameContext` it's given.
 *
 * Calls `deps.store.recordRound` exactly once, only when the round finishes
 * (the timer reaches 0 or the game calls `context.finish()`) — never on
 * quit, and never twice for the same round. Emits `minigame:completed`
 * right after `minigame.end()` returns, independently of whether
 * `recordRound` then succeeds, fails, or is still pending — never on quit.
 *
 * Only one Minigame shell is ever mounted at a time: `createMinigameLauncher`
 * is the one caller, and it no-ops a `launch()` while `deps.overlays` already
 * shows `MINIGAME_OVERLAY_ID` instead of calling this again.
 *
 * Producer: #37. Consumer: `createMinigameLauncher` (`minigame-launcher.ts`).
 */
export function createMinigameShell<K extends MinigameId>(deps: MinigameShellDeps<K>): void {
  const { minigame } = deps;
  const rule = MINIGAME_RULES[minigame.id];

  type Phase = 'howto' | 'play' | 'done';
  let phase: Phase = 'howto';
  let started = false;
  let roundEnded = false;
  let paused = false;
  // The play-phase countdown: `deadline` (a `performance.now()` timestamp)
  // while running, `remainingMs` (frozen) while not running (before start,
  // or while paused) — see `runFrom`/`togglePause`.
  let deadline = 0;
  let remainingMs = minigame.durationSec * 1000;
  let tickIntervalId: ReturnType<typeof setInterval> | undefined;

  const statKeys = Object.keys(minigame.statLabels) as Array<keyof MinigameStatsMap[K] & string>;
  const statsDisplay: Record<string, number> = {};
  for (const key of statKeys) statsDisplay[key] = 0;

  // The overlay manager's Escape-close and both QUIT buttons converge here:
  // a still-in-progress round is discarded (`minigame.end()`, no
  // `recordRound`, no event); a round already finished (`roundEnded`) just
  // tears down (including a round whose `recordRound` is still pending).
  function handleOverlayClose(): void {
    if (!roundEnded) {
      if (started) minigame.end();
      roundEnded = true;
    }
    teardown();
  }

  function teardown(): void {
    stopTicking();
    window.removeEventListener('keydown', handleKeydown);
    setMinigameOpen(false);
    root.remove();
  }

  // Register with the overlay manager, and mark the Minigame open, before
  // building any DOM or attaching any listener: `overlays.open` may
  // synchronously close another open overlay first, and this ordering means
  // that can never race a half-built shell.
  deps.overlays.open(MINIGAME_OVERLAY_ID, handleOverlayClose);
  setMinigameOpen(true);

  // --- DOM ---------------------------------------------------------------

  const root = document.createElement('div');
  root.className = 'minigame';

  // How-to-play phase.
  const howtoEl = document.createElement('div');
  howtoEl.className = 'minigame__howto';
  const howtoTitle = document.createElement('div');
  howtoTitle.className = 'minigame__howto-title';
  howtoTitle.textContent = 'HOW TO PLAY';
  const howtoSubtitle = document.createElement('div');
  howtoSubtitle.className = 'minigame__howto-subtitle';
  howtoSubtitle.textContent = `${minigame.title} · ${minigame.durationSec} SECONDS`;
  const howtoList = document.createElement('ul');
  howtoList.className = 'minigame__howto-list';
  for (const line of minigame.howToPlay) {
    const item = document.createElement('li');
    item.textContent = line;
    howtoList.append(item);
  }
  const howtoActions = document.createElement('div');
  howtoActions.className = 'minigame__howto-actions';
  const startButton = hexagonButton('start', 'START');
  const howtoQuitButton = hexagonButton('quit', `QUIT TO ${deps.roomTitle}`);
  howtoActions.append(howtoQuitButton, startButton);
  howtoEl.append(howtoTitle, howtoSubtitle, howtoList, howtoActions);

  // Play phase.
  const playEl = document.createElement('div');
  playEl.className = 'minigame__play';
  playEl.hidden = true;

  const header = document.createElement('div');
  header.className = 'minigame__header';
  const titleEl = document.createElement('div');
  titleEl.className = 'minigame__title';
  titleEl.textContent = minigame.title;
  const counters = document.createElement('div');
  counters.className = 'minigame__counters';

  function makeCounter(key: string, label: string): HTMLElement {
    const counter = document.createElement('div');
    counter.className = 'minigame__counter';
    const labelEl = document.createElement('div');
    labelEl.className = 'minigame__counter-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.className = 'minigame__counter-value';
    valueEl.dataset.counter = key;
    valueEl.textContent = '0';
    counter.append(labelEl, valueEl);
    counters.append(counter);
    return valueEl;
  }

  const scoreValueEl = makeCounter('score', 'SCORE');
  const timeValueEl = makeCounter('time', 'TIME');
  const statValueEls: Record<string, HTMLElement> = {};
  for (const key of statKeys) {
    const label = minigame.statLabels[key] ?? key.toUpperCase();
    statValueEls[key] = makeCounter(key, label);
  }
  timeValueEl.textContent = formatTime(minigame.durationSec);

  header.append(titleEl, counters);

  const playAreaEl = document.createElement('div');
  playAreaEl.className = 'minigame__play-area';

  const footer = document.createElement('div');
  footer.className = 'minigame__footer';
  const pauseButton = hexagonButton('pause', 'PAUSE');
  const quitButton = hexagonButton('quit', `QUIT TO ${deps.roomTitle}`);
  footer.append(pauseButton, quitButton);

  playEl.append(header, playAreaEl, footer);

  // Done phase.
  const doneEl = document.createElement('div');
  doneEl.className = 'minigame__done';
  doneEl.hidden = true;

  const doneKicker = document.createElement('div');
  doneKicker.className = 'minigame__done-kicker';
  doneKicker.textContent = 'ROUND COMPLETE';
  const doneTitle = document.createElement('div');
  doneTitle.className = 'minigame__done-title';
  doneTitle.textContent = minigame.title;

  const doneStats = document.createElement('div');
  doneStats.className = 'minigame__done-stats';

  function makeDoneStat(key: string, labelText: string): { row: HTMLElement; value: HTMLElement } {
    const row = document.createElement('div');
    row.className = 'minigame__done-stat';
    row.dataset.doneStat = key;
    const label = document.createElement('div');
    label.className = 'minigame__done-stat-label';
    label.textContent = labelText;
    const value = document.createElement('div');
    value.className = 'minigame__done-stat-value';
    row.append(label, value);
    doneStats.append(row);
    return { row, value };
  }

  const doneScore = makeDoneStat('score', 'SCORE');
  const doneTokensRow = makeDoneStat('tokens', 'TOKENS EARNED');
  const doneBestRow = makeDoneStat('best', 'PERSONAL BEST');
  const doneNewBestEl = document.createElement('span');
  doneNewBestEl.className = 'minigame__done-newbest';
  doneNewBestEl.textContent = 'NEW BEST';
  doneNewBestEl.hidden = true;
  doneBestRow.row.append(doneNewBestEl);

  // Shown in place of the tokens/best rows between the done screen appearing
  // and `recordRound` (and the personal-best `loadAll`) settling.
  const doneSavingEl = document.createElement('div');
  doneSavingEl.className = 'minigame__done-saving';
  doneSavingEl.textContent = 'SAVING…';
  doneSavingEl.hidden = true;

  const doneBadge = document.createElement('div');
  doneBadge.className = 'minigame__done-badge';
  doneBadge.hidden = true;
  const doneBadgeName = document.createElement('div');
  doneBadgeName.className = 'minigame__done-badge-name';
  const doneBadgeCaption = document.createElement('div');
  doneBadgeCaption.className = 'minigame__done-badge-caption';
  doneBadgeCaption.textContent = 'ADDED TO YOUR TROPHY CASE';
  doneBadge.append(doneBadgeName, doneBadgeCaption);

  const doneError = document.createElement('div');
  doneError.className = 'minigame__done-error';
  doneError.hidden = true;

  // #70: the leaderboard panel mounts into this container, between the
  // Badge/error rows and the actions row (D7). Empty until `finishRound`
  // mounts it, after the save try/catch below settles (R4).
  const doneLeaderboard = document.createElement('div');
  doneLeaderboard.className = 'minigame__done-leaderboard';

  const doneActions = document.createElement('div');
  doneActions.className = 'minigame__done-actions';
  const doneQuitButton = hexagonButton('quit', `QUIT TO ${deps.roomTitle}`);
  doneActions.append(doneQuitButton);

  doneEl.append(
    doneKicker,
    doneTitle,
    doneStats,
    doneSavingEl,
    doneBadge,
    doneError,
    doneLeaderboard,
    doneActions,
  );

  root.append(howtoEl, playEl, doneEl);
  deps.layer.append(root);

  // --- Phase / timer -------------------------------------------------------

  function showPhase(next: Phase): void {
    phase = next;
    howtoEl.hidden = next !== 'howto';
    playEl.hidden = next !== 'play';
    doneEl.hidden = next !== 'done';
  }

  function renderRemaining(ms: number): void {
    timeValueEl.textContent = formatTime(ms / 1000);
  }

  function stopTicking(): void {
    if (tickIntervalId !== undefined) {
      clearInterval(tickIntervalId);
      tickIntervalId = undefined;
    }
  }

  function tick(): void {
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      stopTicking();
      renderRemaining(0);
      void finishRound();
      return;
    }
    renderRemaining(remaining);
  }

  /** (Re)starts the countdown running from `remaining` ms, computing a fresh
   *  `performance.now()` deadline so a paused span never counts against it. */
  function runFrom(remaining: number): void {
    deadline = performance.now() + remaining;
    tick();
    tickIntervalId = setInterval(tick, TICK_INTERVAL_MS);
  }

  function togglePause(): void {
    if (phase !== 'play') return;
    paused = !paused;
    if (paused) {
      remainingMs = Math.max(0, deadline - performance.now());
      stopTicking();
      minigame.pause();
    } else {
      runFrom(remainingMs);
      minigame.resume();
    }
    pauseButton.textContent = paused ? 'RESUME' : 'PAUSE';
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() !== 'p') return;
    if (isEditableTarget(event.target)) return;
    togglePause();
  }
  window.addEventListener('keydown', handleKeydown);

  // --- Done screen -----------------------------------------------------

  interface DoneRender {
    score: number;
    tokensAwarded: number | null;
    best: number | null;
    newBest: boolean;
    badgeId: BadgeId | null;
    error: string | null;
    /** True while the done screen is showing the score but still waiting on
     *  `recordRound`/the post-save `loadAll` (fix #37 D8). */
    pending: boolean;
  }

  function renderDone(data: DoneRender): void {
    doneScore.value.textContent = String(data.score);
    doneSavingEl.hidden = !data.pending;

    if (data.pending) {
      doneTokensRow.row.hidden = true;
      doneBestRow.row.hidden = true;
      doneNewBestEl.hidden = true;
      doneBadge.hidden = true;
      doneError.hidden = true;
      return;
    }

    if (data.tokensAwarded !== null) {
      doneTokensRow.row.hidden = false;
      doneTokensRow.value.textContent = `+${data.tokensAwarded}`;
    } else {
      doneTokensRow.row.hidden = true;
    }

    if (data.best !== null) {
      doneBestRow.row.hidden = false;
      doneBestRow.value.textContent = String(data.best);
      doneNewBestEl.hidden = !data.newBest;
    } else {
      doneBestRow.row.hidden = true;
      doneNewBestEl.hidden = true;
    }

    if (data.badgeId) {
      doneBadge.hidden = false;
      doneBadgeName.textContent = `Badge unlocked: ${badgeDisplayName(data.badgeId)}`;
    } else {
      doneBadge.hidden = true;
    }

    if (data.error) {
      doneError.hidden = false;
      doneError.textContent = data.error;
    } else {
      doneError.hidden = true;
    }
  }

  async function finishRound(): Promise<void> {
    if (roundEnded) return;
    roundEnded = true;
    stopTicking();

    let ended: { score: number; stats: MinigameStatsMap[K] };
    try {
      ended = minigame.end();
    } catch {
      showPhase('done');
      renderDone({
        score: 0,
        tokensAwarded: null,
        best: null,
        newBest: false,
        badgeId: null,
        error: 'Something went wrong ending the round.',
        pending: false,
      });
      return;
    }

    const { score, stats } = ended;

    // Informational-only event (#37 D per game-events.ts), fired right
    // after `end()` and independently of `recordRound` below — never on
    // quit, and never when `end()` itself throws (the branch above returns
    // before reaching here).
    gameEvents.emit('minigame:completed', {
      minigameId: minigame.id,
      score,
      stats,
      // `K` can't narrow `MinigameCompleted`'s per-id mapped union for
      // TypeScript here, even though `minigame.id` and `stats` always agree
      // with each other at runtime.
    } as MinigameCompleted);

    showPhase('done');
    renderDone({
      score,
      tokensAwarded: null,
      best: null,
      newBest: false,
      badgeId: null,
      error: null,
      pending: true,
    });

    try {
      const result = await deps.store.recordRound(minigame.id, score, stats);

      // Read back the fresh personal best rather than computing one
      // client-side; a failed read (or no entry at all) hides the row
      // instead of falling back to a fabricated 0.
      let best: number | null = null;
      try {
        const snapshot = await deps.store.loadAll();
        best = snapshot.bests[minigame.id] ?? null;
      } catch {
        best = null;
      }

      renderDone({
        score,
        tokensAwarded: result.tokensAwarded,
        best,
        newBest: result.newBest,
        badgeId: result.badgeEarned ? rule.badgeId : null,
        error: null,
        pending: false,
      });
    } catch (err) {
      const message =
        err instanceof ProgressStoreError
          ? "Your score couldn't be saved."
          : 'Something went wrong saving your score.';
      renderDone({
        score,
        tokensAwarded: null,
        best: null,
        newBest: false,
        badgeId: null,
        error: message,
        pending: false,
      });
    }

    // #70 R4: mounted after the save try/catch above settles either way
    // (success or failure), never before -- and, since `finishRound` only
    // ever reaches this point once per round (the `roundEnded` guard at the
    // top), mounted at most once. Its own internal `Promise.resolve().then`
    // wrapping means a broken `leaderboard()` can't throw back in here.
    mountMinigameLeaderboard(doneLeaderboard, { store: deps.store, minigameId: minigame.id });
  }

  function startRound(): void {
    started = true;
    showPhase('play');
    remainingMs = minigame.durationSec * 1000;
    runFrom(remainingMs);

    const context: MinigameContext<K> = {
      setScore(score) {
        scoreValueEl.textContent = String(score);
      },
      setStats(stats) {
        Object.assign(statsDisplay, stats);
        for (const key of statKeys) {
          const el = statValueEls[key];
          if (el) el.textContent = String(statsDisplay[key] ?? 0);
        }
      },
      finish() {
        void finishRound();
      },
    };
    minigame.start(playAreaEl, context);
  }

  startButton.addEventListener('click', startRound);
  pauseButton.addEventListener('click', togglePause);
  howtoQuitButton.addEventListener('click', () => deps.overlays.close(MINIGAME_OVERLAY_ID));
  quitButton.addEventListener('click', () => deps.overlays.close(MINIGAME_OVERLAY_ID));
  doneQuitButton.addEventListener('click', () => deps.overlays.close(MINIGAME_OVERLAY_ID));
}
