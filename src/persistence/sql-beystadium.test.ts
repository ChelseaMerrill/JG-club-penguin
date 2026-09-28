import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPgliteLeaderboardFixture, migrationSql } from './testing/pglite-progress-store';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

const WON_MATCH = { won: 1, roundsWon: 2, roundsLost: 1, strikes: 7, perfectLaunches: 2, bey: 0 };

// The Beystadium migration (20260928000000_beystadium.sql) against a real
// Postgres database (PGlite), migrated through every migration in timestamp
// order, #138's Badges and #135's igloo slots included. The shared contract
// suite (`sql-progress-store.test.ts`) covers the store-level behavior
// (payout, validation, Let It Rip on the third win); this file runs the SQL
// proof the reviewer re-runs on real Postgres/Supabase, plus the checks only
// a raw connection can make.
describe('Beystadium migration (PGlite)', () => {
  it('80_beystadium_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const fixturePlayerId = await fixture.addPlayer('PROOF FIXTURE');

    const proofSql = readRepoFile('supabase', 'tests', '80_beystadium_proof.sql').replace(
      /00000000-0000-0000-0000-00000000f1f0/g,
      fixturePlayerId,
    );
    const results = await fixture.execSql<{ check_name: string; pass: boolean; detail: string }>(
      proofSql,
    );
    const rows = results.at(-1)!.rows;

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.map((row) => row.check_name)).toEqual(
      expect.arrayContaining([
        'let_it_rip_available_in_catalog',
        'third_win_awards_through_award_badge',
        'third_win_earns_let_it_rip_plus_50',
        'fourth_win_no_second_badge_or_bonus',
        'bonus_paid_once_over_the_run',
        'anon_denied_record_round',
      ]),
    );
  });

  it.each([
    ["select public.record_round('beystadium', 7, $1::jsonb)", [JSON.stringify(WON_MATCH)]],
    ["select * from public.leaderboard('beystadium')", []],
  ])('denies anon: %s rejects with 42501', async (sql, params) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql, params)).rejects.toMatchObject({ code: '42501' });
  });

  it("keeps #138's foreign key: a Badge row for 'let-it-rip' inserts, an unknown id fails with 23503", async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('BADGE ROW');

    await expect(
      fixture.runSql(
        "insert into public.player_badges (player_id, badge_id) values ($1, 'let-it-rip')",
        [playerId],
      ),
    ).resolves.toBeDefined();
    await expect(
      fixture.runSql(
        "insert into public.player_badges (player_id, badge_id) values ($1, 'hexle')",
        [playerId],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('reruns cleanly, leaving Let It Rip available', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.execSql(migrationSql('beystadium'))).resolves.toBeDefined();
    const results = await fixture.execSql<{ available: boolean }>(
      "select available from public.badges where id = 'let-it-rip'",
    );
    expect(results.at(-1)!.rows).toEqual([{ available: true }]);
  });

  it("#138's rerun chain: rerunning 20260927000000_badges.sql keeps Let It Rip on; rerunning this file restores Beystadium", async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await fixture.execSql(migrationSql('badges'));
    const results = await fixture.execSql<{ available: boolean }>(
      "select available from public.badges where id = 'let-it-rip'",
    );
    expect(results.at(-1)!.rows).toEqual([{ available: true }]);

    await fixture.execSql(migrationSql('beystadium'));
    const proofSql = readRepoFile('supabase', 'tests', '80_beystadium_proof.sql').replace(
      /00000000-0000-0000-0000-00000000f1f0/g,
      await fixture.addPlayer('RERUN FIXTURE'),
    );
    const proof = (await fixture.execSql<{ check_name: string; pass: boolean }>(proofSql)).at(
      -1,
    )!.rows;
    expect(proof.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
  });
});
