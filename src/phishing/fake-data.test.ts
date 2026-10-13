/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getRoomDefinition } from '../game/rooms/registry';
import { FAKE_GUARD_POSTS, FAKE_PHISHING_QUESTIONS } from './fake-data';
import { GUARD_ROOM_IDS } from './guard-placement';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');
const MIGRATION_SQL = readFileSync(
  path.join(MIGRATIONS_DIR, '20260928020000_phishing_quiz.sql'),
  'utf8',
);

/**
 * The guard-post seed's insert, anchored at the start of a line (#170 nit):
 * exactly one per migration that seeds the posts.
 */
const GUARD_POST_INSERT =
  /^insert into public\.phishing_guard_posts \(position, room_id, door_label\) values$/gm;

/**
 * The latest migration that seeds `public.phishing_guard_posts` (#170's
 * `20261013000000_door_network_guard_posts.sql`, replacing #146's seed),
 * checking each seeding migration has exactly one anchored insert.
 */
function latestGuardPostMigration(): { file: string; sql: string } {
  const seeding = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8') }))
    .filter(({ sql }) => (sql.match(GUARD_POST_INSERT) ?? []).length > 0);
  for (const { file, sql } of seeding) {
    expect(sql.match(GUARD_POST_INSERT), file).toHaveLength(1);
  }
  return seeding.at(-1)!;
}

/** A SQL string literal's text (`''` is one quote). */
function unquote(literal: string): string {
  return literal.slice(1, -1).replace(/''/g, "'");
}

/** The latest seeding migration's `insert into public.phishing_guard_posts` rows, in position order. */
function seededPosts(): { position: number; roomId: string; doorLabel: string }[] {
  const { sql } = latestGuardPostMigration();
  const insert = sql.slice(sql.search(GUARD_POST_INSERT));
  const values = insert.slice(0, insert.indexOf(';'));
  return [...values.matchAll(/\((\d+), '([^']+)', '([^']+)'\)/g)].map((match) => ({
    position: Number(match[1]),
    roomId: match[2],
    doorLabel: match[3],
  }));
}

/** The migration's `insert into public.phishing_questions` rows, in sort order. */
function seededQuestions() {
  const insert = MIGRATION_SQL.slice(
    MIGRATION_SQL.indexOf('insert into public.phishing_questions'),
  );
  const values = insert.slice(0, insert.indexOf('on conflict'));
  const literal = "'(?:[^']|'')*'";
  const row = new RegExp(
    `\\((${literal}), (\\d+), (${literal}),\\s*(${literal}),\\s*array\\[\\s*(${literal}),\\s*(${literal}),\\s*(${literal}),\\s*(${literal})\\s*\\], (\\d),\\s*(${literal})\\)`,
    'g',
  );
  return [...values.matchAll(row)].map((match) => ({
    id: unquote(match[1]),
    sortOrder: Number(match[2]),
    category: unquote(match[3]),
    prompt: unquote(match[4]),
    choices: [unquote(match[5]), unquote(match[6]), unquote(match[7]), unquote(match[8])],
    correctIndex: Number(match[9]),
    explanation: unquote(match[10]),
  }));
}

/**
 * #146 P3 as amended by #170 (DN4): every enabled in-scene door (not an exit
 * pill, not a locked door) of a Room in `GUARD_ROOM_IDS`, as
 * "<roomId> / <label>".
 */
function guardableDoors(): string[] {
  return GUARD_ROOM_IDS.flatMap((roomId) =>
    getRoomDefinition(roomId)
      .doors.filter((door) => door.targetRoomId !== null && door.kind !== 'pill')
      .map((door) => `${roomId} / ${door.label}`),
  );
}

