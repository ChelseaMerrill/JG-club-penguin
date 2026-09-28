import { randomUUID } from 'node:crypto';
import { PGlite, type PGliteInterface } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { IGLOO_GEAR_CATALOG } from './minigame-rules';
import { IGLOO_SLOTS, IGLOO_SLOT_PLACEMENT } from './progress-store';
import {
  MIGRATIONS,
  createPgliteLeaderboardFixture,
  readSqlFile,
  type MigrationName,
} from './testing/pglite-progress-store';

// #135: the Igloo wall/ceiling slots migration against a real Postgres
// database (PGlite). The shared contract suite (`sql-progress-store.test.ts`)
// covers store-level placement rules; this file runs the SQL proof the
// reviewer reruns on real Supabase, the data migration for existing Players,
// anon denials, SQL/TypeScript parity, and the merge-order checks with #138.

/** A migration's file name, from the harness's one `MIGRATIONS` list. */
function migrationFile(name: MigrationName): string {
  return MIGRATIONS.find(([migration]) => migration === name)![1];
}

const IGLOO_MIGRATION = migrationFile('igloo-wall-slots');
const BADGES_MIGRATION = migrationFile('badges');

/** #9, #27, #70 and #46: every migration before #138 and #135. */
const BASE_MIGRATIONS = MIGRATIONS.slice(
  0,
  MIGRATIONS.findIndex(([name]) => name === 'badges'),
).map(([, file]) => file);

const openDbs: PGliteInterface[] = [];

afterEach(async () => {
  for (const db of openDbs.splice(0)) await db.close();
});

/** A fresh database with the local Supabase stub and `migrations` applied in order. */
async function freshDb(migrations: readonly string[]): Promise<PGliteInterface> {
  const db = new PGlite();
  openDbs.push(db);
  await db.exec(readSqlFile('supabase', 'tests', 'local-supabase-stub.sql'));
  for (const file of migrations) {
    await db.exec(readSqlFile('supabase', 'migrations', file));
  }
  return db;
}

/** Inserts a Player (auth user + `players` row) as postgres, owning `items`. */
async function addPlayer(db: PGliteInterface, items: readonly string[]): Promise<string> {
  const id = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [id]);
  await db.query('insert into public.players (id) values ($1)', [id]);
  for (const item of items) {
    await db.query('insert into public.player_items (player_id, item_id) values ($1, $2)', [
      id,
      item,
    ]);
  }
  return id;
}

async function place(db: PGliteInterface, playerId: string, slot: number, itemId: string) {
  await db.query('insert into public.igloo_slots (player_id, slot, item_id) values ($1, $2, $3)', [
    playerId,
    slot,
    itemId,
  ]);
}

async function slotsOf(db: PGliteInterface, playerId: string): Promise<Record<number, string>> {
  const res = await db.query<{ slot: number; item_id: string }>(
    'select slot, item_id from public.igloo_slots where player_id = $1 order by slot',
    [playerId],
  );
  return Object.fromEntries(res.rows.map((row) => [row.slot, row.item_id]));
}

async function misplacedCount(db: PGliteInterface): Promise<number> {
  const res = await db.query<{ n: number }>(
    `select count(*)::int as n from public.igloo_slots s
     join public.shop_items i on i.id = s.item_id
     where i.placement <> public.igloo_slot_placement(s.slot)`,
  );
  return res.rows[0].n;
}

/** H2's floor-furniture fingerprint query, read from `supabase/tests/README.md`'s #135 section. */
async function floorFingerprint(db: PGliteInterface): Promise<{ count: number; md5: string }> {
  const readme = readSqlFile('supabase', 'tests', 'README.md').replace(/\r\n/g, '\n');
  const fenced =
    /```sql\n((?: {8}.*\n)*? {8}where item_id not in \('rgb-light-strip','disco-ball'\);)\n {8}```/.exec(
      readme,
    );
  expect(fenced).not.toBeNull();
  const sql = fenced![1]
    .split('\n')
    .map((line) => line.replace(/^ {8}/, ''))
    .join('\n');
  const res = await db.query<{ count: number | bigint; md5: string }>(sql);
  return { count: Number(res.rows[0].count), md5: res.rows[0].md5 };
}

