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
  type BadgeCheckResult,
  type BadgeDefinition,
  type CompleteQuestResult,
  type QuestProgress,
  type IglooSlot,
  type LeaderboardEntry,
  type Placement,
  type ProgressSnapshot,
  type ProgressStore,
  type PurchaseResult,
  type RoundResult,
  type StairClimbProgress,
  type StairFlightResult,
} from '../progress-store';
import type { ProgressStoreHarness } from './progress-store.contract';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(currentDir, '../../..');

export function readSqlFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

/** Every migration, in timestamp order, keyed by the name `createPgliteDb` takes. */
export const MIGRATIONS = [
  ['players', '20260924000000_players.sql'],
  ['saved-progress', '20260924010000_saved_progress.sql'],
  ['leaderboard', '20260924020000_leaderboard.sql'],
  ['quests', '20260925000000_quests.sql'],
  ['badges', '20260927000000_badges.sql'],
  ['igloo-wall-slots', '20260927010000_igloo_wall_slots.sql'],
  ['beystadium', '20260928000000_beystadium.sql'],
  ['phishing-quiz', '20260928020000_phishing_quiz.sql'],
  ['stair-climb', '20260929000000_stair_climb.sql'],
] as const;

export type MigrationName = (typeof MIGRATIONS)[number][0];

/** The SQL of one migration file, by its `MIGRATIONS` name. */
export function migrationSql(name: MigrationName): string {
  const file = MIGRATIONS.find(([migration]) => migration === name)![1];
  return readSqlFile('supabase', 'migrations', file);
}

/**
 * A fresh PGlite database with the local Supabase stub and every migration up
 * to and including `through` (default: all of them). The caller closes it.
 */
export async function createPgliteDb(
  options: { through?: MigrationName } = {},
): Promise<PGliteInterface> {
  const db = new PGlite();
  await db.exec(readSqlFile('supabase', 'tests', 'local-supabase-stub.sql'));
  for (const [name] of MIGRATIONS) {
    await db.exec(migrationSql(name));
    if (name === options.through) break;
  }
  return db;
}

let sharedDb: PGliteInterface | null = null;

/** One PGlite database per test file, migrated once and reused by every harness in it. */
async function getSharedDb(): Promise<PGliteInterface> {
  if (sharedDb) {
    return sharedDb;
  }
  sharedDb = await createPgliteDb();
  return sharedDb;
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
        placement: Placement;
      }>(
        'select id, stall, name, price, art_key, placement from public.shop_items order by price, id',
      );
      const badgeCatalogRes = await tx.query<{
        id: string;
        name: string;
        how_to_earn: string;
        sort_order: number;
        available: boolean;
      }>(
        'select id, name, how_to_earn, sort_order, available from public.badges order by sort_order, id',
      );

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
          placement: row.placement,
        })),
        badgeCatalog: badgeCatalogRes.rows.map((row): BadgeDefinition => ({
          id: row.id,
          name: row.name,
          howToEarn: row.how_to_earn,
          sortOrder: row.sort_order,
          available: row.available,
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

  async function leaderboard(
    minigameId: MinigameId,
    maxRows?: number,
  ): Promise<LeaderboardEntry[]> {
    return runAsPlayer(async (tx) => {
      const res =
        maxRows === undefined
          ? await tx.query<LeaderboardRow>('select * from public.leaderboard($1)', [minigameId])
          : await tx.query<LeaderboardRow>('select * from public.leaderboard($1, $2)', [
              minigameId,
              maxRows,
            ]);
      return res.rows.map((row) => ({
        rank: row.rank,
        penguinName: row.penguin_name,
        bestScore: row.best_score,
        isMe: row.is_me,
      }));
    });
  }

  // #46: straight calls to the quests migration's functions, as the
  // Supabase store makes them through PostgREST's `rpc()`.
  async function questProgress(): Promise<QuestProgress> {
    return runAsPlayer(async (tx) => {
      const res = await tx.query<{ result: QuestProgress }>(
        'select public.quest_progress() as result',
      );
      return res.rows[0].result;
    });
  }

  async function markDevPitVisited(): Promise<void> {
    await runAsPlayer((tx) => tx.query('select public.mark_dev_pit_visited()'));
  }

  async function completeQuest(questId: string): Promise<CompleteQuestResult> {
    return runAsPlayer(async (tx) => {
      const res = await tx.query<{ result: CompleteQuestResult }>(
        'select public.complete_quest($1) as result',
        [questId],
      );
      return res.rows[0].result;
    });
  }

  // #138: the Session Badge check, as the Supabase store calls it through rpc().
  async function checkBadges(): Promise<BadgeCheckResult> {
    return runAsPlayer(async (tx) => {
      const res = await tx.query<{ result: BadgeCheckResult }>(
        'select public.check_session_badges() as result',
      );
      return res.rows[0].result;
    });
  }

  // #51 slice 4: the Stairs Challenge RPCs, as the Supabase store calls them.
  async function logStairFlight(floor: number): Promise<StairFlightResult> {
    return runAsPlayer(async (tx) => {
      const res = await tx.query<{ result: StairFlightResult }>(
        'select public.log_stair_flight($1) as result',
        [floor],
      );
      return res.rows[0].result;
    });
  }

  async function getStairClimb(): Promise<StairClimbProgress> {
    return runAsPlayer(async (tx) => {
      const res = await tx.query<{ result: StairClimbProgress }>(
        'select public.stair_climb_progress() as result',
      );
      return res.rows[0].result;
    });
  }

  return {
    loadAll,
    saveLook,
    recordRound,
    purchase,
    setSlot,
    leaderboard,
    questProgress,
    markDevPitVisited,
    completeQuest,
    checkBadges,
    logStairFlight,
    getStairClimb,
  };
}

/**
 * A new `ProgressStore` instance for an existing Player on the shared PGlite
 * database, e.g. to prove a write survives a reload in a fresh store (#138).
 */
export async function createPgliteProgressStoreFor(playerId: string): Promise<ProgressStore> {
  return createSqlProgressStore(await getSharedDb(), playerId);
}

/** Builds a fresh Player (a new `auth.users` row) against the shared PGlite database. */
export async function createPgliteProgressStoreHarness(): Promise<
  ProgressStoreHarness & { playerId: string }
> {
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
    playerId,
    store: createSqlProgressStore(db, playerId),
    async grantTokens(tokens: number): Promise<void> {
      await db.query('update public.players set tokens = tokens + $1 where id = $2', [
        tokens,
        playerId,
      ]);
    },
    async holdBadge(badgeId: BadgeId): Promise<void> {
      await db.query('select public.award_badge($1, $2)', [playerId, badgeId]);
    },
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
      // #51 slice 4 (RT2-10): and the climb's last logged flight, for the
      // 2 s pacing rule, the same way.
      await db.query(
        `update public.player_stair_climbs set updated_at = now() - make_interval(secs => $1)
         where player_id = $2`,
        [seconds, playerId],
      );
    },
    async setStairTally(tokensToday: number, tokensDay?: string): Promise<void> {
      await db.query(
        `update public.player_stair_climbs
         set tokens_today = $1, tokens_day = coalesce($2::date, tokens_day)
         where player_id = $3`,
        [tokensToday, tokensDay ?? null, playerId],
      );
    },
  };
}

