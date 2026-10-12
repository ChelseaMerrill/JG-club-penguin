import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BADGE_AVAILABILITY_OVERRIDES, BADGE_CATALOG } from './badge-catalog';

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/migrations/20260927000000_badges.sql',
);

interface SeedRow {
  id: string;
  name: string;
  howToEarn: string;
  sortOrder: number;
  available: boolean;
}

const ROW_PATTERN = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(\d+),\s*(true|false)\)/g;

function parseRows(values: string): SeedRow[] {
  const rows: SeedRow[] = [];
  for (const match of values.matchAll(ROW_PATTERN)) {
    rows.push({
      id: match[1],
      name: match[2],
      howToEarn: match[3],
      sortOrder: Number(match[4]),
      available: match[5] === 'true',
    });
  }
  return rows;
}

/** The `insert into public.badges ... values (...)` rows of #138's migration. */
function seedRows(): SeedRow[] {
  const sql = readFileSync(MIGRATION, 'utf8');
  const insert = sql.slice(sql.indexOf('insert into public.badges'));
  const values = insert.slice(0, insert.indexOf('on conflict'));
  return parseRows(values);
}

/**
 * Rows any later migration inserts fresh -- a genuinely new Badge id #138
 * never seeded, unlike every id that migration's `do update` only ever
 * flips `available` on (`BADGE_AVAILABILITY_OVERRIDES`). #219's Passista is
 * the first (`20261012020000_carnaval_parade.sql`): its own `insert into
 * public.badges` sets `available` true directly, so it needs no override.
 */
function laterSeedRows(): SeedRow[] {
  const migrationsDir = path.dirname(MIGRATION);
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql') && file > path.basename(MIGRATION))
    .sort();
  const rows: SeedRow[] = [];
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    const index = sql.indexOf('insert into public.badges');
    if (index === -1) continue;
    const insert = sql.slice(index);
    const end = insert.search(/\bon conflict\b/);
    const values = end === -1 ? insert : insert.slice(0, end);
    rows.push(...parseRows(values));
  }
  return rows;
}

describe('BADGE_CATALOG', () => {
  it("matches the original migration's 15-row seed, plus any later migration's own fresh badge insert, on id, name, order and how-to-earn line", () => {
    const seed = seedRows();
    expect(seed).toHaveLength(15);

    const allSeedRows = [...seed, ...laterSeedRows()];
    expect(
      BADGE_CATALOG.map(({ id, name, howToEarn, sortOrder }) => ({
        id,
        name,
        howToEarn,
        sortOrder,
      })),
    ).toEqual(
      allSeedRows.map(({ id, name, howToEarn, sortOrder }) => ({ id, name, howToEarn, sortOrder })),
    );
  });

  it("keeps each available flag equal to its own seed row (original, or a later migration's own fresh insert) unless a later issue's migration turned it on", () => {
    const seed = new Map([...seedRows(), ...laterSeedRows()].map((row) => [row.id, row.available]));

    for (const badge of BADGE_CATALOG) {
      const expected = BADGE_AVAILABILITY_OVERRIDES.has(badge.id) ? true : seed.get(badge.id);
      expect({ id: badge.id, available: badge.available }).toEqual({
        id: badge.id,
        available: expected,
      });
    }
  });

  it('backs every availability override with a later migration that turns that Badge on', () => {
    const migrationsDir = path.dirname(MIGRATION);
    const laterSql = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql') && file > path.basename(MIGRATION))
      .map((file) => readFileSync(path.join(migrationsDir, file), 'utf8'))
      .join('\n');

    for (const badgeId of BADGE_AVAILABILITY_OVERRIDES) {
      expect({
        badgeId,
        turnedOn: laterSql.includes(
          `update public.badges set available = true where id = '${badgeId}';`,
        ),
      }).toEqual({ badgeId, turnedOn: true });
    }
    expect([...BADGE_AVAILABILITY_OVERRIDES]).toContain('let-it-rip');
  });

  it('seeds the four Minigame Badges and the four #138 Badges available, and the rest coming soon', () => {
    const available = seedRows()
      .filter((row) => row.available)
      .map((row) => row.id);

    expect(available.sort()).toEqual(
      [
        'barista',
        'brain-freeze',
        'breakfast-club',
        'exterminator',
        'first-waddle',
        'interior-penguin',
        'night-owl',
        'ship-it',
      ].sort(),
    );
  });
});
