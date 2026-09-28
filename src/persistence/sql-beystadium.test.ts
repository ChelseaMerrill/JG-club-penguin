import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPgliteLeaderboardFixture } from './testing/pglite-progress-store';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

const WON_MATCH = { won: 1, roundsWon: 2, roundsLost: 1, strikes: 7, perfectLaunches: 2, bey: 0 };

// The Beystadium migration against a real Postgres database (PGlite),
// migrated from #9, #27, #70, #46 and its own SQL. The shared contract suite
// (`sql-progress-store.test.ts`) covers the store-level behavior (payout,
// validation, Let It Rip on the third win); this file runs the SQL proof
// the reviewer re-runs on real Postgres/Supabase, plus the checks only a
// raw connection can make.
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
    expect(rows.length).toBeGreaterThan(10);
  });

  it.each([
    ["select public.record_round('beystadium', 7, $1::jsonb)", [JSON.stringify(WON_MATCH)]],
    ["select * from public.leaderboard('beystadium')", []],
  ])('denies anon: %s rejects with 42501', async (sql, params) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql, params)).rejects.toMatchObject({ code: '42501' });
  });

  it("the Badge check constraint accepts 'let-it-rip' and still rejects an unknown id", async () => {
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
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('reruns cleanly', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(
      fixture.execSql(readRepoFile('supabase', 'migrations', '20260925010000_beystadium.sql')),
    ).resolves.toBeDefined();
  });
});
