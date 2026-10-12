import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPgliteLeaderboardFixture, migrationSql } from './testing/pglite-progress-store';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

const FIXTURE_PLACEHOLDER = /00000000-0000-0000-0000-00000000f1f0/g;

// The Quest registry migration (20261006000000_quest_registry.sql, the shared
// foundation for #140, #141 and #143) against a real Postgres database
// (PGlite), migrated through every migration in timestamp order. The proof
// file is what the reviewer re-runs on real Postgres/Supabase; the rest are
// checks a raw connection makes as a signed-in Player or anon.
// The first test migrates a fresh database, which can pass 5 s when every
// sql-*.test.ts file runs in parallel.
describe('Quest registry migration (PGlite)', { timeout: 30_000 }, () => {
  async function runProof(): Promise<Array<{ check_name: string; pass: boolean; detail: string }>> {
    const fixture = await createPgliteLeaderboardFixture();
    const proofSql = readRepoFile('supabase', 'tests', 'quest_registry_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
      await fixture.addPlayer('PROOF FIXTURE'),
    );
    const results = await fixture.execSql<{ check_name: string; pass: boolean; detail: string }>(
      proofSql,
    );
    return results.at(-1)!.rows;
  }

  it('quest_registry_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const rows = await runProof();

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.map((row) => row.check_name)).toEqual(
      expect.arrayContaining([
        'registry_seeds_main_150',
        'every_quest_has_a_steps_function',
        'steps_functions_not_executable_by_clients',
        'quests_table_closed_to_clients',
        'authenticated_denied_quest_steps__main',
        'refuses_unknown_and_malformed_quest_ids',
        'quest_progress_reports_main_steps_before',
        'main_refuses_while_steps_unmet',
        'main_pays_150_plus_ship_it',
        'main_second_call_pays_nothing',
        'quest_progress_keeps_every_key_and_adds_quest_steps',
        'complete_quest_unchanged_by_adding_quests',
        'extra_quest_refused_while_a_step_is_false',
        'quest_progress_reports_every_registered_quest',
        'quest_with_no_steps_refused',
        'extra_quest_paid_its_own_reward_without_ship_it',
        'extra_quest_second_call_pays_nothing',
        'extra_quest_reported_done',
        'anon_denied_every_function',
      ]),
    );
  });

  it('rolls back the test-only Quests it adds', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const proofSql = readRepoFile('supabase', 'tests', 'quest_registry_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
      await fixture.addPlayer('ROLLBACK FIXTURE'),
    );
    await fixture.execSql(proofSql);

    const quests = await fixture.execSql<{ id: string }>(
      'select id from public.quests order by id',
    );
    const functions = await fixture.execSql<{ fn: string | null }>(
      "select to_regprocedure('public.quest_steps__proof_extra(uuid)')::text as fn",
    );
    expect(quests.at(-1)!.rows.map((row) => row.id)).not.toContain('proof-extra');
    expect(functions.at(-1)!.rows).toEqual([{ fn: null }]);
  });

  it.each([
    "select public.quest_steps__main('00000000-0000-0000-0000-000000000000'::uuid)",
    "select public.quest_steps_for('00000000-0000-0000-0000-000000000000'::uuid, 'main')",
    'select * from public.quests',
  ])('keeps %s closed to a signed-in Player (42501)', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('CLOSED DOOR');

    await expect(fixture.runSqlAs(playerId, sql)).rejects.toMatchObject({ code: '42501' });
  });

  it.each([
    "select public.complete_quest('main')",
    'select public.quest_progress()',
    "select public.quest_steps__main('00000000-0000-0000-0000-000000000000'::uuid)",
    'select * from public.quests',
  ])('denies anon: %s rejects with 42501', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('reruns cleanly, keeping the proof passing', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await fixture.execSql(migrationSql('quest-registry'));

    const rows = await runProof();
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
  });
});
