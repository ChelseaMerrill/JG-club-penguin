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

// The Igloo Badge Quest migration (20261006010000_quest_igloo_badge.sql, #143)
// against a real Postgres database (PGlite), migrated through every migration
// in timestamp order. The proof file is what the reviewer re-runs on real
// Postgres/Supabase; the rest are checks a raw connection makes as a signed-in
// Player or anon.
describe('Igloo Badge Quest migration (PGlite)', { timeout: 30_000 }, () => {
  async function runProof(): Promise<Array<{ check_name: string; pass: boolean; detail: string }>> {
    const fixture = await createPgliteLeaderboardFixture();
    const proofSql = readRepoFile('supabase', 'tests', 'quest_igloo_badge_proof.sql').replace(
      FIXTURE_PLACEHOLDER,
      await fixture.addPlayer('PROOF FIXTURE'),
    );
    const results = await fixture.execSql<{ check_name: string; pass: boolean; detail: string }>(
      proofSql,
    );
    return results.at(-1)!.rows;
  }

  it('quest_igloo_badge_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const rows = await runProof();

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.map((row) => row.check_name)).toEqual(
      expect.arrayContaining([
        'registry_seeds_igloo_badge_75_with_steps_function',
        'refuses_before_any_step',
        'talk_keeps_first_time',
        'reports_talk_only_so_far',
        'a_non_award_item_does_not_count',
        'buying_a_jg_award_counts',
        'refuses_while_not_yet_hung',
        'floor_slot_rejects_an_award_outright',
        'hanging_on_a_wall_slot_counts',
        'pays_75_once_no_badge',
        'second_call_pays_nothing',
        'talk_is_scoped_to_the_caller',
        'earlier_purchase_and_slot_are_credited_immediately',
        'anon_denied_mark_casey_talked',
        'anon_denied_quest_steps__igloo_badge',
        'functions_security_definer_search_path_locked',
        'mark_casey_talked_executable_by_authenticated_only',
      ]),
    );
  });

  it.each([
    'select public.mark_casey_talked()',
    "select public.quest_steps__igloo_badge('00000000-0000-0000-0000-000000000000'::uuid)",
  ])('denies anon: %s rejects with 42501', async (sql) => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.asAnon(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps quest_steps__igloo_badge closed to a signed-in Player (42501)', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const playerId = await fixture.addPlayer('CLOSED DOOR');

    await expect(
      fixture.runSqlAs(
        playerId,
        "select public.quest_steps__igloo_badge('00000000-0000-0000-0000-000000000000'::uuid)",
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('reruns cleanly, keeping the proof passing', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await fixture.execSql(migrationSql('quest-igloo-badge'));

    const rows = await runProof();
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
  });
});
