/// <reference types="node" />
// Test-only: builds a real Postgres database (PGlite, in-process WASM) from
// #9's `players` and #27's `saved_progress` migrations, on top of
// `supabase/tests/local-supabase-stub.sql`'s stand-in for `auth.users` /
// `auth.uid()`, Supabase's default privileges and the `anon` /
// `authenticated` roles. `describeProgressStoreContract` runs unmodified
// against the `ProgressStore` this file builds, so the same contract suite
// exercises both the in-memory fake and the rules the real Supabase project
// will enforce. Only `sql-progress-store.test.ts` imports this file.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type PGliteInterface, type Transaction } from '@electric-sql/pglite';
import { afterAll } from 'vitest';
import type { BadgeId, MinigameId, MinigameStatsMap } from '../../contracts/game-events';
import type { Eyes, Hat, IdleEmote, Pattern, PenguinLook } from '../../contracts/penguin';
import {
  ProgressStoreError,
  emptySlots,
  isProgressErrorCode,
  type IglooSlot,
  type ProgressSnapshot,
  type ProgressStore,
  type PurchaseResult,
  type RoundResult,
} from '../progress-store';
import type { ProgressStoreHarness } from './progress-store.contract';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(currentDir, '../../..');

function readSqlFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

let sharedDb: PGliteInterface | null = null;

/** One PGlite database per test file, migrated once and reused by every harness in it. */
async function getSharedDb(): Promise<PGliteInterface> {
  if (sharedDb) {
    return sharedDb;
  }
  const db = new PGlite();
  await db.exec(readSqlFile('supabase', 'tests', 'local-supabase-stub.sql'));
  await db.exec(readSqlFile('supabase', 'migrations', '20260924000000_players.sql'));
  await db.exec(readSqlFile('supabase', 'migrations', '20260924010000_saved_progress.sql'));
  sharedDb = db;
  return db;
}

afterAll(async () => {
  await sharedDb?.close();
  sharedDb = null;
});

interface PostgresError {
  message?: string;
  code?: string;
  table?: string;
}

/**
 * Maps a raw PGlite/Postgres error to the `ProgressStoreError` #27's
 * functions and constraints intend: a raised message that is already a
 * known code is that code; `22P02` (a value that can't parse as its
 * column's type, e.g. a non-integer `score`) means `invalid_score`; a
 * `23503` (foreign key) on `igloo_slots` means the item isn't owned; a
 * `23514` (check) on `igloo_slots` means the slot number is out of range;
 * a `23514` on `players` means the look is invalid. Anything else is
 * rethrown as-is.
 */
function toProgressError(err: unknown): unknown {
  const pgErr = err as PostgresError;
  const message = pgErr?.message;
  if (message !== undefined && isProgressErrorCode(message)) {
    return new ProgressStoreError(message);
  }
  if (pgErr?.code === '22P02') {
    return new ProgressStoreError('invalid_score');
  }
  if (pgErr?.code === '23503' && pgErr.table === 'igloo_slots') {
    return new ProgressStoreError('not_owned');
  }
  if (pgErr?.code === '23514' && pgErr.table === 'igloo_slots') {
    return new ProgressStoreError('invalid_slot');
  }
  if (pgErr?.code === '23514' && pgErr.table === 'players') {
    return new ProgressStoreError('invalid_look');
  }
  return err;
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
  profile_created_at: Date | null;
}

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

