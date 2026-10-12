import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BADGE_AVAILABILITY_OVERRIDES, BADGE_CATALOG } from './badge-catalog';

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/migrations/20260927000000_badges.sql',
);

/** #220: Goleador's own migration, which inserts it fresh (see `BADGE_CATALOG`'s own comment). */
const PENALTY_KICK_MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/migrations/20261012010000_penalty_kick.sql',
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
  it("matches the migration's seed on id, name, order and how-to-earn line (the first 15, Goleador excepted)", () => {
    const seed = seedRows();

    expect(seed).toHaveLength(15);
    expect(
      BADGE_CATALOG.filter((badge) => badge.id !== 'goleador').map(
        ({ id, name, howToEarn, sortOrder }) => ({ id, name, howToEarn, sortOrder }),
      ),
    ).toEqual(
      seed.map(({ id, name, howToEarn, sortOrder }) => ({ id, name, howToEarn, sortOrder })),
    );
  });

  it("Goleador matches its own migration's fresh insert (#220, beyond the original 15)", () => {
    const sql = readFileSync(PENALTY_KICK_MIGRATION, 'utf8');
    expect(sql).toContain("'goleador', 'Goleador', 'SCORE 4 OF 5 PENALTIES', 16, true");

    const goleador = BADGE_CATALOG.find((badge) => badge.id === 'goleador');
    expect(goleador).toEqual({
      id: 'goleador',
      name: 'Goleador',
      howToEarn: 'SCORE 4 OF 5 PENALTIES',
      sortOrder: 16,
      available: true,
    });
  });

  it("keeps each available flag equal to the seed unless a later issue's migration turned it on", () => {
    const seed = new Map(seedRows().map((row) => [row.id, row.available]));

    for (const badge of BADGE_CATALOG) {
      // #220: Goleador isn't in the original 15-row seed at all -- it's
      // inserted fresh, already available, by its own migration (see the
      // dedicated test above) rather than flipped on later.
      if (badge.id === 'goleador') continue;
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
