import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPgliteLeaderboardFixture } from './testing/pglite-progress-store';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

// #46: the quests migration against a real Postgres database (PGlite),
// migrated from #9, #27, #70 and #46's own SQL. The shared contract suite
// (`sql-progress-store.test.ts`) covers the store-level behavior; this file
// runs the SQL proof the reviewer re-runs on real Supabase, plus the checks
// only a raw connection can make.
describe('quests migration (PGlite)', () => {
  it('46_quests_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const fixturePlayerId = await fixture.addPlayer('PROOF FIXTURE');

    const proofSql = readRepoFile('supabase', 'tests', '46_quests_proof.sql').replace(
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
    'select public.complete_quest($1)',
    'select public.quest_progress()',
    'select public.mark_dev_pit_visited()',
  ])('denies anon: %s rejects with 42501', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();
    const params = sql.includes('$1') ? ['main'] : [];

    await expect(fixture.asAnon(sql, params)).rejects.toMatchObject({ code: '42501' });
  });

  it('reruns cleanly', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(
      fixture.execSql(readRepoFile('supabase', 'migrations', '20260925000000_quests.sql')),
    ).resolves.toBeDefined();
  });
});
