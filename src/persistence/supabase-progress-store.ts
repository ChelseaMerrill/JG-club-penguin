// The real ProgressStore (#34), built on #27's `saved_progress` migration.
// Every rule enforced here mirrors `testing/pglite-progress-store.ts` (the
// same SQL semantics, run against a real Postgres database in tests) and
// `in-memory-progress-store.ts` (the client-side validation both stores
// share via `validateLook`).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedEmitter } from '../contracts/emitter';
import type { BadgeId, GameEventMap, MinigameId, MinigameStatsMap } from '../contracts/game-events';
import type { Eyes, Hat, IdleEmote, Pattern, PenguinLook } from '../contracts/penguin';
import { MINIGAME_RULES } from './minigame-rules';
import {
  clampLeaderboardRows,
  ProgressStoreError,
  emptySlots,
  isIglooSlot,
  isProgressErrorCode,
  validateLook,
  type IglooSlot,
  type LeaderboardEntry,
  type ProgressErrorCode,
  type ProgressSnapshot,
  type ProgressStore,
  type PurchaseResult,
  type RoundResult,
} from './progress-store';

/** The narrow error shape every PostgREST/RPC call in this file can return. */
export interface PostgrestErrorLike {
  message: string;
  code?: string;
}

interface SelectResult<T> {
  data: T | null;
  error: PostgrestErrorLike | null;
}

interface WriteResult {
  error: PostgrestErrorLike | null;
}

interface RpcResult {
  data: unknown;
  error: PostgrestErrorLike | null;
}

/** A chainable result that also supports repeated `.order()`, as PostgREST's own builders do. */
interface OrderableRows<Row> extends PromiseLike<SelectResult<Row[]>> {
  order(column: string, options?: { ascending?: boolean }): OrderableRows<Row>;
}

/** `players.update(...).eq('id', playerId)`, optionally filtered further with `.is(...)`. */
interface PlayersUpdateEq extends PromiseLike<WriteResult> {
  is(column: 'profile_created_at', value: null): PromiseLike<WriteResult>;
}

/** The ten look columns `saveLook` writes. */
export interface PlayerLookColumns {
  penguin_name: string;
  penguin_color: string;
  cap: string;
  beak: string;
  feet: string;
  belly: string;
  hat: string;
  pattern: string;
  eyes: string;
  idle_emote: string;
}

interface PlayerRow {
  penguin_name: string;
  penguin_color: string;
  cap: string;
  beak: string;
  feet: string;
  belly: string;
  hat: string;
  pattern: string;
  eyes: string;
  idle_emote: string;
  tokens: number;
  profile_created_at: string | null;
}

interface BadgeRow {
  badge_id: BadgeId;
}

interface BestRow {
  minigame_id: MinigameId;
  best_score: number;
}

interface ItemRow {
  item_id: string;
}

interface SlotRow {
  slot: number;
  item_id: string;
}

interface ShopItemRow {
  id: string;
  stall: string;
  name: string;
  price: number;
  art_key: string;
}

export interface PlayersTable {
  select(columns: string): {
    eq(column: 'id', value: string): { maybeSingle(): PromiseLike<SelectResult<PlayerRow>> };
  };
  update(values: PlayerLookColumns | { profile_created_at: string }): {
    eq(column: 'id', value: string): PlayersUpdateEq;
  };
}

export interface PlayerBadgesTable {
  select(columns: string): { eq(column: 'player_id', value: string): OrderableRows<BadgeRow> };
}

export interface MinigameBestsTable {
  select(columns: string): {
    eq(column: 'player_id', value: string): PromiseLike<SelectResult<BestRow[]>>;
  };
}

export interface PlayerItemsTable {
  select(columns: string): { eq(column: 'player_id', value: string): OrderableRows<ItemRow> };
}

export interface IglooSlotsTable {
  select(columns: string): {
    eq(column: 'player_id', value: string): PromiseLike<SelectResult<SlotRow[]>>;
  };
  delete(): {
    eq(
      column: 'player_id',
      value: string,
    ): {
      eq(column: 'slot' | 'item_id', value: string | number): PromiseLike<WriteResult>;
    };
  };
  upsert(
    values: { player_id: string; slot: number; item_id: string },
    options: { onConflict: string },
  ): PromiseLike<WriteResult>;
}

