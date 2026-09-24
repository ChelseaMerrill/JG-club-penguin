import type { BadgeId, MinigameCompleted, MinigameId } from '../contracts/game-events';
import { gameEvents } from '../contracts/game-events';
import { MINIGAME_RULES } from '../persistence/minigame-rules';
import { ProgressStoreError, type ProgressStore } from '../persistence/progress-store';
import type { OverlayManager } from '../ui/hud/overlay-manager';
import { badgeDisplayName } from './badge-names';
import { setMinigameOpen } from './is-minigame-open';
import type { Minigame, MinigameContext } from './minigame';

/** The id `createMinigameShell` registers with `hud.overlays`, so only one
 *  overlay (MENU, the Map, the Creator, a Minigame) is ever open at once. */
export const MINIGAME_OVERLAY_ID = 'minigame';

export interface MinigameShellDeps<K extends MinigameId = MinigameId> {
  /** The `#ui` layer (`getUiLayer()`), same as the HUD. */
  layer: HTMLElement;
  /** The HUD's `OverlayManager` (`hud.overlays`); Escape closes this
   *  Minigame the same way it closes MENU. */
  overlays: OverlayManager;
  store: ProgressStore;
  /** The current Room's display title, for "QUIT TO <ROOM>". */
  roomTitle: string;
  game: Minigame<K>;
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function hexagonButton(className: string, text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `minigame__hex-button ${className}`;
  button.textContent = text;
  return button;
}

/**
 * Mounts one round's full-Stage DOM overlay: how-to-play -> play -> done,
 * reproducing `design/Minigame Bug Squash.dc.html` and `design/Minigame
 * Pancake Flip.dc.html`'s shared shell chrome (title, SCORE/TIME/per-game
 * counters, PAUSE, QUIT TO <ROOM>, the done screen's payout/personal
 * best/Badge panel). The shell owns the round's timer and phase; `deps.game`
 * only renders itself into the play area and reports score/stats back
 * through the `MinigameContext` it's given.
 *
 * Calls `deps.store.recordRound` exactly once, only when the round finishes
 * (the timer reaches 0 or the game calls `context.finish()`) — never on
 * quit, and never twice for the same round. Emits `minigame:completed` in
 * that same finish path only, after `recordRound` settles.
 *
 * Producer: #37. Consumer: `createMinigameLauncher` (`minigame-launcher.ts`).
 */
export function createMinigameShell<K extends MinigameId>(deps: MinigameShellDeps<K>): void {
  const { game } = deps;
  const rule = MINIGAME_RULES[game.id];

  type Phase = 'howto' | 'play' | 'done';
  let phase: Phase = 'howto';
  let started = false;
  let roundEnded = false;
  let paused = false;
  let remainingSec = game.durationSec;
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const statKeys = Object.keys(game.statLabels);
  const statsDisplay: Record<string, number> = {};
  for (const key of statKeys) statsDisplay[key] = 0;

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
  howtoSubtitle.textContent = `${game.title} · ${game.durationSec} SECONDS`;
  const howtoList = document.createElement('ul');
  howtoList.className = 'minigame__howto-list';
  for (const line of game.howToPlay) {
    const item = document.createElement('li');
    item.textContent = line;
    howtoList.append(item);
  }
  const howtoActions = document.createElement('div');
  howtoActions.className = 'minigame__howto-actions';
  const startButton = hexagonButton('minigame__howto-start', 'START');
  const howtoQuitButton = hexagonButton('minigame__howto-quit', `QUIT TO ${deps.roomTitle}`);
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
  titleEl.textContent = game.title;
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
    const label = game.statLabels[key as keyof typeof game.statLabels] ?? key.toUpperCase();
    statValueEls[key] = makeCounter(key, label as string);
  }
  timeValueEl.textContent = formatTime(remainingSec);

  header.append(titleEl, counters);

  const stageEl = document.createElement('div');
  stageEl.className = 'minigame__stage';

  const footer = document.createElement('div');
  footer.className = 'minigame__footer';
  const pauseButton = hexagonButton('minigame__pause', 'PAUSE');
  const quitButton = hexagonButton('minigame__quit', `QUIT TO ${deps.roomTitle}`);
  footer.append(pauseButton, quitButton);

  playEl.append(header, stageEl, footer);

  // Done phase.
  const doneEl = document.createElement('div');
  doneEl.className = 'minigame__done';
  doneEl.hidden = true;

  const doneKicker = document.createElement('div');
  doneKicker.className = 'minigame__done-kicker';
  doneKicker.textContent = 'ROUND COMPLETE';
  const doneTitle = document.createElement('div');
  doneTitle.className = 'minigame__done-title';
  doneTitle.textContent = game.title;

  const doneStats = document.createElement('div');
  doneStats.className = 'minigame__done-stats';

