import type { BadgeId, MinigameId, MinigameStatsMap } from '../contracts/game-events';
import {
  EYES,
  HATS,
  IDLE_EMOTES,
  PATTERNS,
  PENGUIN_NAME_MAX,
  isHexColor,
  type PenguinLook,
} from '../contracts/penguin';

/**
 * One of the Igloo's 11 Furniture slots (`igloo_slots.slot`, #27's
 * migration, widened by #135): 1-6 floor, 7-10 wall, 11 ceiling (see
 * `IGLOO_SLOT_PLACEMENT`). The Room definition lays them out; this store
 * only remembers which Furniture (if any) sits in each one.
 */
export type IglooSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/**
 * Where an Igloo Gear item goes (#135, `shop_items.placement`). An item
 * fits only slots of its own placement; the database enforces it with the
 * `igloo_slots_placement_guard` trigger.
 */
export type Placement = 'floor' | 'wall' | 'ceiling';

/**
 * One entry in the Igloo Gear catalog (`public.shop_items`). Producer: #27
 * (seeded by the migration). Consumers: #40 (Igloo Gear stall), #41 (Igloo).
 */
export interface ShopItem {
  id: string;
  stall: string;
  name: string;
  price: number;
  artKey: string;
  /** #135: which kind of Igloo slot the item fits. */
  placement: Placement;
}

/**
 * One row of the Badge catalog (`public.badges`, #138). `id` is a plain
 * string so a catalog row added by a later migration renders without a code
 * change. `available` is false for a Badge that is defined but not yet
 * earnable ("coming soon").
 */
export interface BadgeDefinition {
  id: string;
  name: string;
  howToEarn: string;
  sortOrder: number;
  available: boolean;
}

/**
 * Everything a `ProgressStore` loads for one Player: the Penguin look,
 * Creator completion, Token balance, earned Badges, Minigame personal
 * bests, owned Furniture, the Igloo's slot layout and the Igloo Gear
 * catalog. Producer: #27. Consumers: #34, #35, #37, #40, #41, #42.
 */
export interface ProgressSnapshot {
  look: PenguinLook;
  /** Null until the Penguin Creator has been completed once. */
  profileCreatedAt: string | null;
  tokens: number;
  badges: BadgeId[];
  /** Keyed by Minigame; a Minigame with no round yet has no entry. */
  bests: Partial<Record<MinigameId, number>>;
  /** Furniture item ids the Player owns, from the Igloo Gear catalog. */
  ownedItems: string[];
  /** Every slot, `null` when empty. */
  slots: Record<IglooSlot, string | null>;
  catalog: ShopItem[];
  /** Every Badge in the catalog (#138), ordered by `sortOrder` then id. */
  badgeCatalog: BadgeDefinition[];
}

/**
 * The result of a validated Minigame round. `tokensAwarded` is the round's
 * own payout; a first-time Badge bonus is folded into `balance` but not
 * into `tokensAwarded`. `newBest` is true only when the round beats the
 * previous best, or 0 when there is none. Producer: #27 (`record_round`).
 * Consumers: #37, #32.
 */
export interface RoundResult {
  tokensAwarded: number;
  balance: number;
  newBest: boolean;
  badgeEarned: boolean;
  /**
   * The Badge ids this round newly awarded (#121, following #138's
   * `complete_quest` contract): the Minigame's own Badge on the round that
   * first earns it (Let It Rip on the third Beystadium win), else empty.
   */
  badgesEarned: BadgeId[];
}

/** The result of a validated Furniture purchase. Producer: #27 (`purchase_item`). Consumer: #40. */
export interface PurchaseResult {
  balance: number;
}

/**
 * One row of a Minigame's leaderboard (#70): `rank` and `bestScore` per
 * `public.leaderboard`'s `row_number()` ordering (`best_score desc,
 * updated_at asc, player_id asc`), `penguinName` for display, and `isMe`
 * true on at most one row -- the caller's own, present even when it falls
 * outside the requested row count. Producer: `public.leaderboard` (#70).
 * Consumer: `src/minigames/minigame-leaderboard.ts`.
 */
export interface LeaderboardEntry {
  rank: number;
  penguinName: string;
  bestScore: number;
  isMe: boolean;
}