async function asPlayer<T>(
  db: PGliteInterface,
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

describe('igloo wall slots migration (PGlite)', () => {
  it('135_igloo_placement_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const fixturePlayerId = await fixture.addPlayer('PROOF FIXTURE');

    const proofSql = readSqlFile('supabase', 'tests', '135_igloo_placement_proof.sql').replace(
      /00000000-0000-0000-0000-00000000f1f0/g,
      fixturePlayerId,
    );
    const results = await fixture.execSql<{ check_name: string; pass: boolean; detail: string }>(
      proofSql,
    );
    const rows = results.at(-1)!.rows;

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.map((row) => row.check_name)).toContain('unknown_item_gives_23503');
    expect(rows.length).toBeGreaterThan(20);
  });

  it.each([
    ['select * from public.igloo_slots', []],
    ['select * from public.shop_items', []],
    [
      "insert into public.igloo_slots (player_id, slot, item_id) values ($1, 7, 'jg-pennant')",
      [randomUUID()],
    ],
    ['select public.igloo_slot_placement(7::smallint)', []],
  ] as const)('denies anon: %s rejects with 42501', async (sql, params) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql, [...params])).rejects.toMatchObject({ code: '42501' });
  });

  it('rejects a direct mismatched insert or update as the Player with wrong_placement (23514)', async () => {
    const db = await freshDb([...BASE_MIGRATIONS, IGLOO_MIGRATION]);
    const player = await addPlayer(db, ['beanbag', 'jg-pennant']);

    await expect(
      asPlayer(
        db,
        player,
        "insert into public.igloo_slots (player_id, slot, item_id) values ($1, 7, 'beanbag')",
        [player],
      ),
    ).rejects.toMatchObject({ code: '23514', message: 'wrong_placement' });

    await asPlayer(
      db,
      player,
      "insert into public.igloo_slots (player_id, slot, item_id) values ($1, 1, 'beanbag')",
      [player],
    );
    await expect(
      asPlayer(db, player, 'update public.igloo_slots set slot = 7 where player_id = $1', [player]),
    ).rejects.toMatchObject({ code: '23514', message: 'wrong_placement' });
    expect(await slotsOf(db, player)).toEqual({ 1: 'beanbag' });
  });

  it('agrees with the client: igloo_slot_placement matches IGLOO_SLOT_PLACEMENT, and the catalog matches IGLOO_GEAR_CATALOG', async () => {
    const db = await freshDb([...BASE_MIGRATIONS, IGLOO_MIGRATION]);

    const map = await db.query<{ slot: number; placement: string | null }>(
      'select n as slot, public.igloo_slot_placement(n::smallint) as placement from generate_series(0, 12) as n',
    );
    for (const row of map.rows) {
      const expected = IGLOO_SLOTS.includes(row.slot as never)
        ? IGLOO_SLOT_PLACEMENT[row.slot as keyof typeof IGLOO_SLOT_PLACEMENT]
        : null;
      expect(row.placement, `slot ${row.slot}`).toBe(expected);
    }

    const catalog = await db.query<{
      id: string;
      stall: string;
      name: string;
      price: number;
      art_key: string;
      placement: string;
    }>(
      'select id, stall, name, price, art_key, placement from public.shop_items order by price, id',
    );
    expect(
      catalog.rows.map((row) => ({
        id: row.id,
        stall: row.stall,
        name: row.name,
        price: row.price,
        artKey: row.art_key,
        placement: row.placement,
      })),
    ).toEqual([...IGLOO_GEAR_CATALOG]);
  });

  it('moves existing floor-placed RGB Light Strips and Disco Balls to matching slots, leaving floor furniture alone', async () => {
    const db = await freshDb(BASE_MIGRATIONS);
    const a = await addPlayer(db, ['beanbag', 'rgb-light-strip', 'disco-ball', 'desk']);
    await place(db, a, 1, 'beanbag');
    await place(db, a, 2, 'rgb-light-strip');
    await place(db, a, 5, 'disco-ball');
    await place(db, a, 6, 'desk');
    // Owned but never placed: stays unplaced.
    const unplacedOwner = await addPlayer(db, ['rgb-light-strip']);
    const floorOnly = await addPlayer(db, ['speakers', 'arcade-cabinet']);
    await place(db, floorOnly, 3, 'speakers');
    await place(db, floorOnly, 4, 'arcade-cabinet');
    const fingerprintBefore = await floorFingerprint(db);

    await db.exec(readSqlFile('supabase', 'migrations', IGLOO_MIGRATION));

    // H2's floor-furniture fingerprint, run exactly as the README gives it.
    expect(fingerprintBefore.count).toBe(4);
    expect(await floorFingerprint(db)).toEqual(fingerprintBefore);

    expect(await slotsOf(db, a)).toEqual({
      1: 'beanbag',
      6: 'desk',
      7: 'rgb-light-strip',
      11: 'disco-ball',
    });
    expect(await slotsOf(db, unplacedOwner)).toEqual({});
    expect(await misplacedCount(db)).toBe(0);
    const owned = await db.query<{ n: number }>(
      'select count(*)::int as n from public.player_items where player_id = $1',
      [a],
    );
    expect(owned.rows[0].n).toBe(4);

    // Rerunning #27's migration afterwards keeps the placements (its catalog
    // upsert only touches stall, name, price and art_key).
    await db.exec(readSqlFile('supabase', 'migrations', '20260924010000_saved_progress.sql'));
    const disco = await db.query<{ placement: string }>(
      "select placement from public.shop_items where id = 'disco-ball'",
    );
    expect(disco.rows[0].placement).toBe('ceiling');
  });

  it('unplaces a misplaced item that has no free matching slot, keeps it owned, re-enables the guard, and a further rerun changes nothing', async () => {
    const db = await freshDb([...BASE_MIGRATIONS, IGLOO_MIGRATION]);
    // Fixture B can only exist with the guard off: every wall slot full and
    // an RGB Light Strip on the floor.
    await db.exec('alter table public.igloo_slots disable trigger igloo_slots_placement_guard');
    const b = await addPlayer(db, [
      'rgb-light-strip',
      'jg-pennant',
      'framed-team-photo',
      'ship-it-sign',
      'dartboard',
    ]);
    await place(db, b, 7, 'jg-pennant');
    await place(db, b, 8, 'framed-team-photo');
    await place(db, b, 9, 'ship-it-sign');
    await place(db, b, 10, 'dartboard');
    await place(db, b, 3, 'rgb-light-strip');

    await db.exec(readSqlFile('supabase', 'migrations', IGLOO_MIGRATION));

    expect(await slotsOf(db, b)).toEqual({
      7: 'jg-pennant',
      8: 'framed-team-photo',
      9: 'ship-it-sign',
      10: 'dartboard',
    });
    const stillOwned = await db.query<{ n: number }>(
      "select count(*)::int as n from public.player_items where player_id = $1 and item_id = 'rgb-light-strip'",
      [b],
    );
    expect(stillOwned.rows[0].n).toBe(1);
    expect(await misplacedCount(db)).toBe(0);
    const guard = await db.query<{ tgenabled: string }>(
      "select tgenabled from pg_trigger where tgname = 'igloo_slots_placement_guard'",
    );
    expect(guard.rows).toEqual([{ tgenabled: 'O' }]);

    const snapshot = async () =>
      JSON.stringify([
        (await db.query('select * from public.igloo_slots order by player_id, slot')).rows,
        (
          await db.query(
            'select player_id, item_id from public.player_items order by player_id, item_id',
          )
        ).rows,
        (await db.query('select * from public.shop_items order by id')).rows,
      ]);
    const before = await snapshot();
    await db.exec(readSqlFile('supabase', 'migrations', IGLOO_MIGRATION));
    expect(await snapshot()).toBe(before);
  });

  it('reruns cleanly on the shared database', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(
      fixture.execSql(readSqlFile('supabase', 'migrations', IGLOO_MIGRATION)),
    ).resolves.toBeDefined();
  });
});

