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

// The "Pair with a JGer and fix the flaky test" Quest migration
// (20261009000000_quest_pair_flaky_test.sql, #140) against a real Postgres
// database (PGlite), migrated through every migration in timestamp order.
// The proof file is what the reviewer re-runs on real Postgres/Supabase; the
// rest are checks a raw connection makes as a signed-in Player or anon.
describe('"Pair with a JGer" Quest migration (PGlite)', { timeout: 30_000 }, () => {
  async function runProof(): Promise<Array<{ check_name: string; pass: boolean; detail: string }>> {
    const fixture = await createPgliteLeaderboardFixture();
    const proofSql = readRepoFile('supabase', 'tests', 'quest_pair_flaky_test_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
      await fixture.addPlayer('PROOF FIXTURE'),
    );
    const results = await fixture.execSql<{ check_name: string; pass: boolean; detail: string }>(
      proofSql,
    );
    return results.at(-1)!.rows;
  }

  it('quest_pair_flaky_test_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const rows = await runProof();

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.map((row) => row.check_name)).toEqual(
      expect.arrayContaining([
        'registry_seeds_pair_flaky_test_150_with_steps_function',
        'report_refuses_before_any_step',
        'talk_to_paul_keeps_first_time',
        'check_ci_board_keeps_first_time',
        'reports_talk_and_ci_board_only_so_far',
        'pair_with_jger_keeps_first_time',
        'non_numeric_flaky_hits_rejected_by_record_round',
        'two_flaky_hits_does_not_meet_squash_flakes',
        'report_still_refuses_with_only_two_flaky_hits',
        'three_flaky_hits_meets_squash_flakes',
        'report_to_paul_keeps_first_time',
        'pays_150_once_no_badge',
        'second_complete_quest_call_pays_nothing',
        'marks_are_scoped_to_the_caller',
        'anon_denied_mark_paul_talked',
        'anon_denied_mark_ci_board_checked',
        'anon_denied_mark_paired',
        'anon_denied_report_to_paul',
        'anon_denied_quest_steps__pair_flaky_test',
        'functions_security_definer_search_path_locked',
        'client_rpcs_executable_by_authenticated_only',
      ]),
    );
  });

  it.each([
    'select public.mark_paul_talked()',
    'select public.mark_ci_board_checked()',
    'select public.mark_paired()',
    'select public.report_to_paul()',
    "select public.quest_steps__pair_flaky_test('00000000-0000-0000-0000-000000000000'::uuid)",
  ])('denies anon: %s rejects with 42501', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps quest_steps__pair_flaky_test closed to a signed-in Player (42501)', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('CLOSED DOOR');

    await expect(
      fixture.runSqlAs(
        playerId,
        "select public.quest_steps__pair_flaky_test('00000000-0000-0000-0000-000000000000'::uuid)",
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('reruns cleanly, keeping the proof passing', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await fixture.execSql(migrationSql('quest-pair-flaky-test'));

    const rows = await runProof();
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
  });
});
