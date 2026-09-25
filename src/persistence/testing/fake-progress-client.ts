import { DEFAULT_LOOK } from '../../contracts/penguin';
import type { BadgeId, MinigameId } from '../../contracts/game-events';
import type { ProgressClient } from '../supabase-progress-store';

// A hand-written fake `ProgressClient`: no real network or database, but the
// exact table/RPC/filter shape `createSupabaseProgressStore` depends on.
// Every call is logged so tests can assert exactly what was sent. Shared by
// `supabase-progress-store.test.ts` and `hud-progress.test.ts` (#34).

export interface FakeError {
  message: string;
  code?: string;
}

export interface FakeResult<T> {
  data: T;
  error: FakeError | null;
}

export interface PlayerRow {
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

export function defaultPlayerRow(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    penguin_name: DEFAULT_LOOK.name,
    penguin_color: DEFAULT_LOOK.body,
    cap: DEFAULT_LOOK.cap,
    beak: DEFAULT_LOOK.beak,
    feet: DEFAULT_LOOK.feet,
    belly: DEFAULT_LOOK.belly,
    hat: DEFAULT_LOOK.hat,
    pattern: DEFAULT_LOOK.pattern,
    eyes: DEFAULT_LOOK.eyes,
    idle_emote: DEFAULT_LOOK.emote,
    tokens: 100,
    profile_created_at: null,
    ...overrides,
  };
}

export interface FakeResponses {
  player?: FakeResult<PlayerRow | null>;
  badges?: FakeResult<Array<{ badge_id: BadgeId }>>;
  bests?: FakeResult<Array<{ minigame_id: MinigameId; best_score: number }>>;
  items?: FakeResult<Array<{ item_id: string }>>;
  slots?: FakeResult<Array<{ slot: number; item_id: string }>>;
  catalog?: FakeResult<
    Array<{ id: string; stall: string; name: string; price: number; art_key: string }>
  >;
  updateLook?: { error: FakeError | null };
  updateCreatedAt?: { error: FakeError | null };
  deleteBySlot?: { error: FakeError | null };
  deleteByItem?: { error: FakeError | null };
  upsertSlot?: { error: FakeError | null };
  recordRound?: FakeResult<unknown>;
  purchaseItem?: FakeResult<unknown>;
  leaderboard?: FakeResult<unknown>;
}

export type LoggedCall = [op: string, ...args: unknown[]];

/** Wraps `result` as a Promise that also supports `.order()`, chainably, like PostgREST's own builders. */
function orderable<T>(
  result: T,
  calls: LoggedCall[],
  op: string,
): PromiseLike<T> & {
  order: (column: string, options?: { ascending?: boolean }) => ReturnType<typeof orderable<T>>;
} {
  const promise = Promise.resolve(result) as unknown as PromiseLike<T> & {
    order: (column: string, options?: { ascending?: boolean }) => ReturnType<typeof orderable<T>>;
  };
  promise.order = (column, options) => {
    calls.push([`${op}.order`, column, options]);
    return orderable(result, calls, op);
  };
  return promise;
}

