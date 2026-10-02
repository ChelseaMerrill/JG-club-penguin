import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGliteInterface } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPgliteDb,
  createPgliteLeaderboardFixture,
  migrationSql,
} from './testing/pglite-progress-store';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

const FIXTURE_PLACEHOLDER = /00000000-0000-0000-0000-00000000f1f0/g;

// The Stairs Challenge migration (20260929000000_stair_climb.sql, #51 slice
// 4) against a real Postgres database (PGlite), migrated through every
// migration in timestamp order. The proof file is what the reviewer re-runs
// on real Postgres/Supabase; the rest are checks a raw connection makes as a
// signed-in Player or anon, and the destructive precondition negatives that
// stay out of the proof (RT2-11).
// The first test migrates a fresh database, which can pass 5 s when every
// sql-*.test.ts file runs in parallel.
describe('Stairs Challenge migration (PGlite)', { timeout: 60_000 }, () => {
  it('51_stair_climb_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const fixturePlayerId = await fixture.addPlayer('PROOF FIXTURE');

    const proofSql = readRepoFile('supabase', 'tests', '51_stair_climb_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
      fixturePlayerId,
    );
    const results = await fixture.execSql<{ check_name: string; pass: boolean; detail: string }>(
      proofSql,
    );
    const rows = results.at(-1)!.rows;

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.map((row) => row.check_name)).toEqual([
      'stair_master_available_in_catalog',
      'rls_on_no_policy_no_client_privilege',
      'eastern_day_at_fixed_instants',
      'fresh_progress_is_defaults',
      'flight_before_a_start_is_not_started',
      'floor_0_starts_a_climb',
      'flight_within_2s_is_too_soon',
      'first_flight_pays_10',
      'repeat_is_already_logged_and_skip_is_out_of_order',
      'tally_of_95_pays_5',
      'capped_flight_is_logged_and_pays_0',
      'first_full_climb_earns_stair_master_and_50',
      'progress_reads_the_completed_climb',
      'stale_day_resets_the_tally',
      'second_full_climb_pays_flights_only',
      'invalid_floor_rejected',
      'table_and_internal_functions_closed_to_player',
      'anon_denied_everything',
      'one_overload_each_security_definer_search_path_locked',
      'execute_granted_to_authenticated_for_the_two_rpcs_only',
      'ALL',
    ]);
  });

  it('changes nothing: the proof rolls back the fixture climb, Badge and Tokens', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('ROLLBACK FIXTURE');
    const before = await fixture.runSql<{ tokens: number }>(
      'select tokens from public.players where id = $1',
      [playerId],
    );

    await fixture.execSql(
      readRepoFile('supabase', 'tests', '51_stair_climb_proof.sql').replace(
        FIXTURE_PLACEHOLDER,
        playerId,
      ),
    );

    const after = await fixture.runSql<{ tokens: number; climbs: number; badges: number }>(
      `select p.tokens,
              (select count(*)::int from public.player_stair_climbs c where c.player_id = p.id) as climbs,
              (select count(*)::int from public.player_badges b where b.player_id = p.id) as badges
       from public.players p where p.id = $1`,
      [playerId],
    );
    expect(after.rows).toEqual([{ tokens: before.rows[0]!.tokens, climbs: 0, badges: 0 }]);
  });

  it.each([
    'select * from public.player_stair_climbs',
    'insert into public.player_stair_climbs (player_id, floor) values (auth.uid(), 5)',
    'update public.player_stair_climbs set floor = 5',
    'select public.stair_day(now())',
    "select public.award_badge(auth.uid(), 'stair-master')",
    "select public.award_badge_if_available(auth.uid(), 'stair-master')",
  ])('keeps %s closed to a signed-in Player (42501)', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('TABLE READER');

    await expect(fixture.runSqlAs(playerId, sql)).rejects.toMatchObject({ code: '42501' });
  });

  it("never shows a Player another Player's climb: progress reads only the caller's own", async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const climber = await fixture.addPlayer('CLIMBER');
    const other = await fixture.addPlayer('OTHER');

    await fixture.runSqlAs(climber, 'select public.log_stair_flight(0)');
    await fixture.runSql(
      "update public.player_stair_climbs set floor = 4, updated_at = now() - interval '1 minute' where player_id = $1",
      [climber],
    );

    const mine = await fixture.runSqlAs<{ p: unknown }>(
      climber,
      'select public.stair_climb_progress() as p',
    );
    const theirs = await fixture.runSqlAs<{ p: unknown }>(
      other,
      'select public.stair_climb_progress() as p',
    );
    expect(mine.rows[0]!.p).toMatchObject({ flightsLogged: 4 });
    expect(theirs.rows[0]!.p).toEqual({ flightsLogged: 0, completed: false, flightTokensToday: 0 });
  });

  it.each([
    'select public.log_stair_flight(1)',
    'select public.stair_climb_progress()',
    'select * from public.player_stair_climbs',
    'select public.stair_day(now())',
    "select public.award_badge('00000000-0000-0000-0000-000000000000'::uuid, 'stair-master')",
    "select public.award_badge_if_available('00000000-0000-0000-0000-000000000000'::uuid, 'stair-master')",
  ])('denies anon: %s rejects with 42501', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('reruns cleanly, keeping Stair Master available, every climb, and the proof passing', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const climber = await fixture.addPlayer('RERUN CLIMBER');
    await fixture.runSqlAs(climber, 'select public.log_stair_flight(0)');

    await fixture.execSql(migrationSql('stair-climb'));

    const available = await fixture.execSql<{ available: boolean }>(
      "select available from public.badges where id = 'stair-master'",
    );
    expect(available.at(-1)!.rows).toEqual([{ available: true }]);
    const climbs = await fixture.runSql<{ count: number }>(
      'select count(*)::int as count from public.player_stair_climbs where player_id = $1',
      [climber],
    );
    expect(climbs.rows).toEqual([{ count: 1 }]);

    const proofSql = readRepoFile('supabase', 'tests', '51_stair_climb_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
      await fixture.addPlayer('RERUN FIXTURE'),
    );
    const proof = (await fixture.execSql<{ check_name: string; pass: boolean }>(proofSql)).at(
      -1,
    )!.rows;
    expect(proof.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
  });

  describe('preconditions (SC2), on a fresh database before this migration', () => {
    let db: PGliteInterface | null = null;

    afterEach(async () => {
      await db?.close();
      db = null;
    });

    /** Runs `setup`, then this migration, in one transaction that is always rolled back. */
    async function migrateAfter(setup: string): Promise<unknown> {
      db ??= await createPgliteDb({ through: 'phishing-quiz' });
      await db.exec('begin');
      try {
        await db.exec(setup);
        await db.exec(migrationSql('stair-climb'));
        return null;
      } catch (err) {
        return err;
      } finally {
        await db.exec('rollback');
      }
    }

    it('fails with badge_award_missing without #138', async () => {
      db = await createPgliteDb({ through: 'quests' });
      await expect(db.exec(migrationSql('stair-climb'))).rejects.toThrow('badge_award_missing');
    });

    it('fails with badge_award_missing when award_badge_if_available is gone (RT2-14)', async () => {
      const err = await migrateAfter(
        'drop function public.award_badge_if_available(uuid, text) cascade;',
      );
      expect(String(err)).toContain('badge_award_missing');
    });

    it('fails with stair_master_badge_missing when the Badge row is gone', async () => {
      const err = await migrateAfter("delete from public.badges where id = 'stair-master';");
      expect(String(err)).toContain('stair_master_badge_missing');
    });

    it.each([
      'grant execute on function public.award_badge(uuid, text) to authenticated;',
      'grant execute on function public.award_badge(uuid, text) to public;',
      'grant execute on function public.award_badge_if_available(uuid, text) to anon;',
    ])('fails with badge_award_executable after %s', async (grant) => {
      const err = await migrateAfter(grant);
      expect(String(err)).toContain('badge_award_executable');
    });

    it('applies cleanly with none of those, and the rollback above left nothing behind', async () => {
      expect(await migrateAfter('select 1;')).toBeNull();
      const leftover = await db!.query<{ table: string | null }>(
        "select to_regclass('public.player_stair_climbs')::text as table",
      );
      expect(leftover.rows).toEqual([{ table: null }]);
    });
  });
});