/**
 * The saved state Quest progress needs beyond `ProgressSnapshot` (#46):
 * the Dev Pit visit flag, which Minigames have at least one finished round
 * (`minigame_rounds`; a quit never records one), and which Quests the server
 * has already paid. Producer: #46's `quest_progress`. Consumer:
 * `src/quests/quest-controller.ts`.
 */
export interface QuestProgress {
  devPitVisited: boolean;
  /** Ordered by Minigame id. */
  roundsFinished: MinigameId[];
  /** Ordered by Quest id. */
  completedQuests: string[];
  /** Match wins per Minigame with a match-win Badge (only Beystadium): how
   *  many recorded rounds have `stats.won = 1`. A Minigame with no win has
   *  no entry. Producer: the Beystadium migration's `quest_progress`.
   *  Consumer: the Beystadium Quest's "x / 3" progress. */
  matchWins: Partial<Record<MinigameId, number>>;
  /** Every server-paid steps Quest's steps for this Player: Quest id ->
   *  (step id -> met), in the client's step ids (`QuestStepDefinition.id`).
   *  Producer: 20261006000000_quest_registry.sql's `quest_progress` (one
   *  entry per `public.quests` row). `{}` from a server without it.
   *  Consumer: `src/quests/quest-engine.ts`'s step evaluation. */
  questSteps: Record<string, Record<string, boolean>>;
}

/**
 * The result of `complete_quest` (#46). `tokensAwarded` is 0 and
 * `alreadyCompleted` true on every call after the first successful one;
 * `balance` is always the server's own balance after the call.
 */
export interface CompleteQuestResult {
  tokensAwarded: number;
  balance: number;
  alreadyCompleted: boolean;
  /**
   * The Badges this call awarded (#138): `['ship-it']` when the main Quest
   * is first paid, `[]` otherwise. Each one's +50 is already in `balance`.
   */
  badgesEarned: BadgeId[];
}

/**
 * The result of the Session Badge check (#138's `check_session_badges`):
 * every Badge the Player now holds and the server's balance after the check.
 */
export interface BadgeCheckResult {
  badges: BadgeId[];
  balance: number;
}

/**
 * The main Quest's reward, paid once by `complete_quest` (#46;
 * `public.quests`' 'main' row since 20261006000000_quest_registry.sql).
 */
export const MAIN_QUEST_REWARD = 150;

/** `ProgressStore.leaderboard`'s row count when `maxRows` is omitted. */
export const LEADERBOARD_DEFAULT_ROWS = 10;

/** The most rows `ProgressStore.leaderboard` will ever return for the top-N part of the board. */
export const LEADERBOARD_MAX_ROWS = 50;

/**
 * Mirrors `public.leaderboard`'s own clamp
 * (`least(greatest(coalesce(max_rows, 10), 1), 50)`): `undefined`/`null`
 * become `LEADERBOARD_DEFAULT_ROWS`; anything else is floored to an integer
 * and clamped to `[1, LEADERBOARD_MAX_ROWS]`.
 */
export function clampLeaderboardRows(maxRows?: number | null): number {
  const requested = maxRows ?? LEADERBOARD_DEFAULT_ROWS;
  return Math.min(Math.max(Math.trunc(requested), 1), LEADERBOARD_MAX_ROWS);
}

/**
 * Every way a `ProgressStore` call can fail. Mirrors the messages raised by
 * #27's `record_round` / `purchase_item` functions and its check
 * constraints, plus the look- and slot-shape errors the in-memory fake and
 * the real store both enforce client-side.
 */
export const PROGRESS_ERROR_CODES = [
  'not_authenticated',
  'no_player',
  'unknown_minigame',
  'invalid_score',
  'invalid_stats',
  'round_too_soon',
  'unknown_item',
  'already_owned',
  'insufficient_tokens',
  'invalid_look',
  'not_owned',
  'invalid_slot',
  // #135: an item placed in a slot of another placement (a wall item in a
  // floor slot, and so on). Raised by `igloo_slots_placement_guard`.
  'wrong_placement',
  // #46: `complete_quest` with an id that isn't a registered steps Quest
  // (`public.quests`), or before every one of that Quest's steps is met.
  'unknown_quest',
  'quest_incomplete',
  // #138: a response that doesn't have the shape the client expects (the
  // Session Badge check's malformed `check_session_badges` result). Raised
  // client-side only, never by the database.
  'invalid_response',
] as const;

