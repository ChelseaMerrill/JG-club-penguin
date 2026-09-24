import { describe, expect, it } from 'vitest';
import { createEmitter } from '../contracts/emitter';
import { DEFAULT_LOOK, type PenguinLook } from '../contracts/penguin';
import type { BadgeId, GameEventMap, MinigameId } from '../contracts/game-events';
import { MINIGAME_RULES } from './minigame-rules';
import { ProgressStoreError } from './progress-store';
import { createSupabaseProgressStore, type ProgressClient } from './supabase-progress-store';

// A hand-written fake `ProgressClient`: no real network or database, but the
// exact table/RPC/filter shape `createSupabaseProgressStore` depends on.
// Every call is logged so tests can assert exactly what was sent.

interface FakeError {
  message: string;
  code?: string;
}

interface FakeResult<T> {
  data: T;
  error: FakeError | null;
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

function defaultPlayerRow(overrides: Partial<PlayerRow> = {}): PlayerRow {
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

interface FakeResponses {
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
}

type LoggedCall = [op: string, ...args: unknown[]];

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

function makeFakeClient(responses: FakeResponses = {}): {
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
      throw new Error(`unexpected rpc ${fn}`);
    },
  };

  return { client, calls };
}

const PLAYER_ID = 'player-1';
const VALID_LOOK: PenguinLook = { ...DEFAULT_LOOK, name: 'Chilly' };

