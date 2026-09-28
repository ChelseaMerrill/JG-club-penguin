/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FEEDBACK_MIGRATION = ['supabase', 'migrations', '20260928010000_feedback.sql'];

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

let db: PGlite | null = null;

afterAll(async () => {
  await db?.close();
  db = null;
});

/**
 * One database per file (as `pglite-progress-store.ts` does), migrated once:
 * the local Supabase stand-in, #9's players, then the feedback migration.
 * Every test uses its own fresh Player, so they don't share rate-limit state.
 */
async function migratedDb(): Promise<PGlite> {
  if (db) return db;
  const fresh = new PGlite();
  await fresh.exec(readRepoFile('supabase', 'tests', 'local-supabase-stub.sql'));
  await fresh.exec(readRepoFile('supabase', 'migrations', '20260924000000_players.sql'));
  await fresh.exec(readRepoFile(...FEEDBACK_MIGRATION));
  db = fresh;
  return db;
}

async function addPlayer(database: PGlite): Promise<string> {
  const id = randomUUID();
  await database.query('insert into auth.users (id) values ($1)', [id]);
  await database.query('insert into public.players (id) values ($1)', [id]);
  return id;
}

async function asPlayer(database: PGlite, playerId: string, sql: string, params: unknown[] = []) {
  return database.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [playerId]);
    await tx.query('set local role authenticated');
    return tx.query(sql, params);
  });
}

async function asAnon(database: PGlite, sql: string, params: unknown[] = []) {
  return database.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', '', true)");
    await tx.query('set local role anon');
    return tx.query(sql, params);
  });
}

const SUBMIT = 'select public.submit_feedback($1, $2, $3, $4) as result';

// The in-game feedback migration against a real Postgres database (PGlite).
// feedback_proof.sql is the proof the reviewer re-runs on real Supabase; the
// cases below are the checks only a raw connection can make.
describe('feedback migration (PGlite)', () => {
  it('feedback_proof.sql passes as an authenticated Player, including the ALL row', async () => {
    const database = await migratedDb();
    const fixture = await addPlayer(database);

    const proofSql = readRepoFile('supabase', 'tests', 'feedback_proof.sql').replace(
      /00000000-0000-0000-0000-00000000f1f0/g,
      fixture,
    );
    const results = await database.exec(proofSql);
    const rows = results.at(-1)!.rows as Array<{
      check_name: string;
      pass: boolean;
      detail: string;
    }>;

    expect(rows.filter((row) => !row.pass)).toEqual([]);
    expect(rows.find((row) => row.check_name === 'ALL')).toMatchObject({ pass: true });
    expect(rows.length).toBeGreaterThan(15);
  });

  it('an authenticated Player submits and gets back { id }', async () => {
    const database = await migratedDb();
    const player = await addPlayer(database);

    const { rows } = await asPlayer(database, player, SUBMIT, [
      'suggestion',
      'Add a hot cocoa stall',
      'roof-deck',
      'test agent',
    ]);

    expect((rows[0] as { result: { id: string } }).result).toEqual({ id: expect.any(String) });
  });

  it('denies anon: submit_feedback rejects with 42501', async () => {
    const database = await migratedDb();

    await expect(asAnon(database, SUBMIT, ['issue', 'hi', null, null])).rejects.toMatchObject({
      code: '42501',
    });
  });

  it.each([
    'select * from public.feedback',
    "insert into public.feedback (player_id, kind, message) values (auth.uid(), 'issue', 'x')",
    'update public.feedback set emailed_at = now()',
    'delete from public.feedback',
  ])('denies an authenticated Player direct table access: %s', async (sql) => {
    const database = await migratedDb();
    const player = await addPlayer(database);

    await expect(asPlayer(database, player, sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('reruns cleanly', async () => {
    const database = await migratedDb();

    await expect(database.exec(readRepoFile(...FEEDBACK_MIGRATION))).resolves.toBeDefined();
  });
});