describe('guard posts', () => {
  it("are seeded by #170's migration, the latest that seeds them", () => {
    expect(latestGuardPostMigration().file).toBe('20261013000000_door_network_guard_posts.sql');
  });

  it('match the migration seed, in position order', () => {
    const seeded = seededPosts();
    expect(seeded.map((post) => post.position)).toEqual(seeded.map((_, index) => index));
    expect(seeded.map(({ roomId, doorLabel }) => ({ roomId, doorLabel }))).toEqual(
      FAKE_GUARD_POSTS,
    );
  });

  it('name an existing, enabled in-scene door of a guard Room for every seeded post, with its own guardTile', () => {
    for (const { roomId, doorLabel } of seededPosts()) {
      expect(GUARD_ROOM_IDS).toContain(roomId);
      const door = getRoomDefinition(roomId as 'town-center').doors.find(
        (candidate) => candidate.label === doorLabel,
      );
      expect(door, `${roomId} / ${doorLabel}`).toBeDefined();
      expect(door?.targetRoomId, `${roomId} / ${doorLabel} is enabled`).not.toBeNull();
      expect(door?.kind, `${roomId} / ${doorLabel} is a door, not a pill`).not.toBe('pill');
      expect(door?.guardTile, `${roomId} / ${doorLabel} has a guardTile`).toBeDefined();
    }
  });

  it('cover every enabled in-scene door of the guard Rooms, once each (DN4)', () => {
    const seeded = seededPosts().map((post) => `${post.roomId} / ${post.doorLabel}`);
    expect(new Set(seeded).size).toBe(seeded.length);
    expect([...seeded].sort()).toEqual(guardableDoors().sort());
  });

  it("match the migration's room_id check to GUARD_ROOM_IDS", () => {
    const { sql } = latestGuardPostMigration();
    const check = sql.match(
      /add constraint phishing_guard_posts_room_id_check\s+check \(room_id in \(([^)]*)\)\)/,
    );
    expect(check, 'the relaxed room_id check').not.toBeNull();
    const rooms = [...check![1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect([...rooms].sort()).toEqual([...GUARD_ROOM_IDS].sort());
  });

  it('never put two neighbouring windows on the two sides of one doorway, including the wrap (DN5)', () => {
    const posts = seededPosts();
    // A door and the door it leads to, in the other guard Room.
    const leadsTo = (a: { roomId: string; doorLabel: string }, b: { roomId: string }) =>
      getRoomDefinition(a.roomId as 'town-center').doors.find((door) => door.label === a.doorLabel)
        ?.targetRoomId === b.roomId;
    posts.forEach((post, index) => {
      const next = posts[(index + 1) % posts.length];
      const sameDoorway = leadsTo(post, next) && leadsTo(next, post);
      expect(sameDoorway, `window ${index} -> ${index + 1}`).toBe(false);
    });
  });

  it('never put two neighbouring windows in the same Room, including the wrap', () => {
    const posts = seededPosts();
    posts.forEach((post, index) => {
      const next = posts[(index + 1) % posts.length];
      expect(next.roomId, `window ${index} -> ${index + 1}`).not.toBe(post.roomId);
    });
  });
});

describe('question bank', () => {
  it("matches the migration seed: the design's 10 questions, choices, answers and explanations", () => {
    const seeded = seededQuestions();
    expect(seeded).toHaveLength(10);
    expect(seeded.map((question) => question.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(
      seeded.map(({ id, category, prompt, choices, correctIndex, explanation }) => ({
        id,
        category,
        prompt,
        choices,
        correctIndex,
        explanation,
      })),
    ).toEqual(FAKE_PHISHING_QUESTIONS);
  });

  it('is unbranded: no KnowBe4 anywhere in the migration or the client', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|css|sql)$/.test(name)) files.push(full);
      }
    };
    walk(path.join(REPO_ROOT, 'src'));
    walk(path.join(REPO_ROOT, 'supabase'));
    const branded = files.filter((file) => /knowbe4/i.test(readFileSync(file, 'utf8')));
    // This test file names the brand only to look for it.
    expect(branded.map((file) => path.relative(REPO_ROOT, file))).toEqual([
      path.join('src', 'phishing', 'fake-data.test.ts'),
    ]);
  });
});
