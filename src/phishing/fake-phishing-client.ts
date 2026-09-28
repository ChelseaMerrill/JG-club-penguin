import type { BadgeId, RoomId } from '../contracts';
import { FAKE_GUARD_POSTS, FAKE_PHISHING_QUESTIONS, type FakePhishingQuestion } from './fake-data';
import {
  PHISHING_BYPASS_LIMIT,
  PHISHING_DAILY_CAP,
  PHISHING_GRACE_SECONDS,
  PHISHING_SECONDS,
  PHISHING_TOKENS_PER_CORRECT,
  PHISH_FRY_STREAK,
  SECURITY_TRAINING_REQUIRED,
  guardWindowAt,
  type GuardPost,
  type PhishingAnswerResult,
  type PhishingBypassResult,
  type PhishingChallenge,
  type PhishingChoice,
  type PhishingClient,
  type PhishingMode,
  type PhishingState,
} from './phishing-client';

/** The Badge bonus #138's `award_badge` pays the first time. */
const BADGE_BONUS = 50;

export interface FakePhishingClientOptions {
  /** The fake server's clock (ms since the epoch). Defaults to `Date.now`. */
  now?: () => number;
  /** Picks among unseen questions. Defaults to `Math.random`. */
  random?: () => number;
  /** The Player's Token balance before any answer. Defaults to 0. */
  initialBalance?: number;
  posts?: readonly GuardPost[];
  questions?: readonly FakePhishingQuestion[];
}

/** Test-only reach into the fake server, standing in for what a proof reads as postgres. */
export interface FakePhishingControls {
  /** The correct choice of `challengeId`'s question, or `null` for an unknown challenge. */
  correctChoiceFor(challengeId: string): 0 | 1 | 2 | 3 | null;
  /** The currently open challenge's id, if any. */
  openChallengeId(): string | null;
}

interface FakeChallenge {
  id: string;
  question: FakePhishingQuestion;
  mode: PhishingMode;
  windowStart: string | null;
  startedAtMs: number;
  outcome: 'correct' | 'wrong' | 'timeout' | null;
  answeredAtMs: number | null;
  paid: boolean;
}