describe('createSupabaseProgressStore', () => {
  describe('loadAll', () => {
    it('sends the exact table, columns and filters for every query', async () => {
      const { client, calls } = makeFakeClient();
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      await store.loadAll();

      expect(calls).toContainEqual([
        'players.select',
        'penguin_name, penguin_color, cap, beak, feet, belly, hat, pattern, eyes, idle_emote, tokens, profile_created_at',
      ]);
      expect(calls).toContainEqual(['players.select.eq', 'id', PLAYER_ID]);
      expect(calls).toContainEqual(['players.select.maybeSingle']);

      expect(calls).toContainEqual(['player_badges.select', 'badge_id']);
      expect(calls).toContainEqual(['player_badges.select.eq', 'player_id', PLAYER_ID]);
      expect(calls).toContainEqual([
        'player_badges.select.eq.order',
        'earned_at',
        { ascending: true },
      ]);
      expect(calls).toContainEqual([
        'player_badges.select.eq.order',
        'badge_id',
        { ascending: true },
      ]);

      expect(calls).toContainEqual(['minigame_bests.select', 'minigame_id, best_score']);
      expect(calls).toContainEqual(['minigame_bests.select.eq', 'player_id', PLAYER_ID]);

      expect(calls).toContainEqual(['player_items.select', 'item_id']);
      expect(calls).toContainEqual(['player_items.select.eq', 'player_id', PLAYER_ID]);
      expect(calls).toContainEqual([
        'player_items.select.eq.order',
        'acquired_at',
        { ascending: true },
      ]);
      expect(calls).toContainEqual([
        'player_items.select.eq.order',
        'item_id',
        { ascending: true },
      ]);

      expect(calls).toContainEqual(['igloo_slots.select', 'slot, item_id']);
      expect(calls).toContainEqual(['igloo_slots.select.eq', 'player_id', PLAYER_ID]);

      expect(calls).toContainEqual(['shop_items.select', 'id, stall, name, price, art_key']);
      expect(calls).toContainEqual(['shop_items.select.order', 'price', { ascending: true }]);
      expect(calls).toContainEqual(['shop_items.select.order', 'id', { ascending: true }]);
    });

    it('rejects with no_player when the players row is missing, and emits a toast', async () => {
      const { client } = makeFakeClient({ player: { data: null, error: null } });
      const messages: string[] = [];
      const emitter = createEmitter<GameEventMap>();
      emitter.on('ui:toast', ({ message }) => messages.push(message));
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID, emitter });

      await expect(store.loadAll()).rejects.toMatchObject({ code: 'no_player' });
      expect(messages).toHaveLength(1);
    });

    it('maps the full snapshot: look, profileCreatedAt, tokens, badges, bests, ownedItems, slots and catalog', async () => {
      const { client } = makeFakeClient({
        player: {
          data: defaultPlayerRow({
            penguin_name: 'Chilly',
            tokens: 250,
            profile_created_at: '2026-09-24T00:00:00.000Z',
          }),
          error: null,
        },
        badges: { data: [{ badge_id: 'exterminator' }], error: null },
        bests: { data: [{ minigame_id: 'bug-squash', best_score: 520 }], error: null },
        items: { data: [{ item_id: 'beanbag' }], error: null },
        slots: { data: [{ slot: 1, item_id: 'beanbag' }], error: null },
        catalog: {
          data: [{ id: 'beanbag', stall: 'igloo', name: 'Beanbag', price: 50, art_key: 'beanbag' }],
          error: null,
        },
      });
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      const snapshot = await store.loadAll();

      expect(snapshot.look).toEqual({ ...DEFAULT_LOOK, name: 'Chilly' });
      expect(snapshot.profileCreatedAt).toBe('2026-09-24T00:00:00.000Z');
      expect(snapshot.tokens).toBe(250);
      expect(snapshot.badges).toEqual(['exterminator']);
      expect(snapshot.bests).toEqual({ 'bug-squash': 520 });
      expect(snapshot.ownedItems).toEqual(['beanbag']);
      expect(snapshot.slots).toEqual({ 1: 'beanbag', 2: null, 3: null, 4: null, 5: null, 6: null });
      expect(snapshot.catalog).toEqual([
        { id: 'beanbag', stall: 'igloo', name: 'Beanbag', price: 50, artKey: 'beanbag' },
      ]);
    });

    it('normalizes a null profile_created_at to null', async () => {
      const { client } = makeFakeClient();
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      const snapshot = await store.loadAll();

      expect(snapshot.profileCreatedAt).toBeNull();
    });
  });

  describe('saveLook', () => {
    it('rejects invalid_look client-side, sending no calls, and emits its toast', async () => {
      const { client, calls } = makeFakeClient();
      const messages: string[] = [];
      const emitter = createEmitter<GameEventMap>();
      emitter.on('ui:toast', ({ message }) => messages.push(message));
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID, emitter });

      await expect(store.saveLook({ ...DEFAULT_LOOK, name: '' })).rejects.toMatchObject({
        code: 'invalid_look',
      });
      expect(calls).toEqual([]);
      expect(messages).toEqual(["That Penguin look can't be saved"]);
    });

    it('sends the ten look columns, then sets profile_created_at only on the first save', async () => {
      const { client, calls } = makeFakeClient();
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      await store.saveLook(VALID_LOOK);

      expect(calls[0]).toEqual([
        'players.update.look',
        {
          penguin_name: 'Chilly',
          penguin_color: VALID_LOOK.body,
          cap: VALID_LOOK.cap,
          beak: VALID_LOOK.beak,
          feet: VALID_LOOK.feet,
          belly: VALID_LOOK.belly,
          hat: VALID_LOOK.hat,
          pattern: VALID_LOOK.pattern,
          eyes: VALID_LOOK.eyes,
          idle_emote: VALID_LOOK.emote,
        },
      ]);
      expect(calls[1]).toEqual(['players.update.look.eq', 'id', PLAYER_ID]);
      expect(calls[2][0]).toBe('players.update.createdAt');
      expect(calls[3]).toEqual(['players.update.createdAt.eq', 'id', PLAYER_ID]);
      expect(calls[4][0]).toBe('players.update.createdAt.eq.is');
      expect(calls[4][1]).toBe('profile_created_at');
      expect(calls[4][2]).toBeNull();
    });

    it('rejects invalid_look when the server look check fails (23514)', async () => {
      const { client } = makeFakeClient({
        updateLook: { error: { message: 'bad look', code: '23514' } },
      });
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      await expect(store.saveLook(VALID_LOOK)).rejects.toMatchObject({ code: 'invalid_look' });
    });
  });

  describe('recordRound', () => {
    it('sends the exact rpc name and args, and emits tokens:changed without badge:earned', async () => {
      const { client, calls } = makeFakeClient({
        recordRound: {
          data: { tokensAwarded: 52, balance: 152, newBest: true, badgeEarned: false },
          error: null,
        },
      });
      const balances: number[] = [];
      const badgeEvents: BadgeId[] = [];
      const emitter = createEmitter<GameEventMap>();
      emitter.on('tokens:changed', ({ balance }) => balances.push(balance));
      emitter.on('badge:earned', ({ badgeId }) => badgeEvents.push(badgeId));
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID, emitter });

      const result = await store.recordRound('bug-squash', 520, { squashed: 520 });

      expect(calls).toContainEqual([
        'rpc.record_round',
        { minigame_id: 'bug-squash', score: 520, stats: { squashed: 520 } },
      ]);
      expect(result).toEqual({
        tokensAwarded: 52,
        balance: 152,
        newBest: true,
        badgeEarned: false,
      });
      expect(balances).toEqual([152]);
      expect(badgeEvents).toEqual([]);
    });

    it('emits badge:earned with the minigame rule badgeId when badgeEarned is true', async () => {
      const { client } = makeFakeClient({
        recordRound: {
          data: { tokensAwarded: 52, balance: 202, newBest: true, badgeEarned: true },
          error: null,
        },
      });
      const badgeEvents: BadgeId[] = [];
      const emitter = createEmitter<GameEventMap>();
      emitter.on('badge:earned', ({ badgeId }) => badgeEvents.push(badgeId));
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID, emitter });

      await store.recordRound('bug-squash', 520, { squashed: 520 });

      expect(badgeEvents).toEqual([MINIGAME_RULES['bug-squash'].badgeId]);
      expect(badgeEvents).toEqual(['exterminator']);
    });

    it('rejects round_too_soon and emits its toast', async () => {
      const { client } = makeFakeClient({
        recordRound: { data: null, error: { message: 'round_too_soon' } },
      });
      const messages: string[] = [];
      const emitter = createEmitter<GameEventMap>();
      emitter.on('ui:toast', ({ message }) => messages.push(message));
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID, emitter });

      await expect(store.recordRound('bug-squash', 520, { squashed: 520 })).rejects.toMatchObject({
        code: 'round_too_soon',
      });
      expect(messages).toEqual(['Slow down! Try again in a few seconds']);
    });

    it('maps 22P02 to invalid_score', async () => {
      const { client } = makeFakeClient({
        recordRound: { data: null, error: { message: 'invalid input syntax', code: '22P02' } },
      });
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      await expect(store.recordRound('bug-squash', 520, { squashed: 520 })).rejects.toMatchObject({
        code: 'invalid_score',
      });
    });

    it('rejects an unrecognized error as a plain, non-ProgressStoreError Error', async () => {
      const { client } = makeFakeClient({
        recordRound: { data: null, error: { message: 'connection reset' } },
      });
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      const rejection = store.recordRound('bug-squash', 520, { squashed: 520 });
      await expect(rejection).rejects.toThrow('connection reset');
      await expect(rejection).rejects.not.toBeInstanceOf(ProgressStoreError);
    });

    it('emits the generic toast for an unrecognized error', async () => {
      const { client } = makeFakeClient({
        recordRound: { data: null, error: { message: 'connection reset' } },
      });
      const messages: string[] = [];
      const emitter = createEmitter<GameEventMap>();
      emitter.on('ui:toast', ({ message }) => messages.push(message));
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID, emitter });

      await expect(store.recordRound('bug-squash', 520, { squashed: 520 })).rejects.toThrow();
      expect(messages).toEqual(["Couldn't reach the server. Your progress wasn't saved."]);
    });
  });

  describe('purchase', () => {
    it('sends the exact rpc name and args, and emits tokens:changed on success', async () => {
      const { client, calls } = makeFakeClient({
        purchaseItem: { data: { balance: 20 }, error: null },
      });
      const balances: number[] = [];
      const emitter = createEmitter<GameEventMap>();
      emitter.on('tokens:changed', ({ balance }) => balances.push(balance));
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID, emitter });

      const result = await store.purchase('desk');

      expect(calls).toContainEqual(['rpc.purchase_item', { item_id: 'desk' }]);
      expect(result).toEqual({ balance: 20 });
      expect(balances).toEqual([20]);
    });

    const typedPurchaseErrors = [
      'unknown_item',
      'already_owned',
      'insufficient_tokens',
      'no_player',
      'not_authenticated',
    ] as const;
    it.each(typedPurchaseErrors)('maps %s to a ProgressStoreError with that code', async (code) => {
      const { client } = makeFakeClient({
        purchaseItem: { data: null, error: { message: code } },
      });
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      const rejection = store.purchase('desk');
      await expect(rejection).rejects.toBeInstanceOf(ProgressStoreError);
      await expect(rejection).rejects.toMatchObject({ code });
    });

    it('emits the insufficient_tokens toast text exactly', async () => {
      const { client } = makeFakeClient({
        purchaseItem: { data: null, error: { message: 'insufficient_tokens' } },
      });
      const messages: string[] = [];
      const emitter = createEmitter<GameEventMap>();
      emitter.on('ui:toast', ({ message }) => messages.push(message));
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID, emitter });

      await expect(store.purchase('desk')).rejects.toBeDefined();
      expect(messages).toEqual(['Not enough tokens']);
    });

    it('emits the already_owned toast text exactly', async () => {
      const { client } = makeFakeClient({
        purchaseItem: { data: null, error: { message: 'already_owned' } },
      });
      const messages: string[] = [];
      const emitter = createEmitter<GameEventMap>();
      emitter.on('ui:toast', ({ message }) => messages.push(message));
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID, emitter });

      await expect(store.purchase('desk')).rejects.toBeDefined();
      expect(messages).toEqual(['You already own that']);
    });
  });

  describe('setSlot', () => {
    it('rejects invalid_slot client-side for an out-of-range slot, sending no calls', async () => {
      const { client, calls } = makeFakeClient();
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      await expect(
        store.setSlot(7 as Parameters<typeof store.setSlot>[0], 'beanbag'),
      ).rejects.toMatchObject({ code: 'invalid_slot' });
      expect(calls).toEqual([]);
    });

    it('null deletes by player_id and slot', async () => {
      const { client, calls } = makeFakeClient();
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      await store.setSlot(1, null);

      expect(calls).toEqual([
        ['igloo_slots.delete'],
        ['igloo_slots.delete.eq', 'player_id', PLAYER_ID],
        ['igloo_slots.delete.eq.eq', 'slot', 1],
      ]);
    });

    it('an item id deletes by item_id first, then upserts with onConflict player_id,slot', async () => {
      const { client, calls } = makeFakeClient();
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      await store.setSlot(3, 'beanbag');

      expect(calls).toEqual([
        ['igloo_slots.delete'],
        ['igloo_slots.delete.eq', 'player_id', PLAYER_ID],
        ['igloo_slots.delete.eq.eq', 'item_id', 'beanbag'],
        [
          'igloo_slots.upsert',
          { player_id: PLAYER_ID, slot: 3, item_id: 'beanbag' },
          { onConflict: 'player_id,slot' },
        ],
      ]);
    });

    it('maps a 23503 on the upsert to not_owned', async () => {
      const { client } = makeFakeClient({
        upsertSlot: { error: { message: 'foreign key violation', code: '23503' } },
      });
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      await expect(store.setSlot(1, 'beanbag')).rejects.toMatchObject({ code: 'not_owned' });
    });

    it('maps a 23514 on the upsert to invalid_slot', async () => {
      const { client } = makeFakeClient({
        upsertSlot: { error: { message: 'check violation', code: '23514' } },
      });
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      await expect(store.setSlot(1, 'beanbag')).rejects.toMatchObject({ code: 'invalid_slot' });
    });

    it('emits the not_owned toast text exactly', async () => {
      const { client } = makeFakeClient({
        deleteByItem: { error: { message: 'not_owned' } },
      });
      const messages: string[] = [];
      const emitter = createEmitter<GameEventMap>();
      emitter.on('ui:toast', ({ message }) => messages.push(message));
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID, emitter });

      await expect(store.setSlot(1, 'beanbag')).rejects.toBeDefined();
      expect(messages).toEqual(["You don't own that item"]);
    });
  });

  describe('without an emitter', () => {
    it('completes a successful call without emitting or throwing', async () => {
      const { client } = makeFakeClient({
        recordRound: {
          data: { tokensAwarded: 52, balance: 152, newBest: true, badgeEarned: false },
          error: null,
        },
      });
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      await expect(store.recordRound('bug-squash', 520, { squashed: 520 })).resolves.toBeDefined();
    });

    it('still rejects on failure, without throwing while emitting a toast', async () => {
      const { client } = makeFakeClient({
        purchaseItem: { data: null, error: { message: 'insufficient_tokens' } },
      });
      const store = createSupabaseProgressStore({ client, playerId: PLAYER_ID });

      await expect(store.purchase('desk')).rejects.toMatchObject({ code: 'insufficient_tokens' });
    });
  });
});
