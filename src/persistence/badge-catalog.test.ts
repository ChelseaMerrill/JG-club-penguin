import { readFileSync } from 'node:fs';
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

/** The `insert into public.badges ... values (...)` rows of #138's migration. */
function seedRows(): SeedRow[] {
  const sql = readFileSync(MIGRATION, 'utf8');
  const insert = sql.slice(sql.indexOf('insert into public.badges'));
  const values = insert.slice(0, insert.indexOf('on conflict'));
  const rows: SeedRow[] = [];
  const rowPattern = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(\d+),\s*(true|false)\)/g;
  for (const match of values.matchAll(rowPattern)) {
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

describe('BADGE_CATALOG', () => {
  it("matches the migration's seed on id, name, order and how-to-earn line", () => {
    const seed = seedRows();

    expect(seed).toHaveLength(15);
    expect(
      BADGE_CATALOG.map(({ id, name, howToEarn, sortOrder }) => ({
        id,
        name,
        howToEarn,
        sortOrder,
      })),
    ).toEqual(
      seed.map(({ id, name, howToEarn, sortOrder }) => ({ id, name, howToEarn, sortOrder })),
    );
  });

  it("keeps each available flag equal to the seed unless a later issue's migration turned it on", () => {
    const seed = new Map(seedRows().map((row) => [row.id, row.available]));

    for (const badge of BADGE_CATALOG) {
      const expected = BADGE_AVAILABILITY_OVERRIDES.has(badge.id) ? true : seed.get(badge.id);
      expect({ id: badge.id, available: badge.available }).toEqual({
        id: badge.id,
        available: expected,
      });
    }
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