  function makeDoneStat(labelText: string): { row: HTMLElement; value: HTMLElement } {
    const row = document.createElement('div');
    row.className = 'minigame__done-stat';
    const label = document.createElement('div');
    label.className = 'minigame__done-stat-label';
    label.textContent = labelText;
    const value = document.createElement('div');
    value.className = 'minigame__done-stat-value';
    row.append(label, value);
    doneStats.append(row);
    return { row, value };
  }

  const doneScore = makeDoneStat('SCORE');
  const doneTokensRow = makeDoneStat('TOKENS EARNED');
  const doneBestRow = makeDoneStat('PERSONAL BEST');
  const doneNewBestEl = document.createElement('span');
  doneNewBestEl.className = 'minigame__done-newbest';
  doneNewBestEl.textContent = 'NEW BEST';
  doneNewBestEl.hidden = true;
  doneBestRow.row.append(doneNewBestEl);

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

  const doneActions = document.createElement('div');
  doneActions.className = 'minigame__done-actions';
  const doneQuitButton = hexagonButton('minigame__done-quit', `QUIT TO ${deps.roomTitle}`);
  doneActions.append(doneQuitButton);

  doneEl.append(doneKicker, doneTitle, doneStats, doneBadge, doneError, doneActions);

  root.append(howtoEl, playEl, doneEl);
  deps.layer.append(root);

  // --- Phase / timer -------------------------------------------------------

  function showPhase(next: Phase): void {
    phase = next;
    howtoEl.hidden = next !== 'howto';
    playEl.hidden = next !== 'play';
    doneEl.hidden = next !== 'done';
  }

  function renderTime(): void {
    timeValueEl.textContent = formatTime(remainingSec);
  }

  function stopTimer(): void {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  }

  function startTimer(): void {
    stopTimer();
    intervalId = setInterval(() => {
      remainingSec -= 1;
      if (remainingSec <= 0) {
        remainingSec = 0;
        renderTime();
        void finishRound();
        return;
      }
      renderTime();
    }, 1000);
  }

  function togglePause(): void {
    if (phase !== 'play') return;
    paused = !paused;
    if (paused) {
      stopTimer();
      game.pause();
    } else {
      startTimer();
      game.resume();
    }
    pauseButton.textContent = paused ? 'RESUME' : 'PAUSE';
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === 'p') togglePause();
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
  }

  function renderDone(data: DoneRender): void {
    doneScore.value.textContent = String(data.score);

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
    stopTimer();

    const { score, stats } = game.end();
    showPhase('done');

    let previousBest: number | undefined;
    try {
      const snapshot = await deps.store.loadAll();
      previousBest = snapshot.bests[game.id];
    } catch {
      previousBest = undefined;
    }

    try {
      // `stats` is `MinigameStatsMap[K]`; `MinigameRule.rawBest`/`rawPayout`
      // read it as a plain numeric record, matching the in-memory store's
      // own cast (`in-memory-progress-store.ts`).
      const numericStats = stats as unknown as Record<string, number>;
      const result = await deps.store.recordRound(game.id, score, stats);
      // Informational-only event (#37 D per game-events.ts); `recordRound`
      // above is the one and only place this round is recorded.
      gameEvents.emit('minigame:completed', {
        minigameId: game.id,
        score,
        stats,
      } as MinigameCompleted);

      const best = result.newBest ? rule.rawBest(score, numericStats) : (previousBest ?? 0);
      renderDone({
        score,
        tokensAwarded: result.tokensAwarded,
        best,
        newBest: result.newBest,
        badgeId: result.badgeEarned ? rule.badgeId : null,
        error: null,
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
      });
    }
  }

  function startRound(): void {
    started = true;
    showPhase('play');
    remainingSec = game.durationSec;
    renderTime();
    startTimer();

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
    game.start(stageEl, context);
  }

  function teardown(): void {
    stopTimer();
    window.removeEventListener('keydown', handleKeydown);
    setMinigameOpen(false);
    root.remove();
  }

  // The overlay manager's Escape-close and both QUIT buttons converge here:
  // a still-in-progress round is discarded (`game.end()`, no `recordRound`,
  // no event); a round already finished (`roundEnded`) just tears down.
  function handleOverlayClose(): void {
    if (!roundEnded) {
      if (started) game.end();
      roundEnded = true;
    }
    teardown();
  }

  startButton.addEventListener('click', startRound);
  pauseButton.addEventListener('click', togglePause);
  howtoQuitButton.addEventListener('click', () => deps.overlays.close(MINIGAME_OVERLAY_ID));
  quitButton.addEventListener('click', () => deps.overlays.close(MINIGAME_OVERLAY_ID));
  doneQuitButton.addEventListener('click', () => deps.overlays.close(MINIGAME_OVERLAY_ID));

  setMinigameOpen(true);
  deps.overlays.open(MINIGAME_OVERLAY_ID, handleOverlayClose);
}
