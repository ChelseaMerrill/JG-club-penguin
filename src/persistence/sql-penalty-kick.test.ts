import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPgliteLeaderboardFixture, migrationSql } from './testing/pglite-progress-store';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

const FOUR_GOALS = { goals: 4, golazos: 0, saved: 1, wide: 0, over: 0 };

// The Penalty Kick migration (20261012010000_penalty_kick.sql) against a
// real Postgres database (PGlite), migrated through every migration in
// timestamp order. The shared contract suite (`sql-progress-store.test.ts`)
// covers the store-level behavior (payout, validation, the Goleador
// threshold); this file runs the SQL proof the reviewer re-runs on real
// Postgres/Supabase, plus the checks only a raw connection can make.
describe('Penalty Kick migration (PGlite)', () => {
  it('penalty_kick_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const fixturePlayerId = await fixture.addPlayer('PROOF FIXTURE');

    const proofSql = readRepoFile('supabase', 'tests', 'penalty_kick_proof.sql').replace(
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
        'goleador_available_in_catalog',
        'impossible_stats_rejected',
        'badge_round_awards_through_award_badge',
        'four_goals_earns_goleador_plus_50',
        'full_marks_no_second_badge_still_pays_250',
        'bonus_paid_once_over_the_run',
        'leaderboard_knows_penalty_kick',
        'anon_denied_record_round',
      ]),
    );
  });

  it("denies anon: record_round('penalty-kick', ...) rejects with 42501", async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(
      fixture.asAnon("select public.record_round('penalty-kick', 4, $1::jsonb)", [
        JSON.stringify(FOUR_GOALS),
      ]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it("keeps #138's foreign key: a Badge row for 'goleador' inserts, an unknown id still fails with 23503", async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('BADGE ROW');

    await expect(
      fixture.runSql(
        "insert into public.player_badges (player_id, badge_id) values ($1, 'goleador')",
        [playerId],
      ),
    ).resolves.toBeDefined();
    await expect(
      fixture.runSql(
        "insert into public.player_badges (player_id, badge_id) values ($1, 'not-a-real-badge')",
        [playerId],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('reruns cleanly, leaving Goleador available', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.execSql(migrationSql('penalty-kick'))).resolves.toBeDefined();
    const results = await fixture.execSql<{ available: boolean }>(
      "select available from public.badges where id = 'goleador'",
    );
    expect(results.at(-1)!.rows).toEqual([{ available: true }]);
  });

  it("#138's rerun chain: rerunning 20260927000000_badges.sql doesn't touch Goleador; rerunning this file restores Penalty Kick", async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await fixture.execSql(migrationSql('badges'));
    const beforeGoleador = await fixture.execSql<{ available: boolean }>(
      "select available from public.badges where id = 'goleador'",
    );
    expect(beforeGoleador.at(-1)!.rows).toEqual([{ available: true }]);

    await fixture.execSql(migrationSql('penalty-kick'));
    const proofSql = readRepoFile('supabase', 'tests', 'penalty_kick_proof.sql').replace(
      /00000000-0000-0000-0000-00000000f1f0/g,
      await fixture.addPlayer('RERUN FIXTURE'),
    );
    const proof = (await fixture.execSql<{ check_name: string; pass: boolean }>(proofSql)).at(
      -1,
    )!.rows;
    expect(proof.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
  });

  it("leaderboard('penalty-kick') answers once this migration is applied (P9)", async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(
      fixture.asAnon("select * from public.leaderboard('penalty-kick')", []),
    ).rejects.toMatchObject({ code: '42501' }); // anon is denied before the id is even checked

    const playerId = await fixture.addPlayer('LEADERBOARD PK');
    await expect(
      fixture.runSqlAs(playerId, "select * from public.leaderboard('penalty-kick')", []),
    ).resolves.toBeDefined();
  });
});