/** A `ProgressStore` backed by a real Postgres database, for one Player. Test-only. */
function createSqlProgressStore(db: PGliteInterface, playerId: string): ProgressStore {
  async function runAsPlayer<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    try {
      return await db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [playerId]);
        await tx.query('set local role authenticated');
        return fn(tx);
      });
    } catch (err) {
      throw toProgressError(err);
    }
  }

  async function loadAll(): Promise<ProgressSnapshot> {
    return runAsPlayer(async (tx) => {
      const playerRes = await tx.query<PlayerRow>(
        `select penguin_name, penguin_color, cap, beak, feet, belly, hat, pattern, eyes,
                idle_emote, tokens, profile_created_at
         from public.players where id = $1`,
        [playerId],
      );
      const player = playerRes.rows[0];
      if (!player) {
        throw new ProgressStoreError('no_player');
      }

      const badgesRes = await tx.query<{ badge_id: BadgeId }>(
        `select badge_id from public.player_badges where player_id = $1
         order by earned_at, badge_id`,
        [playerId],
      );
      const bestsRes = await tx.query<{ minigame_id: MinigameId; best_score: number }>(
        'select minigame_id, best_score from public.minigame_bests where player_id = $1',
        [playerId],
      );
      const itemsRes = await tx.query<{ item_id: string }>(
        `select item_id from public.player_items where player_id = $1
         order by acquired_at, item_id`,
        [playerId],
      );
      const slotsRes = await tx.query<{ slot: number; item_id: string }>(
        'select slot, item_id from public.igloo_slots where player_id = $1',
        [playerId],
      );
      const catalogRes = await tx.query<{
        id: string;
        stall: string;
        name: string;
        price: number;
        art_key: string;
      }>('select id, stall, name, price, art_key from public.shop_items order by price, id');

      const slots: Record<IglooSlot, string | null> = emptySlots();
      for (const row of slotsRes.rows) {
        slots[row.slot as IglooSlot] = row.item_id;
      }

      return {
        look: toLook(player),
        profileCreatedAt: player.profile_created_at
          ? player.profile_created_at.toISOString()
          : null,
        tokens: player.tokens,
        badges: badgesRes.rows.map((row) => row.badge_id),
        bests: Object.fromEntries(
          bestsRes.rows.map((row) => [row.minigame_id, row.best_score]),
        ) as Partial<Record<MinigameId, number>>,
        ownedItems: itemsRes.rows.map((row) => row.item_id),
        slots,
        catalog: catalogRes.rows.map((row) => ({
          id: row.id,
          stall: row.stall,
          name: row.name,
          price: row.price,
          artKey: row.art_key,
        })),
      };
    });
  }

  async function saveLook(look: PenguinLook): Promise<void> {
    await runAsPlayer((tx) =>
      tx.query(
        `update public.players set
           penguin_name = $1, penguin_color = $2, cap = $3, beak = $4, feet = $5, belly = $6,
           hat = $7, pattern = $8, eyes = $9, idle_emote = $10,
           profile_created_at = coalesce(profile_created_at, now())
         where id = $11`,
        [
          look.name,
          look.body,
          look.cap,
          look.beak,
          look.feet,
          look.belly,
          look.hat,
          look.pattern,
          look.eyes,
          look.emote,
          playerId,
        ],
      ),
    );
  }

  async function recordRound<K extends MinigameId>(
    minigameId: K,
    score: number,
    stats: MinigameStatsMap[K],
  ): Promise<RoundResult> {
    return runAsPlayer(async (tx) => {
      const res = await tx.query<{ result: RoundResult }>(
        'select public.record_round($1, $2, $3::jsonb) as result',
        [minigameId, score, JSON.stringify(stats)],
      );
      return res.rows[0].result;
    });
  }

  async function purchase(itemId: string): Promise<PurchaseResult> {
    return runAsPlayer(async (tx) => {
      const res = await tx.query<{ result: PurchaseResult }>(
        'select public.purchase_item($1) as result',
        [itemId],
      );
      return res.rows[0].result;
    });
  }

  async function setSlot(slot: IglooSlot, itemId: string | null): Promise<void> {
    await runAsPlayer(async (tx) => {
      if (itemId === null) {
        await tx.query('delete from public.igloo_slots where player_id = $1 and slot = $2', [
          playerId,
          slot,
        ]);
        return;
      }
      // Moving an owned item: drop it from wherever it currently sits, then
      // place it in the requested slot. The upsert mirrors the statement
      // PostgREST issues for `igloo_slots`, setting every column its
      // payload includes; the SQL check constraint (not a client-side
      // pre-check) is what turns an out-of-range slot into `23514`.
      await tx.query('delete from public.igloo_slots where player_id = $1 and item_id = $2', [
        playerId,
        itemId,
      ]);
      await tx.query(
        `insert into public.igloo_slots (player_id, slot, item_id) values ($1, $2, $3)
         on conflict (player_id, slot) do update
           set player_id = excluded.player_id, slot = excluded.slot, item_id = excluded.item_id`,
        [playerId, slot, itemId],
      );
    });
  }

  return { loadAll, saveLook, recordRound, purchase, setSlot };
}

/** Builds a fresh Player (a new `auth.users` row) against the shared PGlite database. */
export async function createPgliteProgressStoreHarness(): Promise<ProgressStoreHarness> {
  const db = await getSharedDb();
  const playerId = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [playerId]);

  // First sign-in creates the Player row, run as the Player themselves.
  await db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [playerId]);
    await tx.query('set local role authenticated');
    await tx.query('insert into public.players (id) values ($1) on conflict (id) do nothing', [
      playerId,
    ]);
  });

  return {
    store: createSqlProgressStore(db, playerId),
    async advanceSeconds(seconds: number): Promise<void> {
      // Backdates relative to the database's own `now()` rather than each
      // row's stored `finished_at`, so a boundary test's margin depends only
      // on this single query's own round trip and not on how long earlier
      // steps took: "interval minus 1 second" stays reliably below the
      // interval, and "at the interval" is always at or above it, since
      // real time can only move forward between this call and the next.
      await db.query(
        `update public.minigame_rounds set finished_at = now() - make_interval(secs => $1)
         where player_id = $2`,
        [seconds, playerId],
      );
    },
  };
}