export type ProgressErrorCode = (typeof PROGRESS_ERROR_CODES)[number];

/** True when `message` is one of `ProgressErrorCode`'s known values. */
export function isProgressErrorCode(message: string): message is ProgressErrorCode {
  return (PROGRESS_ERROR_CODES as readonly string[]).includes(message);
}

/** Thrown by every `ProgressStore` method that rejects. */
export class ProgressStoreError extends Error {
  readonly code: ProgressErrorCode;

  constructor(code: ProgressErrorCode) {
    super(code);
    this.name = 'ProgressStoreError';
    this.code = code;
  }
}

/**
 * `penguin_name`'s check constraints (#27's migration): trimmed and
 * 1-16 characters (counted in code points, not UTF-16 units) once the
 * Creator is complete, plus every color/enum field must be a value the
 * contract (#26) allows. Shared by `createInMemoryProgressStore` and
 * `createSupabaseProgressStore` so both reject the same look the same way,
 * client-side, before any write.
 */
export function validateLook(look: PenguinLook): void {
  const nameLength = [...look.name].length;
  const nameOk =
    nameLength >= 1 && nameLength <= PENGUIN_NAME_MAX && look.name === look.name.trim();
  if (
    !nameOk ||
    !isHexColor(look.body) ||
    !isHexColor(look.cap) ||
    !isHexColor(look.beak) ||
    !isHexColor(look.feet) ||
    !isHexColor(look.belly) ||
    !(HATS as readonly string[]).includes(look.hat) ||
    !(PATTERNS as readonly string[]).includes(look.pattern) ||
    !(EYES as readonly string[]).includes(look.eyes) ||
    !(IDLE_EMOTES as readonly string[]).includes(look.emote)
  ) {
    throw new ProgressStoreError('invalid_look');
  }
}

/** True when `value` is one of the Igloo's 11 slot numbers. */
export function isIglooSlot(value: number): value is IglooSlot {
  return Number.isInteger(value) && value >= 1 && value <= 11;
}

