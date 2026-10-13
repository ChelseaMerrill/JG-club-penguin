import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPgliteLeaderboardFixture, migrationSql } from './testing/pglite-progress-store';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

const FULL_CLEAR = { roundsCleared: 3, matches: 24, bestStreak: 24 };

// The Pão de Queijo Memory migration (20261012030000_pao_de_queijo.sql)
// against a real Postgres database (PGlite), migrated through every
// migration in timestamp order, #138's Badges, #121's Beystadium, #220's
// Penalty Kick and #219's Carnaval Parade included. The shared contract
// suite (`sql-progress-store.test.ts`) covers the store-level behavior
// (bounded payout, the 300 cap, the Badge on a full clear); this file runs
// the SQL proof the reviewer re-runs on real Postgres/Supabase, plus the
// checks only a raw connection can make.
describe('Pão de Queijo Memory migration (PGlite)', () => {
  it('218_pao_de_queijo_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const fixturePlayerId = await fixture.addPlayer('PROOF FIXTURE');

    const proofSql = readRepoFile('supabase', 'tests', '218_pao_de_queijo_proof.sql').replace(
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
        'mestre_do_pao_de_queijo_available_in_catalog',
        'badge_switched_off_fails_badge_unavailable',
        'full_clear_pays_floor_score_div_10_best_is_score_and_earns_badge_plus_50',
        'half_window_clamps_payout_no_second_badge',
        'over_cap_round_pays_exactly_300_no_second_badge',
        'partial_clear_never_earns_badge_even_at_high_score',
        'bonus_paid_once_over_the_run',
        'anon_denied_record_round',
      ]),
    );
  });

  it.each([
    ["select public.record_round('pao-de-queijo', 1000, $1::jsonb)", [JSON.stringify(FULL_CLEAR)]],
    ["select * from public.leaderboard('pao-de-queijo')", []],
  ])('denies anon: %s rejects with 42501', async (sql, params) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql, params)).rejects.toMatchObject({ code: '42501' });
  });

  it("keeps #138's foreign key: a Badge row for 'mestre-do-pao-de-queijo' inserts, an unknown id fails with 23503", async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('BADGE ROW');

    await expect(
      fixture.runSql(
        "insert into public.player_badges (player_id, badge_id) values ($1, 'mestre-do-pao-de-queijo')",
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

  it('reruns cleanly, leaving Mestre do Pão de Queijo available', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.execSql(migrationSql('pao-de-queijo'))).resolves.toBeDefined();
    const results = await fixture.execSql<{ available: boolean }>(
      "select available from public.badges where id = 'mestre-do-pao-de-queijo'",
    );
    expect(results.at(-1)!.rows).toEqual([{ available: true }]);
  });

  it("rerunning 20261012020000_carnaval_parade.sql reverts record_round/leaderboard (losing the 'pao-de-queijo' branch/id); rerunning this file restores it", async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('REVERT CHECK');

    await fixture.execSql(migrationSql('carnaval-parade'));
    const reverted = fixture.runSqlAs(
      playerId,
      "select public.record_round('pao-de-queijo', 0, '{}'::jsonb)",
    );
    await expect(reverted).rejects.toThrow(/unknown_minigame/);

    await fixture.execSql(migrationSql('pao-de-queijo'));
    const proofSql = readRepoFile('supabase', 'tests', '218_pao_de_queijo_proof.sql').replace(
      /00000000-0000-0000-0000-00000000f1f0/g,
      await fixture.addPlayer('RERUN FIXTURE'),
    );
    const proof = (await fixture.execSql<{ check_name: string; pass: boolean }>(proofSql)).at(
      -1,
    )!.rows;
    expect(proof.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
  });

  it('rerunning the whole chain (penalty-kick then carnaval-parade then this file) still knows all three Minigames', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('CHAIN CHECK');

    await fixture.execSql(migrationSql('penalty-kick'));
    await fixture.execSql(migrationSql('carnaval-parade'));
    await fixture.execSql(migrationSql('pao-de-queijo'));

    await expect(
      fixture.runSqlAs(playerId, "select count(*) from public.leaderboard('penalty-kick')"),
    ).resolves.toBeDefined();
    await expect(
      fixture.runSqlAs(playerId, "select count(*) from public.leaderboard('carnaval-parade')"),
    ).resolves.toBeDefined();
    await expect(
      fixture.runSqlAs(playerId, "select count(*) from public.leaderboard('pao-de-queijo')"),
    ).resolves.toBeDefined();
  });
});
