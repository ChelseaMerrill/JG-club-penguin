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

interface ProofRow {
  check_name: string;
  pass: boolean;
  detail: string;
}

// #142's migration (20261009010000_quest_pitch_hack.sql) against a real
// Postgres database (PGlite), migrated through every migration in timestamp
// order. The proof file is what the reviewer re-runs on real
// Postgres/Supabase. It controls time by setting the stored start time into
// the past, as postgres, relative to the database's own now(): the only
// clock the server reads, and a write no client role can make (the proof
// shows the fixture is denied it).
describe('Pitch Linda Quest migration (PGlite)', { timeout: 30_000 }, () => {
  async function runProof(): Promise<ProofRow[]> {
    const fixture = await createPgliteLeaderboardFixture();
    const proofSql = readRepoFile('supabase', 'tests', 'quest_pitch_hack_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
      await fixture.addPlayer('PROOF FIXTURE'),
    );
    const results = await fixture.execSql<ProofRow>(proofSql);
    return results.at(-1)!.rows;
  }

  it('quest_pitch_hack_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const rows = await runProof();

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.map((row) => row.check_name)).toEqual(
      expect.arrayContaining([
        'registry_has_pitch_hack_75',
        'pitch_runs_select_only_for_owner',
        'authenticated_denied_internal_functions',
        'fresh_run_reports_nothing',
        'start_refused_before_talking_to_linda',
        'submit_refused_before_talking_to_linda',
        'quest_refused_before_start',
        'talking_to_linda_marks_the_step',
        'talking_again_keeps_the_first_talk',
        'submit_refused_before_start_pitch',
        'out_of_range_choice_refused_invalid_pitch',
        'player_cannot_write_the_start_time',
        'submission_after_65_seconds_refused_pitch_timeout',
        'timeout_pays_nothing',
        'start_pitch_resets_the_clock',
        'submission_inside_the_grace_accepted',
        'fast_pitch_reports_its_seconds_and_completes_both_steps',
        'pays_75_once',
        'second_claim_pays_nothing',
        'replay_improves_best_seconds_but_never_pays_again',
        'anon_denied_every_rpc',
        'one_overload_each_security_definer_search_path_locked',
        'rpcs_take_only_their_stated_arguments',
        'execute_granted_to_authenticated_only',
      ]),
    );
  });

  it('refuses a submission 70 s after start_pitch however the client asks, and pays nothing', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('PITCH TIMEOUT');
    await fixture.runSqlAs(playerId, 'select public.mark_linda_talked()');
    await fixture.runSqlAs(playerId, 'select public.start_pitch()');
    // The server's clock is the only one that counts: 70 s have passed.
    await fixture.runSql(
      `update public.player_pitch_runs set started_at = now() - interval '70 seconds'
       where player_id = $1`,
      [playerId],
    );
    const before = await fixture.runSql<{ tokens: number }>(
      'select tokens from public.players where id = $1',
      [playerId],
    );

    // The client's own timer can't be passed in: submit_pitch takes no time
    // argument, and writing the start time directly is denied.
    await expect(
      fixture.runSqlAs(playerId, 'select public.submit_pitch(0, 0, 0, 30)'),
    ).rejects.toMatchObject({ code: '42883' });
    await expect(
      fixture.runSqlAs(
        playerId,
        'update public.player_pitch_runs set started_at = now() where player_id = $1',
        [playerId],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      fixture.runSqlAs(playerId, 'select public.submit_pitch(0, 0, 0)'),
    ).rejects.toMatchObject({ message: 'pitch_timeout' });
    await expect(
      fixture.runSqlAs(playerId, "select public.complete_quest('pitch-hack')"),
    ).rejects.toMatchObject({ message: 'quest_incomplete' });

    const after = await fixture.runSql<{ tokens: number; passed: boolean }>(
      `select p.tokens, r.passed_at is not null as passed
       from public.players p join public.player_pitch_runs r on r.player_id = p.id
       where p.id = $1`,
      [playerId],
    );
    expect(after.rows).toEqual([{ tokens: before.rows[0].tokens, passed: false }]);
  });

  it("never touches another Player's pitch run", async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const alice = await fixture.addPlayer('ALICE');
    const bob = await fixture.addPlayer('BOB');

    await fixture.runSqlAs(alice, 'select public.mark_linda_talked()');
    await fixture.runSqlAs(alice, 'select public.start_pitch()');

    const bobRun = await fixture.runSqlAs<{ run: Record<string, unknown> }>(
      bob,
      'select public.pitch_run() as run',
    );
    expect(bobRun.rows[0].run).toEqual({ talkedToLinda: false, passed: false, bestSeconds: null });
    // Bob's own calls are refused before he talks to Linda, even though
    // Alice's clock is running.
    await expect(
      fixture.runSqlAs(bob, 'select public.submit_pitch(0, 0, 0)'),
    ).rejects.toMatchObject({
      message: 'pitch_not_started',
    });
    // RLS: a bare select (no player filter) shows Bob none of Alice's row.
    const visible = await fixture.runSqlAs<{ count: number }>(
      bob,
      'select count(*)::int as count from public.player_pitch_runs',
    );
    expect(visible.rows[0].count).toBe(0);
  });

  it.each([
    "select public.pitch_run_state('00000000-0000-0000-0000-000000000000'::uuid)",
    "select public.quest_steps__pitch_hack('00000000-0000-0000-0000-000000000000'::uuid)",
    'insert into public.player_pitch_runs (player_id) values (auth.uid())',
  ])('keeps %s closed to a signed-in Player (42501)', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('CLOSED DOOR');

    await expect(fixture.runSqlAs(playerId, sql)).rejects.toMatchObject({ code: '42501' });
  });

  it.each([
    'select public.mark_linda_talked()',
    'select public.start_pitch()',
    'select public.submit_pitch(0, 0, 0)',
    'select public.pitch_run()',
    'select * from public.player_pitch_runs',
  ])('denies anon: %s rejects with 42501', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('reruns cleanly, keeping its proof and the registry proof passing', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await fixture.execSql(migrationSql('quest-pitch-hack'));

    const rows = await runProof();
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });

    const registryProof = readRepoFile('supabase', 'tests', 'quest_registry_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
      await fixture.addPlayer('REGISTRY FIXTURE'),
    );
    const registryRows = (await fixture.execSql<ProofRow>(registryProof)).at(-1)!.rows;
    expect(registryRows.filter((row) => !row.pass)).toEqual([]);
  });
});
