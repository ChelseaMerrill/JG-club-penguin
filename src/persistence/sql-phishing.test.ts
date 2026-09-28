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

/** Every key an RPC result must never carry: the correct choice, by any name. */
const CORRECT_CHOICE_KEY = /correct_?index|correct_?choice|"answer"/i;

// The Phishing Quiz migration (20260928020000_phishing_quiz.sql, #146)
// against a real Postgres database (PGlite), migrated through every
// migration in timestamp order. The proof file is what the reviewer re-runs
// on real Postgres/Supabase; the rest are checks a raw connection makes as
// a signed-in Player or anon.
// The first test migrates a fresh database, which can pass 5 s when every
// sql-*.test.ts file runs in parallel.
describe('Phishing Quiz migration (PGlite)', { timeout: 30_000 }, () => {
  it('146_phishing_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const fixturePlayerId = await fixture.addPlayer('PROOF FIXTURE');

    const proofSql = readRepoFile('supabase', 'tests', '146_phishing_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
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
        'same_post_for_the_whole_600s_window',
        'next_window_moves_to_another_room',
        'two_players_see_the_same_post',
        'correct_pays_10_and_passes_the_window',
        'eleventh_correct_in_a_ny_day_pays_0',
        'wrong_pays_0_and_resets_streak',
        'late_right_answer_counts_as_timeout',
        'no_repeats_until_all_10_seen',
        'bypass_with_an_open_challenge_counted',
        'fifth_counted_bypass_locks_the_map',
        'three_training_correct_unlock_and_reset',
        'correct_answer_resets_counter_and_passes',
        'phish_fry_awarded_exactly_once',
        'no_client_privilege_on_any_new_table',
        'no_rpc_result_carries_the_correct_choice',
        'anon_denied_every_function',
      ]),
    );
  });

  it('two signed-in Players get the same guard post from phishing_guard_now()', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const first = await fixture.addPlayer('GUARD ONE');
    const second = await fixture.addPlayer('GUARD TWO');

    const a = await fixture.runSqlAs<{ post: Record<string, string> }>(
      first,
      'select public.phishing_guard_now() as post',
    );
    const b = await fixture.runSqlAs<{ post: Record<string, string> }>(
      second,
      'select public.phishing_guard_now() as post',
    );

    const post = ({ roomId, doorLabel, windowStart, windowEnd }: Record<string, string>) => ({
      roomId,
      doorLabel,
      windowStart,
      windowEnd,
    });
    const postA = post(a.rows[0].post);
    expect(postA).toEqual(post(b.rows[0].post));
    expect(Date.parse(postA.windowEnd) - Date.parse(postA.windowStart)).toBe(600_000);
  });

  it('returns no correct choice in any real RPC result a Player receives', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('NO LEAKS');

    const start = (
      await fixture.runSqlAs<{ result: Record<string, unknown> }>(
        playerId,
        'select public.start_phishing_challenge() as result',
      )
    ).rows[0].result;
    const answer = (
      await fixture.runSqlAs<{ result: Record<string, unknown> }>(
        playerId,
        'select public.answer_phishing_question($1::uuid, 0) as result',
        [start.challengeId],
      )
    ).rows[0].result;
    const state = (
      await fixture.runSqlAs<{ result: Record<string, unknown> }>(
        playerId,
        'select public.phishing_state() as result',
      )
    ).rows[0].result;
    const bypass = (
      await fixture.runSqlAs<{ result: Record<string, unknown> }>(
        playerId,
        "select public.record_map_bypass('town-center') as result",
      )
    ).rows[0].result;

    expect(Object.keys(start).sort()).toEqual([
      'category',
      'challengeId',
      'choices',
      'mode',
      'prompt',
      'questionId',
      'secondsLeft',
    ]);
    expect(Object.keys(answer).sort()).toEqual([
      'badgesEarned',
      'balance',
      'bypassCount',
      'correct',
      'dailyCorrect',
      'explanation',
      'locked',
      'passedGuardWindow',
      'streak',
      'tokensAwarded',
      'trainingCorrect',
    ]);
    for (const result of [start, answer, state, bypass]) {
      expect(JSON.stringify(result)).not.toMatch(CORRECT_CHOICE_KEY);
    }
  });

  it.each([
    'select id, correct_index from public.phishing_questions',
    'select * from public.phishing_challenges',
    'select * from public.phishing_player_state',
    'select * from public.phishing_guard_posts',
    'select public.phishing_guard_at(now())',
    "select public.award_badge(auth.uid(), 'phish-fry')",
  ])('keeps %s closed to a signed-in Player (42501)', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('TABLE READER');

    await expect(fixture.runSqlAs(playerId, sql)).rejects.toMatchObject({ code: '42501' });
  });

  it.each([
    'select public.phishing_guard_now()',
    'select public.phishing_state()',
    'select public.start_phishing_challenge()',
    "select public.answer_phishing_question('00000000-0000-0000-0000-000000000000'::uuid, 0)",
    "select public.record_map_bypass('town-center')",
    'select public.phishing_guard_at(now())',
    'select * from public.phishing_questions',
  ])('denies anon: %s rejects with 42501', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('reruns cleanly, keeping Phish Fry available and the proof passing', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await fixture.execSql(migrationSql('phishing-quiz'));
    const available = await fixture.execSql<{ available: boolean }>(
      "select available from public.badges where id = 'phish-fry'",
    );
    expect(available.at(-1)!.rows).toEqual([{ available: true }]);

    const proofSql = readRepoFile('supabase', 'tests', '146_phishing_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
      await fixture.addPlayer('RERUN FIXTURE'),
    );
    const proof = (await fixture.execSql<{ check_name: string; pass: boolean }>(proofSql)).at(
      -1,
    )!.rows;
    expect(proof.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
  });
});
