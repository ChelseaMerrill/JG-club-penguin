import { describe, expect, it } from 'vitest';
import { FAKE_GUARD_POSTS } from './fake-data';
import { createFakePhishingClient } from './fake-phishing-client';
import {
  guardWindowAt,
  msUntilWindowEnd,
  type PhishingAnswerResult,
  type PhishingChoice,
} from './phishing-client';

/** 2026-09-28 14:00:00 UTC (10:00 in New York), a window boundary. */
const T0 = Date.UTC(2026, 8, 28, 14, 0, 0);

function setup(startMs = T0) {
  let nowMs = startMs;
  const fake = createFakePhishingClient({ now: () => nowMs, random: () => 0 });
  return {
    ...fake,
    advance(ms: number) {
      nowMs += ms;
    },
    setNow(ms: number) {
      nowMs = ms;
    },
  };
}

type Fake = ReturnType<typeof setup>;

/** Starts a challenge and answers it: right, wrong, timed out (null) or late. */
async function play(
  fake: Fake,
  how: 'correct' | 'wrong' | 'timeout' | 'late',
): Promise<PhishingAnswerResult> {
  const challenge = await fake.client.startChallenge();
  const right = fake.controls.correctChoiceFor(challenge.challengeId)!;
  let choice: PhishingChoice = null;
  if (how === 'correct') choice = right;
  if (how === 'wrong') choice = ((right + 1) % 4) as PhishingChoice;
  if (how === 'late') {
    choice = right;
    fake.advance(24_000);
  }
  return fake.client.answer(challenge.challengeId, choice);
}

describe('guardWindowAt (the schedule)', () => {
  it('puts post 0 at the epoch and moves one post every 600 s, wrapping after the last', () => {
    expect(guardWindowAt(FAKE_GUARD_POSTS, 0)).toMatchObject({
      roomId: 'town-center',
      doorLabel: 'THE ICEBOX',
      windowStart: '1970-01-01T00:00:00.000Z',
      windowEnd: '1970-01-01T00:10:00.000Z',
    });
    expect(guardWindowAt(FAKE_GUARD_POSTS, 599_999)).toMatchObject({ doorLabel: 'THE ICEBOX' });
    expect(guardWindowAt(FAKE_GUARD_POSTS, 600_000)).toMatchObject({
      roomId: 'dev-pit',
      doorLabel: 'THE ICEBOX',
    });
    expect(guardWindowAt(FAKE_GUARD_POSTS, 7 * 600_000)).toMatchObject({
      roomId: 'roof-deck',
      doorLabel: 'KITCHEN',
    });
    expect(guardWindowAt(FAKE_GUARD_POSTS, 8 * 600_000 + 1)).toMatchObject({
      roomId: 'town-center',
      doorLabel: 'THE ICEBOX',
    });
  });

  it('keeps one post for a whole window at a fixed time, and reports when it ends', () => {
    const window = guardWindowAt(FAKE_GUARD_POSTS, T0 + 125_000);
    expect(window.windowStart).toBe('2026-09-28T14:00:00.000Z');
    expect(window.windowEnd).toBe('2026-09-28T14:10:00.000Z');
    expect(window.serverNow).toBe('2026-09-28T14:02:05.000Z');
    expect(msUntilWindowEnd(window)).toBe(475_000);
    expect(guardWindowAt(FAKE_GUARD_POSTS, T0 + 599_000)).toMatchObject({
      roomId: window.roomId,
      doorLabel: window.doorLabel,
    });
  });

  it('gives two clients on the same clock the same post', async () => {
    const one = setup(T0 + 1_000);
    const two = setup(T0 + 1_000);
    expect(await one.client.guardNow()).toEqual(await two.client.guardNow());
  });
});

