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
 * One of the Igloo's six Furniture slots (`igloo_slots.slot`, #27's
 * migration). Slot numbers are otherwise meaningless: the HUD lays them out,
 * this store only remembers which Furniture (if any) sits in each one.
 */
export type IglooSlot = 1 | 2 | 3 | 4 | 5 | 6;

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
}

/** The result of a validated Furniture purchase. Producer: #27 (`purchase_item`). Consumer: #40. */
export interface PurchaseResult {
  balance: number;
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

/** True when `value` is one of the Igloo's six slot numbers. */
export function isIglooSlot(value: number): value is IglooSlot {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

/** Every Igloo slot number, in order. */
export const IGLOO_SLOTS: readonly IglooSlot[] = [1, 2, 3, 4, 5, 6];

/** A fresh Igloo layout: every slot empty. */
export function emptySlots(): Record<IglooSlot, string | null> {
  return { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
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
   * out-of-range slot (only 1-6 are valid) rejects with `invalid_slot`.
   */
  setSlot(slot: IglooSlot, itemId: string | null): Promise<void>;
}
