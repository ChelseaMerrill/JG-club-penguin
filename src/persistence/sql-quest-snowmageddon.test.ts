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

// The Snowmageddon Quest migration (20261012000000_quest_snowmageddon.sql,
// #154) against a real Postgres database (PGlite), migrated through every
// migration in timestamp order. The proof file is what the reviewer re-runs
// on real Postgres/Supabase; the rest are checks a raw connection makes as a
// signed-in Player or anon.
describe('"Snowmageddon" Quest migration (PGlite)', { timeout: 30_000 }, () => {
  async function runProof(): Promise<Array<{ check_name: string; pass: boolean; detail: string }>> {
    const fixture = await createPgliteLeaderboardFixture();
    const proofSql = readRepoFile('supabase', 'tests', 'quest_snowmageddon_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
      await fixture.addPlayer('PROOF FIXTURE'),
    );
    const results = await fixture.execSql<{ check_name: string; pass: boolean; detail: string }>(
      proofSql,
    );
    return results.at(-1)!.rows;
  }

  it('quest_snowmageddon_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const rows = await runProof();

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.map((row) => row.check_name)).toEqual(
      expect.arrayContaining([
        'registry_seeds_snowmageddon_75_with_steps_function',
        'snowmageddon_badge_available',
        'self_hit_adds_nothing',
        'unknown_target_adds_nothing',
        'unnamed_penguin_target_adds_nothing',
        'first_valid_hit_counts',
        'steps_report_one_of_five_after_first_hit',
        'repeat_target_adds_nothing',
        'reused_throw_id_adds_nothing',
        'fourth_distinct_hit_reaches_four_today',
        'steps_report_four_of_five',
        'complete_quest_refuses_under_five_today',
        'backdated_hits_no_longer_count_today',
        'four_hits_yesterday_plus_one_today_does_not_complete',
        'complete_quest_still_refuses_with_one_of_five_today',
        'fifth_distinct_target_today_reaches_five',
        'steps_report_five_of_five',
        'pays_75_tokens_no_badge_in_result',
        'badge_trigger_pays_the_extra_50',
        'second_complete_quest_call_pays_nothing',
        'no_hits_recorded_once_complete',
        'steps_stay_true_forever_once_completed',
        'player_d_hitting_fixture_leaves_fixtures_own_count_alone',
        'keeps_quest_steps__snowmageddon_closed_to_a_signed_in_player',
        'anon_denied_record_snowball_hit',
        'anon_denied_quest_steps__snowmageddon',
        'functions_security_definer_search_path_locked',
        'record_snowball_hit_executable_by_authenticated_only',
        'internal_functions_executable_by_neither_role',
      ]),
    );
  });

  it.each([
    "select public.record_snowball_hit('00000000-0000-0000-0000-000000000000'::uuid, 'x')",
    "select public.quest_steps__snowmageddon('00000000-0000-0000-0000-000000000000'::uuid)",
  ])('denies anon: %s rejects with 42501', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps quest_steps__snowmageddon closed to a signed-in Player (42501)', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('CLOSED DOOR');

    await expect(
      fixture.runSqlAs(
        playerId,
        "select public.quest_steps__snowmageddon('00000000-0000-0000-0000-000000000000'::uuid)",
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('reruns cleanly, keeping the proof passing', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await fixture.execSql(migrationSql('quest-snowmageddon'));

    const rows = await runProof();
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
  });
});
