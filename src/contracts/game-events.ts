import { createEmitter, type TypedEmitter } from './emitter';
import type { RoomEventMap } from './rooms';

export type MinigameId = 'bug-squash' | 'pancake-flip' | 'coffee-rush' | 'snow-cone-stand';

export type BadgeId = 'exterminator' | 'breakfast-club' | 'barista' | 'brain-freeze';

/**
 * Per-minigame stats keys. #27's SQL and #37's games must both use exactly
 * these keys under `stats`; the two stretch games stay open (`Record<string,
 * number>`) until they're built.
 */
export interface MinigameStatsMap {
  'bug-squash': { squashed: number };
  'pancake-flip': {
    golden: number;
    flipNow: number;
    raw: number;
    burnt: number;
    stacked: number;
  };
  'coffee-rush': Record<string, number>;
  'snow-cone-stand': Record<string, number>;
}

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
}

/** The one shared emitter instance every Phaser scene and DOM overlay uses. */
export const gameEvents: TypedEmitter<GameEventMap> = createEmitter<GameEventMap>();
