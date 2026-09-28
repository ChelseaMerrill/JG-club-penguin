import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGliteInterface } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../contracts/penguin';
import type { IglooSlot, ShopItem } from './progress-store';
import {
  createPgliteDb,
  createPgliteLeaderboardFixture,
  createPgliteProgressStoreFor,
  createPgliteProgressStoreHarness,
  migrationSql,
} from './testing/pglite-progress-store';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

/** The five internal functions no client role may execute (#138 D4-D6). */
const INTERNAL_FUNCTION_CALLS: Array<[name: string, sql: string, params: unknown[]]> = [
  ['award_badge', 'select public.award_badge($1, $2)', [randomUUID(), 'ship-it']],
  [
    'award_badge_if_available',
    'select public.award_badge_if_available($1, $2)',
    [randomUUID(), 'ship-it'],
  ],
  ['evaluate_session_badges', 'select public.evaluate_session_badges($1, now())', [randomUUID()]],
  ['is_night_owl_time', 'select public.is_night_owl_time(now())', []],
  ['igloo_slots_award_interior_penguin', 'select public.igloo_slots_award_interior_penguin()', []],
];

// Databases this file builds on its own (the backfill and rerun tests), closed
// after each test. The shared database is closed by the harness itself.
const ownDbs: PGliteInterface[] = [];
afterEach(async () => {
  while (ownDbs.length > 0) await ownDbs.pop()!.close();
});

async function ownDb(options: Parameters<typeof createPgliteDb>[0] = {}): Promise<PGliteInterface> {
  const db = await createPgliteDb(options);
  ownDbs.push(db);
  return db;
}

async function addPlayer(
  db: PGliteInterface,
  fields: { named?: boolean; tokens?: number } = {},
): Promise<string> {
  const id = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [id]);
  await db.query('insert into public.players (id, tokens) values ($1, $2)', [
    id,
    fields.tokens ?? 100,
  ]);
  if (fields.named) {
    await db.query(
      "update public.players set penguin_name = 'Pip', profile_created_at = now() where id = $1",
      [id],
    );
  }
  return id;
}

async function badgesOf(db: PGliteInterface, playerId: string): Promise<string[]> {
  const res = await db.query<{ badge_id: string }>(
    'select badge_id from public.player_badges where player_id = $1 order by badge_id',
    [playerId],
  );
  return res.rows.map((row) => row.badge_id);
}

async function tokensOf(db: PGliteInterface, playerId: string): Promise<number> {
  const res = await db.query<{ tokens: number }>(
    'select tokens from public.players where id = $1',
    [playerId],
  );
  return res.rows[0].tokens;
}

/** Owns `items` and places them in slots 1.. in order, as postgres (a fixture, not a client write). */
async function placeItems(db: PGliteInterface, playerId: string, items: string[]): Promise<void> {
  for (const [index, itemId] of items.entries()) {
    await db.query('insert into public.player_items (player_id, item_id) values ($1, $2)', [
      playerId,
      itemId,
    ]);
    await db.query(
      'insert into public.igloo_slots (player_id, slot, item_id) values ($1, $2, $3)',
      [playerId, index + 1, itemId],
    );
  }
}

const SIX_ITEMS = [
  'beanbag',
  'desk',
  'speakers',
  'dual-monitors',
  'arcade-cabinet',
  'rgb-light-strip',
];

/**
 * The slot the RGB Light Strip fits: slot 6 while the catalog has no
 * placement (before #135), slot 7 once #135 makes it a wall item. The raw
 * `placeItems` fixtures above run before #135's migration, so they keep it in
 * slot 6; a client write after #135 must use a wall slot.
 */
function rgbLightStripSlot(catalog: readonly ShopItem[]): IglooSlot {
  const rgb = catalog.find((item) => item.id === 'rgb-light-strip') as
    (ShopItem & { placement?: string }) | undefined;
  return (rgb?.placement === 'wall' ? 7 : 6) as IglooSlot;
}