describe('the fake PhishingClient', () => {
  it('starts with the default state and a guard challenge of four choices and no answer', async () => {
    const fake = setup();
    expect(await fake.client.state()).toEqual({
      locked: false,
      bypassCount: 0,
      trainingCorrect: 0,
      streak: 0,
      dailyCorrect: 0,
      passedGuardWindow: false,
    });
    const challenge = await fake.client.startChallenge();
    expect(Object.keys(challenge).sort()).toEqual([
      'category',
      'challengeId',
      'choices',
      'mode',
      'prompt',
      'questionId',
      'secondsLeft',
    ]);
    expect(challenge).toMatchObject({ mode: 'guard', secondsLeft: 20 });
    expect(challenge.choices).toHaveLength(4);
  });

  it('pays 10 for a correct answer and passes the window; wrong, timeout and late pay 0 and reset the streak', async () => {
    const fake = setup();
    const right = await play(fake, 'correct');
    expect(right).toMatchObject({
      correct: true,
      tokensAwarded: 10,
      balance: 10,
      streak: 1,
      dailyCorrect: 1,
      passedGuardWindow: true,
      badgesEarned: [],
    });
    expect(right.explanation.length).toBeGreaterThan(0);

    expect(await play(fake, 'wrong')).toMatchObject({
      correct: false,
      tokensAwarded: 0,
      streak: 0,
    });
    expect(await play(fake, 'timeout')).toMatchObject({ correct: false, tokensAwarded: 0 });
    expect(await play(fake, 'late')).toMatchObject({
      correct: false,
      tokensAwarded: 0,
      balance: 10,
    });
  });

  it('rejects a second answer to the same challenge, and closes an open one on the next start', async () => {
    const fake = setup();
    const first = await fake.client.startChallenge();
    await fake.client.startChallenge();
    await expect(fake.client.answer(first.challengeId, 0)).rejects.toThrow('challenge_closed');
    await expect(fake.client.answer('nope', 0)).rejects.toThrow('unknown_challenge');
  });

  it('never repeats a question until all 10 have been asked', async () => {
    const fake = setup();
    const ids: string[] = [];
    for (let i = 0; i < 11; i += 1) ids.push((await fake.client.startChallenge()).questionId);
    expect(new Set(ids.slice(0, 10)).size).toBe(10);
    expect(ids[10]).not.toBe(ids[9]);
  });

  it('stops paying after 10 correct answers in a New York day and pays again the next day', async () => {
    const fake = setup();
    const results: PhishingAnswerResult[] = [];
    for (let i = 0; i < 11; i += 1) results.push(await play(fake, 'correct'));
    expect(results.map((result) => result.tokensAwarded)).toEqual([
      10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 0,
    ]);
    expect(results[10]).toMatchObject({ correct: true, dailyCorrect: 10 });

    // 2026-09-29 04:30 UTC is still 2026-09-29 00:30 in New York: a new day.
    fake.setNow(Date.UTC(2026, 8, 29, 4, 30));
    expect(await play(fake, 'correct')).toMatchObject({ tokensAwarded: 10, dailyCorrect: 1 });
  });

  it('keeps 03:59 UTC on the previous New York day', async () => {
    const fake = setup(Date.UTC(2026, 8, 28, 16, 0));
    for (let i = 0; i < 10; i += 1) await play(fake, 'correct');
    // 2026-09-29 03:59 UTC is 23:59 on 2026-09-28 in New York (EDT).
    fake.setNow(Date.UTC(2026, 8, 29, 3, 59));
    expect(await play(fake, 'correct')).toMatchObject({ tokensAwarded: 0 });
  });

  it('awards Phish Fry once, at 10 in a row, with +50', async () => {
    const fake = setup();
    const results: PhishingAnswerResult[] = [];
    for (let i = 0; i < 10; i += 1) results.push(await play(fake, 'correct'));
    expect(results[9]).toMatchObject({ streak: 10, badgesEarned: ['phish-fry'], balance: 150 });
    expect(results.slice(0, 9).every((result) => result.badgesEarned.length === 0)).toBe(true);

    await play(fake, 'wrong');
    fake.setNow(Date.UTC(2026, 8, 30, 14, 0));
    let last: PhishingAnswerResult | undefined;
    for (let i = 0; i < 10; i += 1) last = await play(fake, 'correct');
    expect(last).toMatchObject({ streak: 10, badgesEarned: [] });
  });

  it('counts a Map bypass only from the guarded Room, when challenged and not passed', async () => {
    const fake = setup();
    const { roomId } = await fake.client.guardNow();
    const elsewhere = roomId === 'the-melt' ? 'dev-pit' : 'the-melt';

    expect(await fake.client.recordMapBypass(roomId)).toMatchObject({ counted: false });

    await fake.client.startChallenge(); // open
    expect(await fake.client.recordMapBypass(elsewhere)).toMatchObject({ counted: false });
    expect(await fake.client.recordMapBypass(roomId)).toMatchObject({
      counted: true,
      bypassCount: 1,
    });

    await play(fake, 'wrong');
    expect(await fake.client.recordMapBypass(roomId)).toMatchObject({
      counted: true,
      bypassCount: 2,
    });

    const passed = await play(fake, 'correct');
    expect(passed).toMatchObject({ bypassCount: 0, passedGuardWindow: true });
    expect(await fake.client.recordMapBypass(roomId)).toMatchObject({
      counted: false,
      bypassCount: 0,
    });

    // The next window: a new post, not yet challenged or passed.
    fake.advance(600_000);
    expect(await fake.client.state()).toMatchObject({ passedGuardWindow: false });
  });

  it('locks the Map at 5 bypasses and unlocks after 3 correct training answers', async () => {
    const fake = setup();
    const { roomId } = await fake.client.guardNow();
    await play(fake, 'timeout');
    const bypasses = [];
    for (let i = 0; i < 6; i += 1) bypasses.push(await fake.client.recordMapBypass(roomId));
    expect(bypasses[3]).toMatchObject({ bypassCount: 4, locked: false });
    expect(bypasses[4]).toMatchObject({ counted: true, bypassCount: 5, locked: true });
    expect(bypasses[5]).toMatchObject({ counted: false, bypassCount: 5 });
    expect(await fake.client.state()).toMatchObject({ locked: true, trainingCorrect: 0 });

    expect((await fake.client.startChallenge()).mode).toBe('training');
    expect(await play(fake, 'correct')).toMatchObject({
      locked: true,
      trainingCorrect: 1,
      tokensAwarded: 10,
      bypassCount: 5,
    });
    expect(await play(fake, 'wrong')).toMatchObject({ locked: true, trainingCorrect: 1 });
    expect(await play(fake, 'correct')).toMatchObject({ locked: true, trainingCorrect: 2 });
    expect(await play(fake, 'correct')).toMatchObject({
      locked: false,
      trainingCorrect: 0,
      bypassCount: 0,
      passedGuardWindow: false,
    });
    expect((await fake.client.startChallenge()).mode).toBe('guard');
  });

  it('never puts a correct-choice field in any result it returns', async () => {
    const fake = setup();
    const { roomId } = await fake.client.guardNow();
    const seen: unknown[] = [
      await fake.client.guardNow(),
      await fake.client.state(),
      await fake.client.startChallenge(),
      await play(fake, 'wrong'),
      await fake.client.recordMapBypass(roomId),
    ];
    for (const result of seen) {
      expect(JSON.stringify(result)).not.toMatch(/correct_?index|correct_?choice|"answer"/i);
    }
  });
});
