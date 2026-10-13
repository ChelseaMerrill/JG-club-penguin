import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPgliteLeaderboardFixture, migrationSql } from './testing/pglite-progress-store';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

const AT_THRESHOLD = { feathers: 40, stars: 0, barriersHit: 0, bestStreak: 15 };

// The Carnaval Parade migration (20261012020000_carnaval_parade.sql) against
// a real Postgres database (PGlite), migrated through every migration in
// timestamp order, #138's Badges and #121's Beystadium included. The shared
// contract suite (`sql-progress-store.test.ts`) covers the store-level
// behavior (bounded payout, the 120 cap, Passista at 400); this file runs
// the SQL proof the reviewer re-runs on real Postgres/Supabase, plus the
// checks only a raw connection can make.
describe('Carnaval Parade migration (PGlite)', () => {
  it('219_carnaval_parade_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const fixturePlayerId = await fixture.addPlayer('PROOF FIXTURE');

    const proofSql = readRepoFile('supabase', 'tests', '219_carnaval_parade_proof.sql').replace(
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
        'passista_available_in_catalog',
        'threshold_award_goes_through_award_badge',
        'half_window_clamps_payout_and_earns_passista_plus_50',
        'later_round_at_threshold_no_second_badge_or_bonus',
        'bonus_paid_once_over_the_run',
        'anon_denied_record_round',
      ]),
    );
  });

  it.each([
    [
      "select public.record_round('carnaval-parade', 400, $1::jsonb)",
      [JSON.stringify(AT_THRESHOLD)],
    ],
    ["select * from public.leaderboard('carnaval-parade')", []],
  ])('denies anon: %s rejects with 42501', async (sql, params) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql, params)).rejects.toMatchObject({ code: '42501' });
  });

  it("keeps #138's foreign key: a Badge row for 'passista' inserts, an unknown id fails with 23503", async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('BADGE ROW');

    await expect(
      fixture.runSql(
        "insert into public.player_badges (player_id, badge_id) values ($1, 'passista')",
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

  it('reruns cleanly, leaving Passista available', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.execSql(migrationSql('carnaval-parade'))).resolves.toBeDefined();
    const results = await fixture.execSql<{ available: boolean }>(
      "select available from public.badges where id = 'passista'",
    );
    expect(results.at(-1)!.rows).toEqual([{ available: true }]);
  });

  it("rerunning 20260928000000_beystadium.sql reverts record_round/leaderboard (losing the 'carnaval-parade' branch/id); rerunning this file restores it", async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('REVERT CHECK');

    await fixture.execSql(migrationSql('beystadium'));
    const reverted = fixture.runSqlAs(
      playerId,
      "select public.record_round('carnaval-parade', 0, '{}'::jsonb)",
    );
    await expect(reverted).rejects.toThrow(/unknown_minigame/);

    await fixture.execSql(migrationSql('carnaval-parade'));
    const proofSql = readRepoFile('supabase', 'tests', '219_carnaval_parade_proof.sql').replace(
      /00000000-0000-0000-0000-00000000f1f0/g,
      await fixture.addPlayer('RERUN FIXTURE'),
    );
    const proof = (await fixture.execSql<{ check_name: string; pass: boolean }>(proofSql)).at(
      -1,
    )!.rows;
    expect(proof.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
  });
});
