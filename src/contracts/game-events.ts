import { createEmitter, type TypedEmitter } from './emitter';
import type { RoomEventMap, RoomId } from './rooms';

/**
 * Producers: #37 (played), #27 `record_round`. Consumers: #27, #34, #42.
 */
export type MinigameId = 'bug-squash' | 'pancake-flip' | 'coffee-rush' | 'snow-cone-stand';

/**
 * Producers: #37 (played), #27 `record_round`. Consumers: #27, #34, #42.
 */
export type BadgeId = 'exterminator' | 'breakfast-club' | 'barista' | 'brain-freeze';

/**
 * Per-minigame stats keys. Producer: #37. Consumers: #27 (SQL keys), #32,
 * stretch #46. #27's SQL and #37's games must both use exactly these keys
 * under `stats`; the two stretch games stay open (`Record<string, number>`)
 * until they're built.
 */
export interface MinigameStatsMap {
  /** #38's done-screen fields: `score` duplicates `MinigameCompleted.score`
   *  (and `end()`'s own `score` return) so a `stats`-only consumer (e.g. a
   *  future leaderboard) never needs the sibling field to make sense of a
   *  round. `bestCombo` is the best combo multiplier reached (1-4). */
  'bug-squash': { score: number; squashed: number; bestCombo: number; escaped: number };
  'pancake-flip': {
    golden: number;
    flipNow: number;
    raw: number;
    burnt: number;
    stacked: number;
    /** Longest run of consecutive Golden/Flip Now flips in the round;
     *  producer: #39. Additive to the original #26 shape. */
    bestStreak: number;
  };
  /** #50's done-screen fields: `small`/`medium`/`large` are cups served
   *  correctly for that order size (their sum is the round's score and
   *  `MINIGAME_RULES['coffee-rush'].rawBest`); `perfect` is how many of
   *  those were within the tight fill-line tolerance; `spilled` is cups
   *  lost to an overfill (release or force-spill); `lost` is orders that
   *  walked out from a drained patience bar. Producer: #50. */
  'coffee-rush': {
    small: number;
    medium: number;
    large: number;
    perfect: number;
    spilled: number;
    lost: number;
  };
  /** #49's done-screen fields: `cone5`/`cone10`/`cone15`/`cone25` are
   *  normal-time cones served by size (1-4 scoops); `rushCone5` through
   *  `rushCone25` are the same, served during rush hour (paid double).
   *  `served`/`lost` round out the done screen without affecting payout.
   *  Producer: #49. Consumer: #27's `record_round` (same 8 payout keys,
   *  `saved_progress.sql`'s `'snow-cone-stand'` branch). */
  'snow-cone-stand': {
    cone5: number;
    cone10: number;
    cone15: number;
    cone25: number;
    rushCone5: number;
    rushCone10: number;
    rushCone15: number;
    rushCone25: number;
    served: number;
    lost: number;
  };
}

/**
 * Producer: #37. Consumers: #27 (SQL keys), #32, stretch #46.
 */
export type MinigameCompleted = {
  [K in MinigameId]: { minigameId: K; score: number; stats: MinigameStatsMap[K] };
}[MinigameId];

/**
 * The one shared event map for Phaser scenes and DOM overlays. Extends
 * `RoomEventMap`; see its doc comment for the Room-change and reconnect
 * rules.
 */
export interface GameEventMap extends RoomEventMap {
  /** Producer: #36. Consumer: stretch #46. */
  'npc:talked': { npcId: string };
  /**
   * Producer: #37. Consumers: #32 HUD, stretch #46. Informational only: a
   * listener must never call `ProgressStore.recordRound` from this event.
   * #37 calls `recordRound` itself, once per round, independently of this
   * event.
   */
  'minigame:completed': MinigameCompleted;
  /** Producer: #34. Consumer: #32. */
  'tokens:changed': { balance: number };
  /**
   * Producer: #34. Consumers: #32, #42. #37's own done screen reads
   * `badgeEarned` from its function result instead of this event.
   */
  'badge:earned': { badgeId: BadgeId };
  /** Producer: #32. Consumer: #35. */
  'ui:open-creator': void;
  /** Producer: #32. Consumer: #33. */
  'ui:open-map': void;
  /** Producers: #34 and any overlay. Consumer: the toast layer. */
  'ui:toast': { message: string };
  /** Producer: #14. Consumer: #36. */
  'npc:arrived': { npcId: string };
  /**
   * A `RoomHotspot` was clicked (e.g. the Igloo's `trophy-case`). Producer:
   * `RoomScene` (#16 D5's `hotspots`, wired by #42). Consumer: `main.ts`
   * (#42), which opens the matching overlay for a known `hotspotId`.
   */
  'hotspot:click': { roomId: RoomId; hotspotId: string };
}

/** The one shared emitter instance every Phaser scene and DOM overlay uses. */
export const gameEvents: TypedEmitter<GameEventMap> = createEmitter<GameEventMap>();
