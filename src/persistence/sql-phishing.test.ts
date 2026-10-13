import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createPgliteDb,
  createPgliteLeaderboardFixture,
  migrationSql,
  type PgliteLeaderboardFixture,
} from './testing/pglite-progress-store';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

const FIXTURE_PLACEHOLDER = /00000000-0000-0000-0000-00000000f1f0/g;

/** #170's DN5 guard posts, in position order. */
const DN5 = [
  ['office-hallway', 'TEAM ROOM 1'],
  ['town-center', 'KITCHEN'],
  ['office-hallway', 'TEAM ROOM 2'],
  ['dev-pit', 'THE ICEBOX'],
  ['office-hallway', 'DEV PIT'],
  ['the-melt', 'ROOF DECK'],
  ['office-hallway', 'TEAM ROOM 3'],
  ['town-center', 'THE HALLWAY'],
  ['office-hallway', 'BATHROOM'],
  ['dev-pit', 'THE HALLWAY'],
  ['office-hallway', 'TEAM ROOM 4'],
  ['the-melt', 'TOWN CENTER'],
  ['office-hallway', 'TOWN CENTER'],
  ['town-center', 'STAIRWELL'],
  ['roof-deck', 'KITCHEN'],
  ['town-center', 'ELEVATOR · ROOF DECK'],
].map(([room_id, door_label], position) => ({ position, room_id, door_label }));

/** `public.phishing_guard_posts`, in position order. */
async function guardPosts(fixture: PgliteLeaderboardFixture) {
  return (
    await fixture.runSql<{ position: number; room_id: string; door_label: string }>(
      'select position, room_id, door_label from public.phishing_guard_posts order by position',
    )
  ).rows;
}

/** The rows of a proof file's final select, run on `fixture`. */
async function runProof(fixture: PgliteLeaderboardFixture, file: string, playerId?: string) {
  let sql = readRepoFile('supabase', 'tests', file);
  if (playerId) sql = sql.replace(FIXTURE_PLACEHOLDER, playerId);
  return (await fixture.execSql<{ check_name: string; pass: boolean; detail: string }>(sql)).at(-1)!
    .rows;
}

/**
 * A fixture over a fresh, fully migrated database, closed after `body`: for
 * the #170 migration's reruns, which must not see the guard challenges
 * earlier tests in this file left in the current window (RT170-21/-25).
 */
async function withFreshDb(body: (fixture: PgliteLeaderboardFixture) => Promise<void>) {
  const db = await createPgliteDb();
  try {
    await body(await createPgliteLeaderboardFixture({ db }));
  } finally {
    await db.close();
  }
}

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

  it('170_guard_posts_proof.sql passes on the full chain, including the ALL row (#170 DN10)', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const rows = await runProof(fixture, '170_guard_posts_proof.sql');

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.map((row) => row.check_name)).toEqual(
      expect.arrayContaining([
        'sixteen_posts_contiguous_from_0',
        'seed_matches_dn5_by_position',
        'no_neighbouring_windows_share_a_room',
        'no_neighbouring_windows_guard_one_doorway',
        'guarded_rooms_are_the_five',
        'room_check_constraint_named',
        'room_check_accepts_the_five_rooms',
        'room_check_rejects_igloo_23514',
        'rls_on_and_no_policies',
        'select_denied_to_authenticated_and_anon_42501',
        'post_index_is_epoch_window_mod_16',
        'paste_window_slot_5_is_the_melt_roof_deck',
      ]),
    );
    expect(await guardPosts(fixture)).toEqual(DN5);
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

  it('reruns #146 then #170 cleanly, keeping Phish Fry available, the DN5 seed and both proofs passing (RT170-25)', async () => {
    await withFreshDb(async (fixture) => {
      // #146's rerun restores its 8 posts; #170's rerun must follow it.
      await fixture.execSql(migrationSql('phishing-quiz'));
      expect(await guardPosts(fixture)).toHaveLength(8);
      await fixture.execSql(migrationSql('door-network-guard-posts'));

      const available = await fixture.execSql<{ available: boolean }>(
        "select available from public.badges where id = 'phish-fry'",
      );
      expect(available.at(-1)!.rows).toEqual([{ available: true }]);
      expect(await guardPosts(fixture)).toEqual(DN5);

      const proof146 = await runProof(
        fixture,
        '146_phishing_proof.sql',
        await fixture.addPlayer('RERUN FIXTURE'),
      );
      expect(proof146.filter((row) => !row.pass)).toEqual([]);
      expect(proof146.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
      const proof170 = await runProof(fixture, '170_guard_posts_proof.sql');
      expect(proof170.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    });
  });

  it('reruns #170 alone to an identical table, even with a guard challenge open in this window (DN8, RT170-21)', async () => {
    await withFreshDb(async (fixture) => {
      const playerId = await fixture.addPlayer('RERUN GUARD');
      const start = (
        await fixture.runSqlAs<{ result: { mode: string } }>(
          playerId,
          'select public.start_phishing_challenge() as result',
        )
      ).rows[0].result;
      expect(start.mode).toBe('guard');

      // The window's post doesn't move, so the open challenge doesn't stop it.
      await fixture.execSql(migrationSql('door-network-guard-posts'));
      expect(await guardPosts(fixture)).toEqual(DN5);
      const proof170 = await runProof(fixture, '170_guard_posts_proof.sql');
      expect(proof170.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    });
  });

  it('aborts with guard_window_in_use, changing nothing, only while a remapped window has a guard challenge (RT170-21)', async () => {
    await withFreshDb(async (fixture) => {
      // One post no DN5 row matches, so this window's post always moves.
      await fixture.execSql(
        "delete from public.phishing_guard_posts; insert into public.phishing_guard_posts (position, room_id, door_label) values (0, 'roof-deck', 'PROOF ONLY');",
      );
      const playerId = await fixture.addPlayer('REMAP GUARD');
      await fixture.runSqlAs(playerId, 'select public.start_phishing_challenge()');

      await expect(fixture.execSql(migrationSql('door-network-guard-posts'))).rejects.toMatchObject(
        { message: 'guard_window_in_use' },
      );
      expect(await guardPosts(fixture)).toEqual([
        { position: 0, room_id: 'roof-deck', door_label: 'PROOF ONLY' },
      ]);

      // Without a guard challenge in the window, the same remap goes through.
      await fixture.runSql("delete from public.phishing_challenges where mode = 'guard'");
      await fixture.execSql(migrationSql('door-network-guard-posts'));
      expect(await guardPosts(fixture)).toEqual(DN5);
    });
  });
});