// #138: the badges migration against a real Postgres database (PGlite). The
// shared contract suite (`sql-progress-store.test.ts`) covers the store-level
// behaviour; this file runs the SQL proof the reviewer re-runs on real
// Supabase, plus the checks only a raw connection can make: fixed-time Night
// Owl, the anon denials, the backfill and the rerun chain.
describe('badges migration (PGlite)', () => {
  it('138_badges_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const fixturePlayerId = await fixture.addPlayer('PROOF FIXTURE');

    const proofSql = readRepoFile('supabase', 'tests', '138_badges_proof.sql').replace(
      /00000000-0000-0000-0000-00000000f1f0/g,
      fixturePlayerId,
    );
    const results = await fixture.execSql<{ check_name: string; pass: boolean; detail: string }>(
      proofSql,
    );
    const rows = results.at(-1)!.rows;

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.length).toBeGreaterThan(25);
  });

  it.each([
    ['select from public.badges', 'select count(*) from public.badges', []],
    ['check_session_badges', 'select public.check_session_badges()', []],
    ...INTERNAL_FUNCTION_CALLS,
  ] as Array<[string, string, unknown[]]>)(
    'denies anon: %s rejects with 42501',
    async (_name, sql, params) => {
      const fixture = await createPgliteLeaderboardFixture();

      await expect(fixture.asAnon(sql, params)).rejects.toMatchObject({ code: '42501' });
    },
  );

  it.each(INTERNAL_FUNCTION_CALLS)(
    'denies a signed-in Player: %s rejects with 42501',
    async (_name, sql, params) => {
      const fixture = await createPgliteLeaderboardFixture();
      const playerId = await fixture.addPlayer('Caller');

      await expect(fixture.runSqlAs(playerId, sql, params)).rejects.toMatchObject({
        code: '42501',
      });
    },
  );

  describe('Night Owl with a fixed server time', () => {
    it.each([
      ['2026-09-27T06:30:00Z', '02:30 EDT', true],
      ['2026-01-15T07:30:00Z', '02:30 EST', true],
      ['2026-09-27T06:00:00Z', '02:00:00 EDT, the window opens', true],
      ['2026-09-27T08:59:59Z', '04:59:59 EDT', true],
      ['2026-09-27T09:00:00Z', '05:00 EDT, the window has closed', false],
      ['2026-09-27T05:59:00Z', '01:59 EDT', false],
      ['2026-03-08T06:59:00Z', '01:59 EST, just before the DST jump', false],
      ['2026-03-08T07:00:00Z', '03:00 EDT, just after the DST jump', true],
    ])('%s (%s): Night Owl awarded is %s', async (instant, _label, inWindow) => {
      const fixture = await createPgliteLeaderboardFixture();
      const playerId = await fixture.addPlayer('Owl');
      await fixture.runSql('update public.players set profile_created_at = now() where id = $1', [
        playerId,
      ]);

      const res = await fixture.runSql<{ awarded: string[] }>(
        'select public.evaluate_session_badges($1, $2::timestamptz) as awarded',
        [playerId, instant],
      );

      expect(res.rows[0].awarded.includes('night-owl')).toBe(inWindow);
    });

    it('awards Night Owl and its +50 once, and it survives a reload in a new store', async () => {
      const harness = await createPgliteProgressStoreHarness();
      await harness.store.saveLook({ ...DEFAULT_LOOK, name: 'Owl' });
      const fixture = await createPgliteLeaderboardFixture();
      const before = (await harness.store.loadAll()).tokens;

      const first = await fixture.runSql<{ awarded: string[] }>(
        "select public.evaluate_session_badges($1, '2026-09-27T06:30:00Z') as awarded",
        [harness.playerId],
      );
      const afterFirst = (await harness.store.loadAll()).tokens;
      const second = await fixture.runSql<{ awarded: string[] }>(
        "select public.evaluate_session_badges($1, '2026-09-27T07:30:00Z') as awarded",
        [harness.playerId],
      );
      const afterSecond = (await harness.store.loadAll()).tokens;

      expect(first.rows[0].awarded).toEqual(['first-waddle', 'night-owl']);
      expect(afterFirst).toBe(before + 100);
      expect(second.rows[0].awarded).toEqual([]);
      expect(afterSecond).toBe(afterFirst);
      const reloaded = await (await createPgliteProgressStoreFor(harness.playerId)).loadAll();
      expect(reloaded.badges).toContain('night-owl');
      expect(reloaded.tokens).toBe(afterFirst);
    });
  });

  it('awards Ship It inside complete_quest with the balance re-read after the +50', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('Shipper');
    await fixture.runSql('update public.players set profile_created_at = now() where id = $1', [
      playerId,
    ]);
    await fixture.runSqlAs(playerId, 'select public.mark_dev_pit_visited()');
    await fixture.recordRoundAs(playerId, 'bug-squash', 0, {});
    await fixture.recordRoundAs(playerId, 'pancake-flip', 0, {});
    await fixture.runSqlAs(playerId, "select public.purchase_item('beanbag')");

    const res = await fixture.runSqlAs<{ result: Record<string, unknown> }>(
      playerId,
      "select public.complete_quest('main') as result",
    );
    const stored = await fixture.runSql<{ tokens: number }>(
      'select tokens from public.players where id = $1',
      [playerId],
    );

    expect(res.rows[0].result).toEqual({
      tokensAwarded: 150,
      balance: 250,
      alreadyCompleted: false,
      badgesEarned: ['ship-it'],
    });
    expect(stored.rows[0].tokens).toBe(250);
  });

  describe('each Badge survives a reload in a new store, with its +50 paid once', () => {
    // Night Owl is pre-held (D16), so a run between 02:00 and 05:00 Eastern
    // can't add it to a Session check here.
    async function namedHarness(name: string) {
      const harness = await createPgliteProgressStoreHarness();
      await harness.holdBadge('night-owl');
      await harness.store.saveLook({ ...DEFAULT_LOOK, name });
      return harness;
    }

    it('First Waddle', async () => {
      const harness = await namedHarness('Waddler');
      const before = (await harness.store.loadAll()).tokens;

      const first = await harness.store.checkBadges();
      const second = await harness.store.checkBadges();

      expect(first.badges).toContain('first-waddle');
      expect(first.balance).toBe(before + 50);
      expect(second.balance).toBe(first.balance);
      const reloaded = await (await createPgliteProgressStoreFor(harness.playerId)).loadAll();
      expect(reloaded.badges.filter((badgeId) => badgeId === 'first-waddle')).toEqual([
        'first-waddle',
      ]);
      expect(reloaded.tokens).toBe(first.balance);
    });

    it('Interior Penguin', async () => {
      const harness = await namedHarness('Decorator');
      await harness.grantTokens(1000);
      for (const itemId of SIX_ITEMS) {
        await harness.store.purchase(itemId);
      }
      const { catalog, tokens: before } = await harness.store.loadAll();
      const rgbSlot = rgbLightStripSlot(catalog);

      for (const [index, itemId] of SIX_ITEMS.slice(0, 5).entries()) {
        await harness.store.setSlot((index + 1) as IglooSlot, itemId);
      }
      await harness.store.setSlot(rgbSlot, SIX_ITEMS[5]);
      const afterSixth = (await harness.store.loadAll()).tokens;
      // Re-placing a slot fires the trigger again, and pays nothing.
      await harness.store.setSlot(rgbSlot, null);
      await harness.store.setSlot(rgbSlot, SIX_ITEMS[5]);

      expect(afterSixth).toBe(before + 50);
      const reloaded = await (await createPgliteProgressStoreFor(harness.playerId)).loadAll();
      expect(reloaded.badges).toContain('interior-penguin');
      expect(reloaded.tokens).toBe(afterSixth);
    });

    it('Ship It', async () => {
      const harness = await namedHarness('Shipper');
      await harness.store.markDevPitVisited();
      await harness.store.recordRound('bug-squash', 0, {
        score: 0,
        squashed: 0,
        bestCombo: 0,
        escaped: 0,
      });
      await harness.store.recordRound('pancake-flip', 0, {
        golden: 0,
        flipNow: 0,
        raw: 0,
        burnt: 0,
        stacked: 0,
        bestStreak: 0,
      });
      await harness.store.purchase('beanbag');
      const before = (await harness.store.loadAll()).tokens;

      const first = await harness.store.completeQuest('main');
      const second = await harness.store.completeQuest('main');

      expect(first.badgesEarned).toEqual(['ship-it']);
      expect(first.balance).toBe(before + 150 + 50);
      expect(second).toMatchObject({ alreadyCompleted: true, badgesEarned: [] });
      const reloaded = await (await createPgliteProgressStoreFor(harness.playerId)).loadAll();
      expect(reloaded.badges).toContain('ship-it');
      expect(reloaded.tokens).toBe(first.balance);
    });
  });

  it('backfills First Waddle, Ship It and Interior Penguin exactly once, with +50 each', async () => {
    const db = await ownDb({ through: 'quests' });
    const named = await addPlayer(db, { named: true });
    const unnamed = await addPlayer(db);
    const completer = await addPlayer(db, { named: true, tokens: 1000 });
    await db.query(
      "insert into public.player_quest_completions (player_id, quest_id, tokens_awarded) values ($1, 'main', 150)",
      [completer],
    );
    const sixSlots = await addPlayer(db, { tokens: 1000 });
    await placeItems(db, sixSlots, SIX_ITEMS);
    const fiveSlots = await addPlayer(db, { tokens: 1000 });
    await placeItems(db, fiveSlots, SIX_ITEMS.slice(0, 5));

    await db.exec(migrationSql('badges'));
    const afterFirst = {
      named: [await badgesOf(db, named), await tokensOf(db, named)],
      unnamed: [await badgesOf(db, unnamed), await tokensOf(db, unnamed)],
      completer: [await badgesOf(db, completer), await tokensOf(db, completer)],
      sixSlots: [await badgesOf(db, sixSlots), await tokensOf(db, sixSlots)],
      fiveSlots: [await badgesOf(db, fiveSlots), await tokensOf(db, fiveSlots)],
    };

    expect(afterFirst).toEqual({
      named: [['first-waddle'], 150],
      unnamed: [[], 100],
      completer: [['first-waddle', 'ship-it'], 1100],
      sixSlots: [['interior-penguin'], 1050],
      fiveSlots: [[], 1000],
    });

    await db.exec(migrationSql('badges'));
    const afterRerun = {
      named: [await badgesOf(db, named), await tokensOf(db, named)],
      unnamed: [await badgesOf(db, unnamed), await tokensOf(db, unnamed)],
      completer: [await badgesOf(db, completer), await tokensOf(db, completer)],
      sixSlots: [await badgesOf(db, sixSlots), await tokensOf(db, sixSlots)],
      fiveSlots: [await badgesOf(db, fiveSlots), await tokensOf(db, fiveSlots)],
    };
    expect(afterRerun).toEqual(afterFirst);
  });

  it("README's H1 one-paste block passes, and runs again on the same connection", async () => {
    const readme = readRepoFile('supabase', 'tests', 'README.md').replace(/\r\n/g, '\n');
    const fenced = /```sql\n( {6}drop table if exists h1_before;[\s\S]*?)\n {6}```/.exec(readme);
    expect(fenced).not.toBeNull();
    const migration = migrationSql('badges');
    const h1Sql = fenced![1]
      .split('\n')
      .map((line) => line.replace(/^ {6}/, ''))
      .join('\n')
      .replace(/^-- <paste 20260927000000_badges\.sql here[^\n]*$/gm, () => migration);
    expect(h1Sql).not.toContain('<paste');

    const db = await ownDb({ through: 'quests' });
    await addPlayer(db, { named: true });
    await addPlayer(db);
    const completer = await addPlayer(db, { named: true, tokens: 1000 });
    await db.query(
      "insert into public.player_quest_completions (player_id, quest_id, tokens_awarded) values ($1, 'main', 150)",
      [completer],
    );
    // A Minigame Badge held before the migration: counted, and paid nothing.
    await db.query(
      "insert into public.player_badges (player_id, badge_id) values ($1, 'exterminator')",
      [completer],
    );
    const decorator = await addPlayer(db, { tokens: 1000 });
    await placeItems(db, decorator, SIX_ITEMS);
    await placeItems(db, await addPlayer(db, { tokens: 1000 }), SIX_ITEMS.slice(0, 5));

    const run = async () => {
      const results = await db.exec(h1Sql);
      return results.at(-1)!.rows[0] as Record<string, unknown>;
    };
    const expectedChecks = {
      apply_paid_50_per_badge: true,
      badges_unchanged_by_rerun: true,
      tokens_unchanged_by_rerun: true,
      named_players_without_first_waddle: 0,
      main_quest_completers_without_ship_it: 0,
      six_item_igloos_without_interior_penguin: 0,
    };

    const first = await run();
    expect(first).toMatchObject({ ...expectedChecks, badge_rows_added_by_apply: 4 });
    expect(first.badges_after_apply).toEqual([
      { badge_id: 'exterminator', n: 1 },
      { badge_id: 'first-waddle', n: 2 },
      { badge_id: 'interior-penguin', n: 1 },
      { badge_id: 'ship-it', n: 1 },
    ]);

    const again = await run();
    expect(again).toMatchObject({ ...expectedChecks, badge_rows_added_by_apply: 0 });
  });

  it('never resets a Badge a later migration turned on, when rerun', async () => {
    const db = await ownDb();
    await db.query("update public.badges set available = true where id = 'stair-master'");

    await db.exec(migrationSql('badges'));

    const res = await db.query<{ available: boolean }>(
      "select available from public.badges where id = 'stair-master'",
    );
    expect(res.rows[0].available).toBe(true);
  });

  it('restores the players column grants after a #9 rerun, when rerun', async () => {
    const db = await ownDb();
    const canUpdateName = async () =>
      (
        await db.query<{ ok: boolean }>(
          "select has_column_privilege('authenticated', 'public.players', 'penguin_name', 'UPDATE') as ok",
        )
      ).rows[0].ok;
    const canUpdateTokens = async () =>
      (
        await db.query<{ ok: boolean }>(
          "select has_column_privilege('authenticated', 'public.players', 'tokens', 'UPDATE') as ok",
        )
      ).rows[0].ok;

    await db.exec(migrationSql('players'));
    expect(await canUpdateName()).toBe(false);

    await db.exec(migrationSql('badges'));
    expect(await canUpdateName()).toBe(true);
    expect(await canUpdateTokens()).toBe(false);
  });

  it('rerunning #27 fails and changes nothing once a Player holds a non-Minigame Badge', async () => {
    const db = await ownDb();
    const holder = await addPlayer(db, { named: true });
    await db.query("select public.award_badge($1, 'first-waddle')", [holder]);

    await expect(
      db.transaction(async (tx) => {
        await tx.exec(migrationSql('saved-progress'));
      }),
    ).rejects.toMatchObject({ code: '23514' });

    const source = await db.query<{ src: string }>(
      "select prosrc as src from pg_proc where proname = 'record_round'",
    );
    expect(source.rows[0].src).toContain('award_badge');
  });

  it('reruns cleanly', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.execSql(migrationSql('badges'))).resolves.toBeDefined();
  });
});
