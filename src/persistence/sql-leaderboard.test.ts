// #70: `public.leaderboard` against a real Postgres database (PGlite).
// Test isolation note: `createPgliteLeaderboardFixture`'s database is shared
// across every test in this file (one PGlite instance per file, migrated
// once -- see `pglite-progress-store.ts`). 'bug-squash' and 'pancake-flip'
// are reserved for the small handful of tests below that need a Minigame id
// all to themselves for exact, unbounded rank assertions (the real-
// `record_round` case and each Minigame's own ceiling-boundary case);
// everything else uses 'coffee-rush'/'snow-cone-stand' (no ceiling) with
// scores built relative to `maxBestScore(...)` first (or bounds `max_rows`
// to exactly the rows it created), so a test never depends on running
// before or after any other -- the same live-data-tolerant technique R3's
// hosted proof uses.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isBlankLeaderboardName, LEADERBOARD_SCORE_CEILINGS } from './leaderboard-rules';
import { createPgliteLeaderboardFixture } from './testing/pglite-progress-store';
import { BLANK_NAME_CASES } from './testing/invisible-name-cases';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(currentDir, '../..');
const MIGRATION_TEXT = readFileSync(
  path.join(REPO_ROOT, 'supabase', 'migrations', '20260924020000_leaderboard.sql'),
  'utf8',
);

const BUG_SQUASH_STATS = { score: 0, squashed: 0, bestCombo: 0, escaped: 0 };