// #135 D6(d): #138 (badges, Interior Penguin) and #135 must work in either
// apply order. #138 merged first, so this block always runs.
describe('igloo wall slots with #138 badges, both orders (PGlite)', () => {
  const FLOOR = ['beanbag', 'desk', 'speakers', 'dual-monitors'];

  async function interiorPenguin(db: PGliteInterface, playerId: string) {
    const badges = await db.query<{ n: number }>(
      "select count(*)::int as n from public.player_badges where player_id = $1 and badge_id = 'interior-penguin'",
      [playerId],
    );
    const tokens = await db.query<{ tokens: number }>(
      'select tokens from public.players where id = $1',
      [playerId],
    );
    return { held: badges.rows[0].n, tokens: tokens.rows[0].tokens };
  }

  it('#138 first, then #135: the data migration runs with the Interior Penguin trigger live and the badge is paid once', async () => {
    const db = await freshDb([...BASE_MIGRATIONS, BADGES_MIGRATION]);
    const p = await addPlayer(db, [...FLOOR, 'rgb-light-strip', 'disco-ball']);
    const start = (await interiorPenguin(db, p)).tokens;
    for (const [i, item] of FLOOR.entries()) await place(db, p, i + 1, item);
    await place(db, p, 5, 'rgb-light-strip');
    await place(db, p, 6, 'disco-ball');
    expect(await interiorPenguin(db, p)).toEqual({ held: 1, tokens: start + 50 });

    await db.exec(readSqlFile('supabase', 'migrations', IGLOO_MIGRATION));

    expect(await slotsOf(db, p)).toMatchObject({ 7: 'rgb-light-strip', 11: 'disco-ball' });
    expect(await interiorPenguin(db, p)).toEqual({ held: 1, tokens: start + 50 });
    await expect(
      asPlayer(db, p, 'update public.igloo_slots set slot = 8 where player_id = $1 and slot = 1', [
        p,
      ]),
    ).rejects.toMatchObject({ message: 'wrong_placement' });
    expect(await interiorPenguin(db, p)).toEqual({ held: 1, tokens: start + 50 });
  });

  it('#135 first, then #138: the backfill and the trigger count wall and ceiling slots, paying once', async () => {
    const db = await freshDb([...BASE_MIGRATIONS, IGLOO_MIGRATION]);
    const p1 = await addPlayer(db, [...FLOOR, 'jg-pennant', 'disco-ball']);
    for (const [i, item] of FLOOR.entries()) await place(db, p1, i + 1, item);
    await place(db, p1, 7, 'jg-pennant');
    await place(db, p1, 11, 'disco-ball');
    const p1Start = (await interiorPenguin(db, p1)).tokens;

    await db.exec(readSqlFile('supabase', 'migrations', BADGES_MIGRATION));
    expect(await interiorPenguin(db, p1)).toEqual({ held: 1, tokens: p1Start + 50 });

    const p2 = await addPlayer(db, [...FLOOR, 'arcade-cabinet', 'jg-pennant']);
    const p2Start = (await interiorPenguin(db, p2)).tokens;
    for (const [i, item] of [...FLOOR, 'arcade-cabinet'].entries()) {
      await asPlayer(
        db,
        p2,
        'insert into public.igloo_slots (player_id, slot, item_id) values ($1, $2, $3)',
        [p2, i + 1, item],
      );
    }
    expect((await interiorPenguin(db, p2)).held).toBe(0);
    await asPlayer(
      db,
      p2,
      "insert into public.igloo_slots (player_id, slot, item_id) values ($1, 8, 'jg-pennant')",
      [p2],
    );
    expect(await interiorPenguin(db, p2)).toEqual({ held: 1, tokens: p2Start + 50 });

    await db.exec(readSqlFile('supabase', 'migrations', BADGES_MIGRATION));
    expect(await interiorPenguin(db, p1)).toEqual({ held: 1, tokens: p1Start + 50 });
    expect(await interiorPenguin(db, p2)).toEqual({ held: 1, tokens: p2Start + 50 });
  });
});