/** The America/New_York calendar day of `ms`, as YYYY-MM-DD (P7). */
function newYorkDay(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

/**
 * The in-memory `PhishingClient` (#146): one Player, the same rules as
 * `20260928020000_phishing_quiz.sql` (P3-P12), for unit tests and the
 * dev/e2e hooks. `controls` is the test-only view a proof gets as postgres.
 */
export function createFakePhishingClient(options: FakePhishingClientOptions = {}): {
  client: PhishingClient;
  controls: FakePhishingControls;
} {
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? Math.random;
  const posts = options.posts ?? FAKE_GUARD_POSTS;
  const questions = options.questions ?? FAKE_PHISHING_QUESTIONS;

  let balance = options.initialBalance ?? 0;
  const badges = new Set<BadgeId>();
  let streak = 0;
  let bypassCount = 0;
  let locked = false;
  let trainingCorrect = 0;
  let seen: string[] = [];
  let nextId = 1;
  const challenges = new Map<string, FakeChallenge>();

  function currentWindowStart(): string {
    return guardWindowAt(posts, now()).windowStart;
  }

  function dailyCorrect(): number {
    const today = newYorkDay(now());
    return [...challenges.values()].filter(
      (c) => c.outcome === 'correct' && c.paid && newYorkDay(c.answeredAtMs!) === today,
    ).length;
  }

  function guardChallengesThisWindow(): FakeChallenge[] {
    const windowStart = currentWindowStart();
    return [...challenges.values()].filter(
      (c) => c.mode === 'guard' && c.windowStart === windowStart,
    );
  }

  function passedGuardWindow(): boolean {
    return guardChallengesThisWindow().some((c) => c.outcome === 'correct');
  }

  function snapshot(): PhishingState {
    return {
      locked,
      bypassCount,
      trainingCorrect,
      streak,
      dailyCorrect: dailyCorrect(),
      passedGuardWindow: passedGuardWindow(),
    };
  }

  function pickQuestion(): FakePhishingQuestion {
    let pool = questions.filter((q) => !seen.includes(q.id));
    if (pool.length === 0) {
      const last = seen[seen.length - 1];
      seen = [];
      pool = questions.filter((q) => q.id !== last);
    }
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  }

  const client: PhishingClient = {
    async guardNow() {
      return guardWindowAt(posts, now());
    },

    async state() {
      return snapshot();
    },

    async startChallenge(): Promise<PhishingChallenge> {
      // P5: an open challenge closes as a timeout, which resets the streak.
      for (const open of challenges.values()) {
        if (open.outcome === null) {
          open.outcome = 'timeout';
          open.answeredAtMs = now();
          streak = 0;
        }
      }
      const question = pickQuestion();
      seen = [...seen, question.id];
      const mode: PhishingMode = locked ? 'training' : 'guard';
      const challenge: FakeChallenge = {
        id: `fake-challenge-${nextId++}`,
        question,
        mode,
        windowStart: mode === 'guard' ? currentWindowStart() : null,
        startedAtMs: now(),
        outcome: null,
        answeredAtMs: null,
        paid: false,
      };
      challenges.set(challenge.id, challenge);
      return {
        challengeId: challenge.id,
        questionId: question.id,
        category: question.category,
        prompt: question.prompt,
        choices: [...question.choices],
        secondsLeft: PHISHING_SECONDS,
        mode,
      };
    },

    async answer(challengeId: string, choice: PhishingChoice): Promise<PhishingAnswerResult> {
      if (choice !== null && (choice < 0 || choice > 3)) throw new Error('invalid_choice');
      const challenge = challenges.get(challengeId);
      if (!challenge) throw new Error('unknown_challenge');
      if (challenge.outcome !== null) throw new Error('challenge_closed');

      const late =
        now() - challenge.startedAtMs > (PHISHING_SECONDS + PHISHING_GRACE_SECONDS) * 1000;
      const outcome =
        choice === null || late
          ? 'timeout'
          : choice === challenge.question.correctIndex
            ? 'correct'
            : 'wrong';
      const correct = outcome === 'correct';

      let tokensAwarded = 0;
      const badgesEarned: BadgeId[] = [];
      if (correct) {
        tokensAwarded = dailyCorrect() < PHISHING_DAILY_CAP ? PHISHING_TOKENS_PER_CORRECT : 0;
        streak += 1;
        if (locked) {
          trainingCorrect += 1;
          if (trainingCorrect >= SECURITY_TRAINING_REQUIRED) {
            locked = false;
            trainingCorrect = 0;
            bypassCount = 0;
          }
        } else {
          bypassCount = 0;
        }
      } else {
        streak = 0;
      }

      challenge.outcome = outcome;
      challenge.answeredAtMs = now();
      challenge.paid = tokensAwarded > 0;

      if (correct && streak >= PHISH_FRY_STREAK && !badges.has('phish-fry')) {
        badges.add('phish-fry');
        balance += BADGE_BONUS;
        badgesEarned.push('phish-fry');
      }
      balance += tokensAwarded;

      return {
        correct,
        explanation: challenge.question.explanation,
        tokensAwarded,
        balance,
        ...snapshot(),
        badgesEarned,
      };
    },

    async recordMapBypass(roomId: RoomId): Promise<PhishingBypassResult> {
      const guard = guardWindowAt(posts, now());
      const counted =
        !locked &&
        guard.roomId === roomId &&
        guardChallengesThisWindow().length > 0 &&
        !passedGuardWindow();
      if (counted) {
        bypassCount = Math.min(bypassCount + 1, PHISHING_BYPASS_LIMIT);
        locked = bypassCount >= PHISHING_BYPASS_LIMIT;
        trainingCorrect = 0;
      }
      return { ...snapshot(), counted };
    },
  };

  return {
    client,
    controls: {
      correctChoiceFor(challengeId) {
        return challenges.get(challengeId)?.question.correctIndex ?? null;
      },
      openChallengeId() {
        for (const challenge of challenges.values()) {
          if (challenge.outcome === null) return challenge.id;
        }
        return null;
      },
    },
  };
}