export interface ShopItemsTable {
  select(columns: string): OrderableRows<ShopItemRow>;
}

export type ProgressTable =
  | PlayersTable
  | PlayerBadgesTable
  | MinigameBestsTable
  | PlayerItemsTable
  | IglooSlotsTable
  | ShopItemsTable;

export type ProgressTableName =
  'players' | 'player_badges' | 'minigame_bests' | 'player_items' | 'igloo_slots' | 'shop_items';

/**
 * The narrow slice of a Supabase client `createSupabaseProgressStore` needs:
 * only the `from()`/`rpc()` chains this file actually calls. Table-specific
 * shapes are recovered with a cast at each call site rather than by
 * overloading `from()`, so both this interface and `toProgressClient` stay
 * simple to implement (an overloaded `from()` is awkward for any single
 * implementing function, including a test fake).
 */
export interface ProgressClient {
  from(table: ProgressTableName): ProgressTable;
  rpc(
    fn: 'record_round' | 'purchase_item' | 'leaderboard',
    args: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
}

/** `public.leaderboard`'s row shape, straight off PostgREST. */
export interface LeaderboardRpcRow {
  rank: number;
  penguin_name: string;
  best_score: number;
  is_me: boolean;
}

/**
 * Column -> `PenguinLook` field mapping, exactly `pglite-progress-store.ts`'s
 * `toLook`: `penguin_color` is the body colour, `idle_emote` is the emote,
 * `penguin_name` is the name.
 */
function toLook(row: PlayerRow): PenguinLook {
  return {
    name: row.penguin_name,
    body: row.penguin_color as PenguinLook['body'],
    cap: row.cap as PenguinLook['cap'],
    beak: row.beak as PenguinLook['beak'],
    feet: row.feet as PenguinLook['feet'],
    belly: row.belly as PenguinLook['belly'],
    hat: row.hat as Hat,
    pattern: row.pattern as Pattern,
    eyes: row.eyes as Eyes,
    emote: row.idle_emote as IdleEmote,
  };
}

const SELECT_PLAYER_COLUMNS =
  'penguin_name, penguin_color, cap, beak, feet, belly, hat, pattern, eyes, idle_emote, tokens, profile_created_at';

/**
 * Maps a raw PostgREST/RPC error to the `ProgressStoreError` #27's functions
 * and constraints intend: a raised message that is already a known code is
 * that code; `22P02` (a value that can't parse as its column's type) is
 * `invalid_score`; a `23503`/`23514` means whatever the caller's own
 * constraint means (`igloo_slots`' foreign key/check, or `players`' look
 * check) via `overrides`. Anything else becomes a plain `Error` carrying the
 * original message: network failures and anything unrecognized.
 */
function toProgressError(
  err: PostgrestErrorLike,
  overrides: { on23503?: ProgressErrorCode; on23514?: ProgressErrorCode } = {},
): Error {
  if (isProgressErrorCode(err.message)) {
    return new ProgressStoreError(err.message);
  }
  if (err.code === '22P02') {
    return new ProgressStoreError('invalid_score');
  }
  if (err.code === '23503' && overrides.on23503) {
    return new ProgressStoreError(overrides.on23503);
  }
  if (err.code === '23514' && overrides.on23514) {
    return new ProgressStoreError(overrides.on23514);
  }
  return new Error(err.message);
}

/** A short, human toast message per known `ProgressErrorCode`. */
const TOAST_MESSAGES: Record<ProgressErrorCode, string> = {
  not_authenticated: "You're not signed in",
  no_player: "Couldn't find your Player",
  unknown_minigame: "That Minigame doesn't exist",
  invalid_score: "That round couldn't be saved",
  invalid_stats: "That round couldn't be saved",
  round_too_soon: 'Slow down! Try again in a few seconds',
  unknown_item: "That item doesn't exist",
  already_owned: 'You already own that',
  insufficient_tokens: 'Not enough tokens',
  invalid_look: "That Penguin look can't be saved",
  not_owned: "You don't own that item",
  invalid_slot: "That slot doesn't exist",
};

/** Anything that isn't a typed `ProgressStoreError`: network failures, unrecognized errors. */
const GENERIC_TOAST_MESSAGE = "Couldn't reach the server. Your progress wasn't saved.";

function toastMessage(err: unknown): string {
  if (err instanceof ProgressStoreError) {
    return TOAST_MESSAGES[err.code];
  }
  return GENERIC_TOAST_MESSAGE;
}

export interface CreateSupabaseProgressStoreOptions {
  client: ProgressClient;
  playerId: string;
  /** Omit to build a store that emits nothing, as in most unit tests. */
  emitter?: TypedEmitter<GameEventMap>;
}

/**
 * The real `ProgressStore`, backed by #27's `saved_progress` migration
 * through a Supabase client. Never throws synchronously (every method body is
 * `async`, so even a client-side validation failure becomes a rejected
 * promise). A known failure (one of #27's raised messages, or a client-side
 * validation failure) rejects with a typed `ProgressStoreError`; a network
 * failure or anything unrecognized rejects with a plain `Error` instead, since
 * no `ProgressErrorCode` exists for it. `ui:toast` is emitted on every failure
 * only when `options.emitter` is supplied (most unit tests omit it). Producer:
 * #34. Consumers: #35, #37, #40, #41, #42.
 */
export function createSupabaseProgressStore(
  options: CreateSupabaseProgressStoreOptions,
): ProgressStore {
  const { client, playerId, emitter } = options;

  function fail(err: unknown): never {
    emitter?.emit('ui:toast', { message: toastMessage(err) });
    throw err;
  }

  async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      return fail(err);
    }
  }

  function loadAll(): Promise<ProgressSnapshot> {
    return guarded(async () => {
      const playersTable = client.from('players') as PlayersTable;
      const playerBadgesTable = client.from('player_badges') as PlayerBadgesTable;
      const minigameBestsTable = client.from('minigame_bests') as MinigameBestsTable;
      const playerItemsTable = client.from('player_items') as PlayerItemsTable;
      const iglooSlotsTable = client.from('igloo_slots') as IglooSlotsTable;
      const shopItemsTable = client.from('shop_items') as ShopItemsTable;

      const [playerRes, badgesRes, bestsRes, itemsRes, slotsRes, catalogRes] = await Promise.all([
        playersTable.select(SELECT_PLAYER_COLUMNS).eq('id', playerId).maybeSingle(),
        playerBadgesTable
          .select('badge_id')
          .eq('player_id', playerId)
          .order('earned_at', { ascending: true })
          .order('badge_id', { ascending: true }),
        minigameBestsTable.select('minigame_id, best_score').eq('player_id', playerId),
        playerItemsTable
          .select('item_id')
          .eq('player_id', playerId)
          .order('acquired_at', { ascending: true })
          .order('item_id', { ascending: true }),
        iglooSlotsTable.select('slot, item_id').eq('player_id', playerId),
        shopItemsTable
          .select('id, stall, name, price, art_key')
          .order('price', { ascending: true })
          .order('id', { ascending: true }),
      ]);

      for (const res of [playerRes, badgesRes, bestsRes, itemsRes, slotsRes, catalogRes]) {
        if (res.error) {
          throw toProgressError(res.error);
        }
      }
      if (!playerRes.data) {
        throw new ProgressStoreError('no_player');
      }

      const slots = emptySlots();
      for (const row of slotsRes.data ?? []) {
        if (isIglooSlot(row.slot)) {
          slots[row.slot] = row.item_id;
        }
      }

      return {
        look: toLook(playerRes.data),
        profileCreatedAt: playerRes.data.profile_created_at
          ? new Date(playerRes.data.profile_created_at).toISOString()
          : null,
        tokens: playerRes.data.tokens,
        badges: (badgesRes.data ?? []).map((row) => row.badge_id),
        bests: Object.fromEntries(
          (bestsRes.data ?? []).map((row) => [row.minigame_id, row.best_score]),
        ) as Partial<Record<MinigameId, number>>,
        ownedItems: (itemsRes.data ?? []).map((row) => row.item_id),
        slots,
        catalog: (catalogRes.data ?? []).map((row) => ({
          id: row.id,
          stall: row.stall,
          name: row.name,
          price: row.price,
          artKey: row.art_key,
        })),
      };
    });
  }

  function saveLook(look: PenguinLook): Promise<void> {
    return guarded(async () => {
      validateLook(look);

      // Two requests, not one: PostgREST can't express
      // `coalesce(profile_created_at, now())` in a single update, so the look
      // and the first-save timestamp go in separately. The timestamp is the
      // client's clock, not the server's. If the second request rejects, the
      // look is already saved; a retry of `saveLook` completes the timestamp
      // write (it's a no-op once `profile_created_at` is already set).
      const playersTable = client.from('players') as PlayersTable;
      const { error } = await playersTable
        .update({
          penguin_name: look.name,
          penguin_color: look.body,
          cap: look.cap,
          beak: look.beak,
          feet: look.feet,
          belly: look.belly,
          hat: look.hat,
          pattern: look.pattern,
          eyes: look.eyes,
          idle_emote: look.emote,
        })
        .eq('id', playerId);
      if (error) {
        throw toProgressError(error, { on23514: 'invalid_look' });
      }

      // Set on the first save only; the name is already set above, which
      // `players_name_set_once_created` requires before this can succeed.
      const { error: createdError } = await playersTable
        .update({ profile_created_at: new Date().toISOString() })
        .eq('id', playerId)
        .is('profile_created_at', null);
      if (createdError) {
        throw toProgressError(createdError, { on23514: 'invalid_look' });
      }
    });
  }

  function recordRound<K extends MinigameId>(
    minigameId: K,
    score: number,
    stats: MinigameStatsMap[K],
  ): Promise<RoundResult> {
    return guarded(async () => {
      const { data, error } = await client.rpc('record_round', {
        minigame_id: minigameId,
        score,
        stats,
      });
      if (error) {
        throw toProgressError(error);
      }
      const result = data as RoundResult;
      emitter?.emit('tokens:changed', { balance: result.balance });
      if (result.badgeEarned) {
        emitter?.emit('badge:earned', { badgeId: MINIGAME_RULES[minigameId].badgeId });
      }
      return result;
    });
  }

  function purchase(itemId: string): Promise<PurchaseResult> {
    return guarded(async () => {
      const { data, error } = await client.rpc('purchase_item', { item_id: itemId });
      if (error) {
        throw toProgressError(error);
      }
      const result = data as PurchaseResult;
      emitter?.emit('tokens:changed', { balance: result.balance });
      return result;
    });
  }

  function setSlot(slot: IglooSlot, itemId: string | null): Promise<void> {
    return guarded(async () => {
      if (!isIglooSlot(slot)) {
        throw new ProgressStoreError('invalid_slot');
      }

      // The delete and the upsert below are two separate requests, not one
      // transaction: an atomic move needs an RPC, owned by #27, that doesn't
      // exist yet.
      const iglooSlotsTable = client.from('igloo_slots') as IglooSlotsTable;

      if (itemId === null) {
        const { error } = await iglooSlotsTable.delete().eq('player_id', playerId).eq('slot', slot);
        if (error) {
          throw toProgressError(error, { on23503: 'not_owned', on23514: 'invalid_slot' });
        }
        return;
      }

      // Moving an owned item: drop it from wherever it currently sits, then
      // place it in the requested slot, mirroring the pglite/SQL harness.
      const { error: deleteError } = await iglooSlotsTable
        .delete()
        .eq('player_id', playerId)
        .eq('item_id', itemId);
      if (deleteError) {
        throw toProgressError(deleteError, { on23503: 'not_owned', on23514: 'invalid_slot' });
      }

      const { error: upsertError } = await iglooSlotsTable.upsert(
        { player_id: playerId, slot, item_id: itemId },
        { onConflict: 'player_id,slot' },
      );
      if (upsertError) {
        throw toProgressError(upsertError, { on23503: 'not_owned', on23514: 'invalid_slot' });
      }
    });
  }

  // Deliberately not wrapped in `guarded()`: a failed *read* never emits
  // `ui:toast` ("your progress wasn't saved" is the wrong message for this),
  // so this rejects with the same error `guarded()` would have, just
  // without the toast side effect. `async` still means a throw here becomes
  // a rejected promise, never a synchronous throw.
  async function leaderboard(
    minigameId: MinigameId,
    maxRows?: number,
  ): Promise<LeaderboardEntry[]> {
    const { data, error } = await client.rpc('leaderboard', {
      minigame_id: minigameId,
      // Clamped client-side too (round 2 red-team, 2026-09-25), the same
      // way the fake does: the server clamps again regardless, but this
      // keeps every caller of this store sending the same, already-valid
      // value the SQL function would otherwise have to correct.
      max_rows: clampLeaderboardRows(maxRows),
    });
    if (error) {
      throw toProgressError(error);
    }
    const rows = (data ?? []) as LeaderboardRpcRow[];
    // Maps exactly these four fields, even if the RPC ever returns more
    // (#70 A2): nothing else is trusted to reach a rendered leaderboard row.
    return rows.map((row) => ({
      rank: row.rank,
      penguinName: row.penguin_name,
      bestScore: row.best_score,
      isMe: row.is_me,
    }));
  }

  return { loadAll, saveLook, recordRound, purchase, setSlot, leaderboard };
}

