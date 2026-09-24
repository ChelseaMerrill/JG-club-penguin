import type { MinigameId, MinigameStatsMap } from '../contracts';

/**
 * Given to a `Minigame` by the shell when it calls `start`. The game reports
 * its live score and per-game stat counters through this so the shell's
 * header (SCORE, TIME, and the game's own stat counters) stays current
 * without the game touching the shell's DOM itself.
 *
 * Producer: `createMinigameShell` (`minigame-shell.ts`). Consumers: every
 * `Minigame` implementation (the stub here; #38-style follow-ups later).
 */
export interface MinigameContext<K extends MinigameId = MinigameId> {
  /** Updates the SCORE counter shown in the shell's header. */
  setScore(score: number): void;
  /** Merges into the per-game stat counters shown in the shell's header
   *  (only keys with a `statLabels` entry are displayed). */
  setStats(stats: Partial<MinigameStatsMap[K]>): void;
  /** Ends the round now, as if the shell's timer had reached 0. A game that
   *  never calls this simply plays until the shell's timer runs out. */
  finish(): void;
}

/**
 * One Minigame, launched by `createMinigameLauncher` and driven by
 * `createMinigameShell`. The shell owns the round's timer, pause state and
 * phase transitions (how-to-play -> play -> done); a `Minigame` only knows
 * how to render itself into the container it's given and report its own
 * score/stats.
 *
 * Producer: #37 (the framework and the `bug-squash` stub). Consumers: #38+
 * (Pancake Flip, Coffee Rush, Snow Cone Stand) once they build a `Minigame`
 * each; #27 `record_round` (via `ProgressStore.recordRound`'s `stats` shape,
 * `MinigameStatsMap`).
 */
export interface Minigame<K extends MinigameId = MinigameId> {
  readonly id: K;
  /** Shown as the shell's header title during play. */
  readonly title: string;
  /** The round length; the shell's timer counts down from this. */
  readonly durationSec: number;
  /** Lines shown on the how-to-play screen before the round starts. */
  readonly howToPlay: readonly string[];
  /** Display label for each `MinigameStatsMap[K]` key the shell should show
   *  as a header counter, in the order they're shown. A key without an
   *  entry here is tracked (and still sent to `recordRound`) but not shown. */
  readonly statLabels: Partial<Record<keyof MinigameStatsMap[K] & string, string>>;
  /** Mounts the game into `container` (inside the shell's play area) and
   *  starts play. Called once per round, when the how-to-play screen's
   *  START button is clicked. */
  start(container: HTMLElement, context: MinigameContext<K>): void;
  /** Called when the shell's PAUSE button or the P key pauses the round. */
  pause(): void;
  /** Called when the shell's PAUSE button or the P key resumes the round. */
  resume(): void;
  /** Called once per started round, when the round ends (timer reached 0,
   *  the game called `context.finish()`, or the Player quit). Must return
   *  synchronously; a quit discards this return value without recording it. */
  end(): { score: number; stats: MinigameStatsMap[K] };
}

/** Builds a fresh `Minigame` instance for one round. A factory is called
 *  once per `launch()` call, never reused across rounds. */
export type MinigameFactory<K extends MinigameId = MinigameId> = () => Minigame<K>;

/**
 * Maps each `MinigameId` to the factory that builds it. Partial because not
 * every Minigame is built yet (#37 ships only `bug-squash`'s stub); an id
 * with no entry can't be launched.
 */
export type MinigameRegistry = { [K in MinigameId]?: MinigameFactory<K> };