export function makeFakeClient(responses: FakeResponses = {}): {
  client: ProgressClient;
  calls: LoggedCall[];
} {
  const calls: LoggedCall[] = [];
  const log = (...call: LoggedCall) => calls.push(call);

  const player = responses.player ?? { data: defaultPlayerRow(), error: null };
  const badges = responses.badges ?? { data: [], error: null };
  const bests = responses.bests ?? { data: [], error: null };
  const items = responses.items ?? { data: [], error: null };
  const slots = responses.slots ?? { data: [], error: null };
  const catalog = responses.catalog ?? { data: [], error: null };
  const updateLook = responses.updateLook ?? { error: null };
  const updateCreatedAt = responses.updateCreatedAt ?? { error: null };
  const deleteBySlot = responses.deleteBySlot ?? { error: null };
  const deleteByItem = responses.deleteByItem ?? { error: null };
  const upsertSlot = responses.upsertSlot ?? { error: null };
  const recordRound =
    responses.recordRound ??
    ({
      data: { tokensAwarded: 0, balance: 100, newBest: false, badgeEarned: false },
      error: null,
    } satisfies FakeResult<unknown>);
  const purchaseItem =
    responses.purchaseItem ??
    ({ data: { balance: 100 }, error: null } satisfies FakeResult<unknown>);
  const leaderboard =
    responses.leaderboard ?? ({ data: [], error: null } satisfies FakeResult<unknown>);

  const client: ProgressClient = {
    from(table) {
      switch (table) {
        case 'players':
          return {
            select: (columns: string) => {
              log('players.select', columns);
              return {
                eq: (column: string, value: string) => {
                  log('players.select.eq', column, value);
                  return {
                    maybeSingle: async () => {
                      log('players.select.maybeSingle');
                      return player;
                    },
                  };
                },
              };
            },
            update: (values: Record<string, unknown>) => {
              const isLookUpdate = 'penguin_name' in values;
              log(isLookUpdate ? 'players.update.look' : 'players.update.createdAt', values);
              return {
                eq: (column: string, value: string) => {
                  log(
                    isLookUpdate ? 'players.update.look.eq' : 'players.update.createdAt.eq',
                    column,
                    value,
                  );
                  const result = isLookUpdate ? updateLook : updateCreatedAt;
                  const promise = Promise.resolve(result) as Promise<typeof result> & {
                    is: (column: string, value: null) => Promise<typeof updateCreatedAt>;
                  };
                  promise.is = (isColumn: string, isValue: null) => {
                    log('players.update.createdAt.eq.is', isColumn, isValue);
                    return Promise.resolve(updateCreatedAt);
                  };
                  return promise;
                },
              };
            },
          } as never;
        case 'player_badges':
          return {
            select: (columns: string) => {
              log('player_badges.select', columns);
              return {
                eq: (column: string, value: string) => {
                  log('player_badges.select.eq', column, value);
                  return orderable(badges, calls, 'player_badges.select.eq');
                },
              };
            },
          } as never;
        case 'minigame_bests':
          return {
            select: (columns: string) => {
              log('minigame_bests.select', columns);
              return {
                eq: (column: string, value: string) => {
                  log('minigame_bests.select.eq', column, value);
                  return Promise.resolve(bests);
                },
              };
            },
          } as never;
        case 'player_items':
          return {
            select: (columns: string) => {
              log('player_items.select', columns);
              return {
                eq: (column: string, value: string) => {
                  log('player_items.select.eq', column, value);
                  return orderable(items, calls, 'player_items.select.eq');
                },
              };
            },
          } as never;
        case 'igloo_slots':
          return {
            select: (columns: string) => {
              log('igloo_slots.select', columns);
              return {
                eq: (column: string, value: string) => {
                  log('igloo_slots.select.eq', column, value);
                  return Promise.resolve(slots);
                },
              };
            },
            delete: () => {
              log('igloo_slots.delete');
              return {
                eq: (column: string, value: string) => {
                  log('igloo_slots.delete.eq', column, value);
                  return {
                    eq: (column2: string, value2: string | number) => {
                      log('igloo_slots.delete.eq.eq', column2, value2);
                      return Promise.resolve(column2 === 'slot' ? deleteBySlot : deleteByItem);
                    },
                  };
                },
              };
            },
            upsert: (values: unknown, options: unknown) => {
              log('igloo_slots.upsert', values, options);
              return Promise.resolve(upsertSlot);
            },
          } as never;
        case 'shop_items':
          return {
            select: (columns: string) => {
              log('shop_items.select', columns);
              return orderable(catalog, calls, 'shop_items.select');
            },
          } as never;
        default:
          throw new Error(`unexpected table ${String(table)}`);
      }
    },
    rpc(fn: string, args: Record<string, unknown>) {
      log(`rpc.${fn}`, args);
      if (fn === 'record_round') {
        return Promise.resolve(recordRound);
      }
      if (fn === 'purchase_item') {
        return Promise.resolve(purchaseItem);
      }
      if (fn === 'leaderboard') {
        return Promise.resolve(leaderboard);
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  };

  return { client, calls };
}
