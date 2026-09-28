/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getRoomDefinition } from '../game/rooms/registry';
import { FAKE_GUARD_POSTS, FAKE_PHISHING_QUESTIONS } from './fake-data';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION_SQL = readFileSync(
  path.join(REPO_ROOT, 'supabase/migrations/20260928020000_phishing_quiz.sql'),
  'utf8',
);

/** A SQL string literal's text (`''` is one quote). */
function unquote(literal: string): string {
  return literal.slice(1, -1).replace(/''/g, "'");
}

/** The migration's `insert into public.phishing_guard_posts` rows, in position order. */
function seededPosts(): { position: number; roomId: string; doorLabel: string }[] {
  const insert = MIGRATION_SQL.slice(
    MIGRATION_SQL.indexOf('insert into public.phishing_guard_posts'),
  );
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

describe('guard posts', () => {
  it('match the migration seed, in position order', () => {
    const seeded = seededPosts();
    expect(seeded.map((post) => post.position)).toEqual(seeded.map((_, index) => index));
    expect(seeded.map(({ roomId, doorLabel }) => ({ roomId, doorLabel }))).toEqual(
      FAKE_GUARD_POSTS,
    );
  });

  it('name an existing, enabled door of a shared prototype Room for every seeded post', () => {
    for (const { roomId, doorLabel } of seededPosts()) {
      expect(['town-center', 'dev-pit', 'the-melt', 'roof-deck']).toContain(roomId);
      const door = getRoomDefinition(roomId as 'town-center').doors.find(
        (candidate) => candidate.label === doorLabel,
      );
      expect(door, `${roomId} / ${doorLabel}`).toBeDefined();
      expect(door?.targetRoomId, `${roomId} / ${doorLabel} is enabled`).not.toBeNull();
    }
  });

  it('cover every enabled door of Town Center, Dev Pit, The Melt and the Roof Deck, once each', () => {
    const enabled = (['town-center', 'dev-pit', 'the-melt', 'roof-deck'] as const).flatMap(
      (roomId) =>
        getRoomDefinition(roomId)
          .doors.filter((door) => door.targetRoomId !== null)
          .map((door) => `${roomId} / ${door.label}`),
    );
    const seeded = seededPosts().map((post) => `${post.roomId} / ${post.doorLabel}`);
    expect([...seeded].sort()).toEqual([...enabled].sort());
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