/** Every Igloo slot number, in order. */
export const IGLOO_SLOTS: readonly IglooSlot[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/**
 * Each slot's placement (#135). Mirrors `public.igloo_slot_placement` in
 * `20260927010000_igloo_wall_slots.sql`; `sql-igloo-placement.test.ts`
 * checks the two agree.
 */
export const IGLOO_SLOT_PLACEMENT: Readonly<Record<IglooSlot, Placement>> = {
  1: 'floor',
  2: 'floor',
  3: 'floor',
  4: 'floor',
  5: 'floor',
  6: 'floor',
  7: 'wall',
  8: 'wall',
  9: 'wall',
  10: 'wall',
  11: 'ceiling',
};

/** True when `item` may sit in `slot` (their placements match). */
export function fitsSlot(item: Pick<ShopItem, 'placement'>, slot: IglooSlot): boolean {
  return IGLOO_SLOT_PLACEMENT[slot] === item.placement;
}

/** A fresh Igloo layout: every slot empty. */
export function emptySlots(): Record<IglooSlot, string | null> {
  return {
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
    6: null,
    7: null,
    8: null,
    9: null,
    10: null,
    11: null,
  };
}

/**
 * The one way saved progress is read or changed: the Penguin profile (look
 * plus Creator completion), Badges, Minigame personal bests, Token balance,
 * owned Furniture and the Igloo's slot layout. #27's migration
 * (`supabase/migrations/20260924010000_saved_progress.sql`) is the source
 * of truth for every rule below; `createInMemoryProgressStore` enforces the
 * same rules so the Creator, Minigame, stall and Igloo tracks (#34, #35,
 * #37, #40, #41, #42) can build before the real store (#34) lands.
 *
 * Every method rejects with a `ProgressStoreError`. Implementations emit
 * `tokens:changed` after a successful `recordRound` or `purchase`, and
 * `badge:earned` the first time a Badge is earned. The real store wiring
 * these into `gameEvents` is #34; a store built without an emitter (as in
 * most of this contract's tests) emits nothing.
 *
 * Producer: #27. Consumers: #34, #35, #37, #40, #41, #42.
 */
export interface ProgressStore {
  /**
   * `catalog` is ordered by price then id; `badges` and `ownedItems` are
   * each ordered by when they were earned/acquired, then by id.
   */
  loadAll(): Promise<ProgressSnapshot>;

  /**
   * Always completes the Penguin Creator: `look.name` must be trimmed and
   * 1-16 characters (counted in code points); every colour field
   * (`body`/`cap`/`beak`/`feet`/`belly`) must be a 6-digit hex string,
   * not necessarily one of the design's swatches; and every enum field
   * (`hat`/`pattern`/`eyes`/`emote`) must be one of the contract's (#26)
   * allowed values. Otherwise this rejects with `invalid_look` and saves
   * nothing. `profileCreatedAt` is set on the first successful save and
   * never changes after that.
   */
  saveLook(look: PenguinLook): Promise<void>;

  /**
   * Records one finished round; the server computes the payout. A round
   * less than 10 s after the previous round of the same Minigame rejects
   * with `round_too_soon`; otherwise the payout is at most
   * `floor(cap * min(1, secondsSincePreviousRound / duration))`.
   */
  recordRound<K extends MinigameId>(
    minigameId: K,
    score: number,
    stats: MinigameStatsMap[K],
  ): Promise<RoundResult>;

  purchase(itemId: string): Promise<PurchaseResult>;

  /**
   * `setSlot(slot, null)` empties `slot`. Placing an item that already
   * occupies another slot moves it there, leaving that other slot empty.
   * Placing an item the Player does not own rejects with `not_owned`; an
   * out-of-range slot (only 1-11 are valid) rejects with `invalid_slot`;
   * an item whose placement doesn't match the slot's (#135) rejects with
   * `wrong_placement` before anything is written, so a rejected move leaves
   * the item where it was.
   */
  setSlot(slot: IglooSlot, itemId: string | null): Promise<void>;

  /**
   * The top `maxRows` (clamped by `clampLeaderboardRows`, default
   * `LEADERBOARD_DEFAULT_ROWS`) Players by personal best at `minigameId`,
   * plus the caller's own row (appended, `isMe: true`) when it falls
   * outside that count. A Player whose name is blank, or whose best is
   * above `minigameId`'s plausibility ceiling, never appears (#70 R1/R2).
   * Rejects with `unknown_minigame` or `not_authenticated`, or with a plain
   * `Error` (e.g. a network failure) for anything else.
   */
  leaderboard(minigameId: MinigameId, maxRows?: number): Promise<LeaderboardEntry[]>;

  /**
   * The saved state behind Quest progress (#46). Read-only: a failure never
   * emits `ui:toast`.
   */
  questProgress(): Promise<QuestProgress>;

  /**
   * Records the Player's first Dev Pit visit (#46). Idempotent: the first
   * visit's time is kept.
   */
  markDevPitVisited(): Promise<void>;

  /**
   * Records the Player's first "talk to Casey" moment for the Igloo Badge
   * Quest (#143's `quest_steps__igloo_badge` 'talk-to-casey' step), the same
   * client-asserted, idempotent shape as `markDevPitVisited`: the first call
   * sticks. Always the caller's own row -- there is no Player id argument,
   * so no caller can ever mark it for someone else.
   */
  markCaseyTalked(): Promise<void>;

  /**
   * Asks the server to pay the steps Quest `questId` (any `kind: 'steps'`
   * id in `QUEST_DEFINITIONS` that the server registers in `public.quests`;
   * the Minigame Quests have no RPC). The server checks every one of that
   * Quest's steps against saved records (`public.quest_steps__<id>`) and pays
   * its reward once (`MAIN_QUEST_REWARD` for 'main'); a repeat call resolves
   * `alreadyCompleted: true` and pays nothing. Only 'main' also awards Ship
   * It. Rejects with `unknown_quest` or `quest_incomplete`. Emits
   * `tokens:changed` with the server's balance on success, as `purchase` does,
   * and `badge:earned` once for each id in `badgesEarned` (#138).
   */
  completeQuest(questId: string): Promise<CompleteQuestResult>;

  /**
   * The Session Badge check (#138): asks the server to award any Session
   * Badge now due (First Waddle, Night Owl, and Interior Penguin as a safety
   * net), by the server's own clock. Resolves every Badge the Player holds
   * and the balance. Emits nothing itself: a Badge it awards is silent, and
   * the session wrapper (`progress-session.ts`) announces what's new.
   */
  checkBadges(): Promise<BadgeCheckResult>;
}