describe('public.leaderboard (PGlite)', () => {
  it('A1: ranks named Players by real record_round bests, and marks only the caller is_me', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const alpha = await fixture.addPlayer('ALPHA');
    const bravo = await fixture.addPlayer('BRAVO');
    const charlie = await fixture.addPlayer('CHARLIE');

    // Real `record_round` calls, one per Player (each Player's own timeline
    // is independent, so `round_too_soon` never applies here).
    await fixture.recordRoundAs(alpha, 'bug-squash', 300, { ...BUG_SQUASH_STATS, score: 300 });
    await fixture.recordRoundAs(bravo, 'bug-squash', 200, { ...BUG_SQUASH_STATS, score: 200 });
    await fixture.recordRoundAs(charlie, 'bug-squash', 100, { ...BUG_SQUASH_STATS, score: 100 });

    const rows = await fixture.leaderboardAs(bravo, 'bug-squash');

    expect(rows).toEqual([
      { rank: 1, penguin_name: 'ALPHA', best_score: 300, is_me: false },
      { rank: 2, penguin_name: 'BRAVO', best_score: 200, is_me: true },
      { rank: 3, penguin_name: 'CHARLIE', best_score: 100, is_me: false },
    ]);
  });

  it('A1b: anon is denied with 42501 permission denied for function leaderboard', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    const rejection = fixture.asAnon('select * from public.leaderboard($1)', ['bug-squash']);

    await expect(rejection).rejects.toMatchObject({ code: '42501' });
    await expect(rejection).rejects.toThrow(/permission denied for function leaderboard/);
  });

  it('A1c: a tied best_score ranks whoever reached it first', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const base = await fixture.maxBestScore('snow-cone-stand');
    const early = await fixture.addPlayer('EARLY BIRD');
    const late = await fixture.addPlayer('LATE BIRD');
    const tied = base + 500;
    await fixture.setBestReachedAt(early, 'snow-cone-stand', tied, 120);
    await fixture.setBestReachedAt(late, 'snow-cone-stand', tied, 60);

    // Bound to exactly the 2 rows this test creates: this file's PGlite
    // database is shared across tests, so a default (10-row) call could
    // also surface unrelated eligible rows an earlier test left behind at a
    // lower (but still-eligible) score for this same id.
    const rows = await fixture.leaderboardAs(early, 'snow-cone-stand', 2);

    expect(rows).toEqual([
      { rank: 1, penguin_name: 'EARLY BIRD', best_score: tied, is_me: true },
      { rank: 2, penguin_name: 'LATE BIRD', best_score: tied, is_me: false },
    ]);
  });

  it('A1d: a blank-named Player never appears, even ranked highest', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const base = await fixture.maxBestScore('coffee-rush');
    const named = await fixture.addPlayer('NAMED ONE');
    const unnamed = await fixture.addPlayer('');
    await fixture.setBestReachedAt(named, 'coffee-rush', base + 10, 5);
    // Would rank #1 if not excluded.
    await fixture.setBestReachedAt(unnamed, 'coffee-rush', base + 999, 1);

    // maxRows: 1 -- see the shared-database note above.
    const rows = await fixture.leaderboardAs(named, 'coffee-rush', 1);

    expect(rows).toEqual([
      { rank: 1, penguin_name: 'NAMED ONE', best_score: base + 10, is_me: true },
    ]);
  });

  it("A1d: appends the caller's own row when outside max_rows, and clamps 0/-5 to 1 row", async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const base = await fixture.maxBestScore('coffee-rush');
    const top = await fixture.addPlayer('TOP ONE');
    const second = await fixture.addPlayer('SECOND ONE');
    const caller = await fixture.addPlayer('CALLER ONE');
    await fixture.setBestReachedAt(top, 'coffee-rush', base + 30, 30);
    await fixture.setBestReachedAt(second, 'coffee-rush', base + 20, 20);
    await fixture.setBestReachedAt(caller, 'coffee-rush', base + 10, 10);

    const expected = [
      { rank: 1, penguin_name: 'TOP ONE', best_score: base + 30, is_me: false },
      { rank: 3, penguin_name: 'CALLER ONE', best_score: base + 10, is_me: true },
    ];

    await expect(fixture.leaderboardAs(caller, 'coffee-rush', 1)).resolves.toEqual(expected);
    await expect(fixture.leaderboardAs(caller, 'coffee-rush', 0)).resolves.toEqual(expected);
    await expect(fixture.leaderboardAs(caller, 'coffee-rush', -5)).resolves.toEqual(expected);
  });

  it('A1d: a null max_rows falls back to the default of 10', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const base = await fixture.maxBestScore('coffee-rush');
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const id = await fixture.addPlayer(`NULLCASE ${i}`);
      await fixture.setBestReachedAt(id, 'coffee-rush', base + (200 - i), 200 - i);
      ids.push(id);
    }
    const caller = ids[11]; // lowest score of the 12 -> rank 12, outside the default top 10

    const rows = await fixture.leaderboardAs(caller, 'coffee-rush', null);

    expect(rows.filter((row) => !row.is_me)).toHaveLength(10);
    expect(rows.at(-1)).toMatchObject({ rank: 12, is_me: true });
  });

  it('A1d: clamps a huge max_rows to at most 50', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const base = await fixture.maxBestScore('snow-cone-stand');
    let caller = '';
    for (let i = 0; i < 51; i++) {
      const id = await fixture.addPlayer(`BIGCASE ${i}`);
      await fixture.setBestReachedAt(id, 'snow-cone-stand', base + (1000 - i), 1000 - i);
      if (i === 0) caller = id; // highest score -> rank 1, safely inside any top-N
    }

    const rows = await fixture.leaderboardAs(caller, 'snow-cone-stand', 100_000);

    expect(rows).toHaveLength(50);
    expect(rows[0]).toMatchObject({ rank: 1, is_me: true });
    expect(rows.at(-1)).toMatchObject({ rank: 50 });
  });

  it('A1e: the migration reruns cleanly, leaving minigame_bests RLS untouched (own rows only)', async () => {
    const fixture = await createPgliteLeaderboardFixture();

    await expect(fixture.rerunMigration()).resolves.toBeUndefined();

    // Not `ProgressStore.loadAll()`: every one of its queries already
    // filters by `where player_id = $1` client-side, so it would read only
    // B's own rows even with RLS completely disabled -- proving nothing
    // about RLS itself (red-team round 2, 2026-09-25). This runs a bare
    // `count(*)` with no such filter, as B, so RLS is the only thing that
    // can narrow it.
    const playerA = await fixture.addPlayer('RLS CHECK A');
    const playerB = await fixture.addPlayer('RLS CHECK B');
    // 'coffee-rush' (not 'pancake-flip'/'bug-squash', each reserved above
    // for their own exact-row-count assertions): a plain, uncapped
    // minigame_bests row is all this check needs.
    await fixture.setBestReachedAt(playerA, 'coffee-rush', 1, 1);

    const otherRows = await fixture.runSqlAs<{ count: number }>(
      playerB,
      'select count(*)::int from public.minigame_bests where player_id <> $1',
      [playerB],
    );

    expect(otherRows.rows[0].count).toBe(0);
  });

  it('A1f: 70_leaderboard_proof.sql passes, including the ALL row', async () => {
    const fixture = await createPgliteLeaderboardFixture();
    const fixturePlayerId = await fixture.addPlayer('PROOF FIXTURE');

    const proofSql = readFileSync(
      path.join(REPO_ROOT, 'supabase', 'tests', '70_leaderboard_proof.sql'),
      'utf8',
    ).replace(/00000000-0000-0000-0000-00000000f1f0/g, fixturePlayerId);

    const results = await fixture.execSql<{
      check_name: string;
      pass: boolean;
      detail: string;
    }>(proofSql);
    const rows = results.at(-1)!.rows;

    const failing = rows.filter((row) => !row.pass);
    expect(failing).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
  });

  describe('R1: invisible-only names are treated as blank', () => {
    it('a name made only of zero-width/bidi/format characters is excluded', async () => {
      const fixture = await createPgliteLeaderboardFixture();
      const base = await fixture.maxBestScore('coffee-rush');
      const visible = await fixture.addPlayer('VISIBLE ONE');
      // Zero-width space, soft hyphen, RTL mark, word joiner, BOM: none of
      // these are ASCII whitespace, so #27's own check constraint alone
      // would let this through.
      const invisible = await fixture.addPlayer('​­‏⁠﻿');
      await fixture.setBestReachedAt(visible, 'coffee-rush', base + 5, 5);
      await fixture.setBestReachedAt(invisible, 'coffee-rush', base + 500, 1);

      const rows = await fixture.leaderboardAs(visible, 'coffee-rush', 1);

      expect(rows).toEqual([
        { rank: 1, penguin_name: 'VISIBLE ONE', best_score: base + 5, is_me: true },
      ]);
    });

    // Red-team round 2 (2026-09-25): the SQL char class and the fake's
    // isBlankLeaderboardName must agree, character by character, on every
    // name in this shared list -- including the two round-2 call-outs,
    // three narrow no-break spaces (U+202F) and a supplementary-plane tag
    // space (U+E0020).
    it.each(BLANK_NAME_CASES)(
      'the SQL function and isBlankLeaderboardName agree that $label is blank',
      async ({ name }) => {
        expect(isBlankLeaderboardName(name)).toBe(true);

        const fixture = await createPgliteLeaderboardFixture();
        const base = await fixture.maxBestScore('snow-cone-stand');
        const visible = await fixture.addPlayer('VISIBLE CONTROL');
        const invisible = await fixture.addPlayer(name);
        await fixture.setBestReachedAt(visible, 'snow-cone-stand', base + 5, 5);
        // Would rank #1 if the SQL function didn't also exclude it.
        await fixture.setBestReachedAt(invisible, 'snow-cone-stand', base + 999, 1);

        const rows = await fixture.leaderboardAs(visible, 'snow-cone-stand', 1);

        expect(rows).toEqual([
          { rank: 1, penguin_name: 'VISIBLE CONTROL', best_score: base + 5, is_me: true },
        ]);
      },
    );
  });

  describe('R2: the per-Minigame plausibility ceiling', () => {
    it('excludes a Pancake Flip best just above the ceiling, includes one at it', async () => {
      const fixture = await createPgliteLeaderboardFixture();
      const ceiling = LEADERBOARD_SCORE_CEILINGS['pancake-flip'];
      expect(ceiling).not.toBeNull();
      const atCeiling = await fixture.addPlayer('AT CEILING');
      const overCeiling = await fixture.addPlayer('OVER CEILING');
      await fixture.setBestReachedAt(atCeiling, 'pancake-flip', ceiling as number, 5);
      await fixture.setBestReachedAt(overCeiling, 'pancake-flip', (ceiling as number) + 1, 1);

      const rows = await fixture.leaderboardAs(atCeiling, 'pancake-flip');

      expect(rows).toEqual([
        { rank: 1, penguin_name: 'AT CEILING', best_score: ceiling, is_me: true },
      ]);
    });

    it('excludes a Bug Squash best one point above the ceiling, includes one at it', async () => {
      const fixture = await createPgliteLeaderboardFixture();
      const ceiling = LEADERBOARD_SCORE_CEILINGS['bug-squash'];
      expect(ceiling).not.toBeNull();
      const atCeiling = await fixture.addPlayer('AT CEILING BS');
      const overCeiling = await fixture.addPlayer('OVER CEILING BS');
      await fixture.setBestReachedAt(atCeiling, 'bug-squash', ceiling as number, 5);
      await fixture.setBestReachedAt(overCeiling, 'bug-squash', (ceiling as number) + 1, 1);

      // max_rows: 1 -- 'bug-squash' also carries A1's own small (100-300)
      // scores in this shared database; the ceiling values here (60000/1)
      // always outrank those regardless, but bounding to 1 row keeps this
      // assertion exact without depending on that.
      const rows = await fixture.leaderboardAs(atCeiling, 'bug-squash', 1);

      expect(rows).toEqual([
        { rank: 1, penguin_name: 'AT CEILING BS', best_score: ceiling, is_me: true },
      ]);
    });

    it("the TS LEADERBOARD_SCORE_CEILINGS constant agrees with the migration's SQL case", () => {
      const caseMatch = MIGRATION_TEXT.match(/case v_game([\s\S]*?)else b\.best_score\s*\n\s*end/);
      expect(caseMatch).not.toBeNull();
      const body = caseMatch![1];

      const parsed: Record<string, number> = {};
      const whenRe = /when\s+'([a-z-]+)'\s+then\s+(\d+)/g;
      let match: RegExpExecArray | null;
      while ((match = whenRe.exec(body)) !== null) {
        parsed[match[1]] = Number(match[2]);
      }

      expect(parsed).toEqual({
        'bug-squash': LEADERBOARD_SCORE_CEILINGS['bug-squash'],
        'pancake-flip': LEADERBOARD_SCORE_CEILINGS['pancake-flip'],
      });
      // Every id the SQL `case` doesn't name falls through to `else
      // b.best_score` (a no-op filter); those are exactly the ids whose TS
      // ceiling is `null` ("exclude nothing").
      for (const [id, ceiling] of Object.entries(LEADERBOARD_SCORE_CEILINGS)) {
        if (!(id in parsed)) {
          expect(ceiling).toBeNull();
        }
      }
    });
  });

  describe('A2: the return shape is exactly rank/penguin_name/best_score/is_me', () => {
    it('the function is security definer, search_path-locked, single-overload, authenticated-only', async () => {
      const fixture = await createPgliteLeaderboardFixture();

      const shape = await fixture.runSql<{
        result_columns: string;
        overload_count: number;
        prosecdef: boolean;
        proconfig: string[] | null;
        anon_can_execute: boolean;
        authenticated_can_execute: boolean;
      }>(`
        select
          pg_get_function_result(p.oid) as result_columns,
          (select count(*) from pg_proc p2
             join pg_namespace n2 on n2.oid = p2.pronamespace
           where n2.nspname = 'public' and p2.proname = 'leaderboard') as overload_count,
          p.prosecdef as prosecdef,
          p.proconfig as proconfig,
          has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'leaderboard'
      `);

      expect(shape.rows).toHaveLength(1);
      const row = shape.rows[0];
      expect(row.result_columns).toBe(
        'TABLE(rank integer, penguin_name text, best_score integer, is_me boolean)',
      );
      expect(row.overload_count).toBe(1);
      expect(row.prosecdef).toBe(true);
      expect(row.proconfig).toEqual(['search_path=""']);
      expect(row.anon_can_execute).toBe(false);
      expect(row.authenticated_can_execute).toBe(true);
    });

    it('the store maps exactly the 4 known keys, even when the RPC returns extra ones', async () => {
      // Covered end-to-end for the Supabase store in
      // supabase-progress-store.test.ts (A2); this file's PGlite store maps
      // the same 4 columns off a real query result (testing/pglite-progress-store.ts),
      // which can't return an "extra" column since it selects `select *`
      // from a `returns table (...)` function fixed to exactly these 4.
      const fixture = await createPgliteLeaderboardFixture();
      const player = await fixture.addPlayer('SHAPE CHECK');
      await fixture.setBestReachedAt(
        player,
        'coffee-rush',
        (await fixture.maxBestScore('coffee-rush')) + 1,
        1,
      );

      const rows = await fixture.leaderboardAs(player, 'coffee-rush');

      expect(Object.keys(rows[0]).sort()).toEqual(
        ['best_score', 'is_me', 'penguin_name', 'rank'].sort(),
      );
    });
  });
});