/**
 * Adapts the real (heavily generic) `SupabaseClient` to the narrow
 * `ProgressClient`, one call at a time, exactly as `auth/auth-session.ts`'s
 * `toAuthClient` does for the same reason: assigning the raw client where a
 * narrow interface is expected trips TS2589 against its generic `from()`
 * overloads.
 */
export function toProgressClient(client: SupabaseClient): ProgressClient {
  function playersTable(): PlayersTable {
    const table = client.from('players');
    return {
      select: (columns) => {
        const selected = table.select(columns);
        return {
          eq: (column, value) => {
            const filtered = selected.eq(column, value);
            return { maybeSingle: () => filtered.maybeSingle() };
          },
        };
      },
      update: (values) => {
        const updated = table.update(values);
        return {
          eq: (column, value) => updated.eq(column, value),
        };
      },
    };
  }

  function playerBadgesTable(): PlayerBadgesTable {
    const table = client.from('player_badges');
    return {
      select: (columns) => {
        const selected = table.select(columns);
        return {
          eq: (column, value) => selected.eq(column, value) as unknown as OrderableRows<BadgeRow>,
        };
      },
    };
  }

  function minigameBestsTable(): MinigameBestsTable {
    const table = client.from('minigame_bests');
    return {
      select: (columns) => {
        const selected = table.select(columns);
        return {
          eq: (column, value) =>
            selected.eq(column, value) as unknown as PromiseLike<SelectResult<BestRow[]>>,
        };
      },
    };
  }

  function playerItemsTable(): PlayerItemsTable {
    const table = client.from('player_items');
    return {
      select: (columns) => {
        const selected = table.select(columns);
        return {
          eq: (column, value) => selected.eq(column, value) as unknown as OrderableRows<ItemRow>,
        };
      },
    };
  }

  function iglooSlotsTable(): IglooSlotsTable {
    const table = client.from('igloo_slots');
    return {
      select: (columns) => {
        const selected = table.select(columns);
        return {
          eq: (column, value) =>
            selected.eq(column, value) as unknown as PromiseLike<SelectResult<SlotRow[]>>,
        };
      },
      delete: () => {
        const builder = table.delete();
        return {
          eq: (column, value) => {
            const filtered = builder.eq(column, value);
            return { eq: (column2, value2) => filtered.eq(column2, value2) };
          },
        };
      },
      upsert: (values, options) => table.upsert(values, options),
    };
  }

  function shopItemsTable(): ShopItemsTable {
    const table = client.from('shop_items');
    return { select: (columns) => table.select(columns) };
  }

  return {
    from: (table: ProgressTableName): ProgressTable => {
      switch (table) {
        case 'players':
          return playersTable();
        case 'player_badges':
          return playerBadgesTable();
        case 'minigame_bests':
          return minigameBestsTable();
        case 'player_items':
          return playerItemsTable();
        case 'igloo_slots':
          return iglooSlotsTable();
        case 'shop_items':
          return shopItemsTable();
        default: {
          const exhaustiveCheck: never = table;
          throw new Error(`Unknown ProgressClient table: ${String(exhaustiveCheck)}`);
        }
      }
    },
    rpc: (fn, args) => client.rpc(fn, args),
  };
}