// ---------------------------------------------------------------------------
// #70 leaderboard fixture: a handful of extra Players with directly-set
// `minigame_bests` rows (bypassing `record_round`, which never lets a
// non-winning round overwrite `updated_at`), plus an `anon`-role runner for
// A1b's denial check. Test-only; only `sql-leaderboard.test.ts` imports this.
// ---------------------------------------------------------------------------

/** One row of `public.leaderboard`'s result, as PGlite returns it. */
export interface LeaderboardRow {
  rank: number;
  penguin_name: string;
  best_score: number;
  is_me: boolean;
}

export interface PgliteLeaderboardFixture {
  /** A fresh Player (a new `auth.users` + `players` row) named `penguinName`
   *  (written directly, bypassing `saveLook`'s client-side validation, so a
   *  test can give it a name `validateLook` would itself reject -- e.g. one
   *  made only of invisible characters). Returns the new Player's id. */
  addPlayer(penguinName: string): Promise<string>;
  /** Directly upserts `playerId`'s `minigame_bests` row for `minigameId`,
   *  with `updated_at` set to `secondsAgo` seconds before the database's own
   *  `now()` -- deterministic, real-clock-independent control over D2's
   *  tie-break, the same way `advanceSeconds` controls the round interval
   *  above. */
  setBestReachedAt(
    playerId: string,
    minigameId: MinigameId,
    bestScore: number,
    secondsAgo: number,
  ): Promise<void>;
  /** Calls `public.leaderboard(minigameId, maxRows)` as `playerId` (signed
   *  in, `role = authenticated`). Omitting `maxRows` exercises the SQL
   *  function's own default. */
  leaderboardAs(
    playerId: string,
    minigameId: MinigameId,
    maxRows?: number | null,
  ): Promise<LeaderboardRow[]>;
  /** Runs `sql` as `anon` (no `sub` claim at all), for A1b: `public.leaderboard`
   *  is revoked from `anon`, so this is expected to reject with `42501`. */
  asAnon<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** The current highest `best_score` under `minigameId` (0 if none), so a
   *  test can seed scores relative to it (`max + N`) and stay above whatever
   *  earlier tests in this shared database already wrote for that id --
   *  the same "live-data-tolerant" technique R3's hosted proof uses. */
  maxBestScore(minigameId: MinigameId): Promise<number>;
  /** Calls `public.record_round` as `playerId`, for A1: seeding a
   *  leaderboard test's bests through the real payout/best-tracking
   *  function, not by writing `minigame_bests` directly. */
  recordRoundAs(
    playerId: string,
    minigameId: MinigameId,
    score: number,
    stats: Record<string, number>,
  ): Promise<void>;
  /** Re-applies the leaderboard migration file, for A1e (must rerun cleanly). */
  rerunMigration(): Promise<void>;
  /** Runs a single parameterized `sql` statement as the unrestricted
   *  (postgres) role -- for A2's `pg_proc`/`has_function_privilege`
   *  introspection, which isn't a signed-in Player's own query. */
  runSql<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Runs `sql` (one or more `;`-separated statements, e.g. a whole proof
   *  file: a function definition followed by a `select` from it) as the
   *  unrestricted (postgres) role, returning one `Results` per statement --
   *  for A1f, whose interesting rows are the final `select`'s. */
  execSql<T>(sql: string): Promise<Array<{ rows: T[] }>>;
  /** Runs a single parameterized `sql` statement as `playerId` (signed in,
   *  `role = authenticated`), with no client-side `where player_id = ...`
   *  of its own -- unlike every `ProgressStore` query, which always filters
   *  by the caller's own id regardless of RLS and so can never actually
   *  prove RLS is doing anything. For A1e: a bare `select count(*) from
   *  public.minigame_bests where player_id <> $1` run this way only reads 0
   *  rows because RLS itself narrows the table, not because the query asked
   *  it to. */
  runSqlAs<T>(playerId: string, sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export async function createPgliteLeaderboardFixture(): Promise<PgliteLeaderboardFixture> {
  const db = await getSharedDb();

  async function addPlayer(penguinName: string): Promise<string> {
    const playerId = randomUUID();
    await db.query('insert into auth.users (id) values ($1)', [playerId]);
    await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [playerId]);
      await tx.query('set local role authenticated');
      await tx.query('insert into public.players (id) values ($1) on conflict (id) do nothing', [
        playerId,
      ]);
    });
    // Written directly as the unrestricted (postgres) role: some fixture
    // names (invisible-only) would themselves be rejected by
    // `validateLook`/the client-side check every real save path enforces,
    // even though #27's own `players_penguin_name_check` (leading/trailing
    // *ASCII* whitespace only) allows them through -- which is exactly R1's
    // point.
    await db.query('update public.players set penguin_name = $1 where id = $2', [
      penguinName,
      playerId,
    ]);
    return playerId;
  }

  async function setBestReachedAt(
    playerId: string,
    minigameId: MinigameId,
    bestScore: number,
    secondsAgo: number,
  ): Promise<void> {
    await db.query(
      `insert into public.minigame_bests (player_id, minigame_id, best_score, updated_at)
       values ($1, $2, $3, now() - make_interval(secs => $4))
       on conflict (player_id, minigame_id) do update
         set best_score = excluded.best_score, updated_at = excluded.updated_at`,
      [playerId, minigameId, bestScore, secondsAgo],
    );
  }

  async function leaderboardAs(
    playerId: string,
    minigameId: MinigameId,
    maxRows?: number | null,
  ): Promise<LeaderboardRow[]> {
    return db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [playerId]);
      await tx.query('set local role authenticated');
      const res =
        maxRows === undefined
          ? await tx.query<LeaderboardRow>('select * from public.leaderboard($1)', [minigameId])
          : await tx.query<LeaderboardRow>('select * from public.leaderboard($1, $2)', [
              minigameId,
              maxRows,
            ]);
      return res.rows;
    });
  }

  async function asAnon<T>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    return db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', '', true)");
      await tx.query('set local role anon');
      return tx.query<T>(sql, params);
    });
  }

  async function maxBestScore(minigameId: MinigameId): Promise<number> {
    const res = await db.query<{ max: number | null }>(
      'select max(best_score) as max from public.minigame_bests where minigame_id = $1',
      [minigameId],
    );
    return res.rows[0]?.max ?? 0;
  }

  async function recordRoundAs(
    playerId: string,
    minigameId: MinigameId,
    score: number,
    stats: Record<string, number>,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [playerId]);
      await tx.query('set local role authenticated');
      await tx.query('select public.record_round($1, $2, $3::jsonb)', [
        minigameId,
        score,
        JSON.stringify(stats),
      ]);
    });
  }

  async function rerunMigration(): Promise<void> {
    await db.exec(readSqlFile('supabase', 'migrations', '20260924020000_leaderboard.sql'));
  }

  async function runSql<T>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    return db.query<T>(sql, params);
  }

  async function execSql<T>(sql: string): Promise<Array<{ rows: T[] }>> {
    const results = await db.exec(sql);
    return results as unknown as Array<{ rows: T[] }>;
  }

  async function runSqlAs<T>(
    playerId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    return db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [playerId]);
      await tx.query('set local role authenticated');
      return tx.query<T>(sql, params);
    });
  }

  return {
    addPlayer,
    setBestReachedAt,
    leaderboardAs,
    asAnon,
    maxBestScore,
    recordRoundAs,
    rerunMigration,
    runSql,
    execSql,
    runSqlAs,
  };
}
