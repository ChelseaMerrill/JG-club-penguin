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

// #141's migration (20261006020000_quest_nicole_coffee.sql) against a real
// Postgres database (PGlite), migrated through every migration in timestamp
// order. The proof file is what the reviewer re-runs on real
// Postgres/Supabase. It controls time by setting the stored hand-over time
// into the past, as postgres, relative to the database's own now(): the
// only clock the server reads, and a write no client role can make (the
// proof shows the fixture is denied it). The first test migrates a fresh
// database, which can pass 5 s when every sql-*.test.ts file runs in
// parallel.
describe('Nicole coffee Quest migration (PGlite)', { timeout: 30_000 }, () => {
  async function runProof(): Promise<ProofRow[]> {
    const fixture = await createPgliteLeaderboardFixture();
    const proofSql = readRepoFile('supabase', 'tests', 'quest_nicole_coffee_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
      await fixture.addPlayer('PROOF FIXTURE'),
    );
    const results = await fixture.execSql<ProofRow>(proofSql);
    return results.at(-1)!.rows;
  }

  it('quest_nicole_coffee_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const rows = await runProof();

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.map((row) => row.check_name)).toEqual(
      expect.arrayContaining([
        'registry_has_nicole_coffee_75',
        'coffee_runs_select_only_for_owner',
        'authenticated_denied_internal_functions',
        'fresh_run_reports_nothing',
        'refuses_every_step_before_talking_to_nicole',
        'quest_refused_before_start',
        'talking_to_nicole_starts_the_run',
        'deliver_refused_before_tom_hands_over',
        'talking_again_keeps_the_first_talk',
        'kitchen_visit_reported',
        'tom_hands_over_a_cup_with_60_seconds',
        'player_cannot_write_the_hand_over_time',
        'asking_again_while_hot_keeps_the_timer',
        'cold_cup_resets_steps_3_to_5',
        'delivery_after_65_seconds_refused_coffee_cold',
        'cold_cup_pays_nothing',
        'tom_hands_over_a_fresh_cup_after_expiry',
        'delivery_inside_the_grace_accepted',
        'delivery_in_time_completes_every_step',
        'pays_75_without_ship_it',
        'second_claim_pays_nothing',
        'after_delivery_asking_and_delivering_change_nothing',
        'anon_denied_every_rpc',
        'one_overload_each_security_definer_search_path_locked',
        'rpcs_take_no_player_argument',
        'execute_granted_to_authenticated_only',
      ]),
    );
  });

  it('refuses a delivery 70 s after the hand-over however the client asks, and pays nothing', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('COLD CUP');
    await fixture.runSqlAs(playerId, 'select public.start_coffee_run()');
    await fixture.runSqlAs(playerId, 'select public.ask_tom_for_coffee()');
    // The server's clock is the only one that counts: 70 s have passed.
    await fixture.runSql(
      `update public.player_coffee_runs set handed_over_at = now() - interval '70 seconds'
       where player_id = $1`,
      [playerId],
    );
    const before = await fixture.runSql<{ tokens: number }>(
      'select tokens from public.players where id = $1',
      [playerId],
    );

    // The client's own timer can't be passed in: deliver_coffee takes no
    // argument, and writing the hand-over time directly is denied.
    await expect(
      fixture.runSqlAs(playerId, 'select public.deliver_coffee(\'{"secondsLeft": 30}\'::jsonb)'),
    ).rejects.toMatchObject({ code: '42883' });
    await expect(
      fixture.runSqlAs(
        playerId,
        'update public.player_coffee_runs set handed_over_at = now() where player_id = $1',
        [playerId],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      fixture.runSqlAs(playerId, 'select public.deliver_coffee()'),
    ).rejects.toMatchObject({ message: 'coffee_cold' });
    await expect(
      fixture.runSqlAs(playerId, "select public.complete_quest('nicole-coffee')"),
    ).rejects.toMatchObject({ message: 'quest_incomplete' });

    const after = await fixture.runSql<{ tokens: number; delivered: boolean }>(
      `select p.tokens, r.delivered_at is not null as delivered
       from public.players p join public.player_coffee_runs r on r.player_id = p.id
       where p.id = $1`,
      [playerId],
    );
    expect(after.rows).toEqual([{ tokens: before.rows[0].tokens, delivered: false }]);
  });

  it("never touches another Player's coffee run", async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const alice = await fixture.addPlayer('ALICE');
    const bob = await fixture.addPlayer('BOB');

    await fixture.runSqlAs(alice, 'select public.start_coffee_run()');
    await fixture.runSqlAs(alice, 'select public.ask_tom_for_coffee()');

    const bobRun = await fixture.runSqlAs<{ run: Record<string, unknown> }>(
      bob,
      'select public.coffee_run() as run',
    );
    expect(bobRun.rows[0].run).toEqual({
      talkedToNicole: false,
      kitchenVisited: false,
      delivered: false,
      handedOverAt: null,
      secondsLeft: null,
    });
    // Bob's own calls are refused before he talks to Nicole, even though
    // Alice is carrying a cup.
    await expect(fixture.runSqlAs(bob, 'select public.deliver_coffee()')).rejects.toMatchObject({
      message: 'coffee_not_started',
    });
    // RLS: a bare select (no player filter) shows Bob none of Alice's row.
    const visible = await fixture.runSqlAs<{ count: number }>(
      bob,
      'select count(*)::int as count from public.player_coffee_runs',
    );
    expect(visible.rows[0].count).toBe(0);

    const aliceRun = await fixture.runSqlAs<{ run: { secondsLeft: number | null } }>(
      alice,
      'select public.coffee_run() as run',
    );
    expect(aliceRun.rows[0].run.secondsLeft).not.toBeNull();
  });

  it.each([
    "select public.coffee_run_state('00000000-0000-0000-0000-000000000000'::uuid)",
    "select public.quest_steps__nicole_coffee('00000000-0000-0000-0000-000000000000'::uuid)",
    'insert into public.player_coffee_runs (player_id) values (auth.uid())',
  ])('keeps %s closed to a signed-in Player (42501)', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('CLOSED DOOR');

    await expect(fixture.runSqlAs(playerId, sql)).rejects.toMatchObject({ code: '42501' });
  });

  it.each([
    'select public.coffee_run()',
    'select public.start_coffee_run()',
    'select public.mark_kitchen_visited()',
    'select public.ask_tom_for_coffee()',
    'select public.deliver_coffee()',
    'select * from public.player_coffee_runs',
  ])('denies anon: %s rejects with 42501', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('reruns cleanly, keeping its proof and the registry proof passing', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await fixture.execSql(migrationSql('quest-nicole-coffee'));

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
