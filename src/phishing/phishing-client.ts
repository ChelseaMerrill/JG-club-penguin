import type { BadgeId, RoomId } from '../contracts';

/**
 * The Phishing Quiz (#146): Anthony Conway guards one door of one shared
 * prototype Room at a time and asks each Player a security question before
 * they may pass. Every rule lives on the server
 * (`supabase/migrations/20260928020000_phishing_quiz.sql`, decisions P1-P15);
 * `PhishingClient` is the client's view of its five RPCs. The Supabase
 * implementation calls them; the in-memory fake mirrors their rules for unit
 * tests and the dev/e2e hooks.
 *
 * No result type here has a field for the correct choice: the server never
 * sends it (P8), and `phishing-client.test.ts` checks the fake doesn't either.
 */

/** Seconds on the quiz timer (P6). */
export const PHISHING_SECONDS = 20;
/** The server's grace on top of `PHISHING_SECONDS` before an answer is late (P6). */
export const PHISHING_GRACE_SECONDS = 3;
/** Tokens a correct answer pays, within the daily cap (P6, P7). */
export const PHISHING_TOKENS_PER_CORRECT = 10;
/** Paid correct answers per Player per America/New_York day (P7). */
export const PHISHING_DAILY_CAP = 10;
/** Correct answers in a row for Phish Fry (P11). */
export const PHISH_FRY_STREAK = 10;
/** Counted Map bypasses that lock the Map (P10). */
export const PHISHING_BYPASS_LIMIT = 5;
/** Correct answers in Security Training that give the Map back (P10). */
export const SECURITY_TRAINING_REQUIRED = 3;
/** How long Anthony guards one post (P3). */
export const GUARD_WINDOW_SECONDS = 600;
/** The NPC who guards the door (`src/npcs/npcs.ts`). */
export const GUARD_NPC_ID = 'anthony';

/** A guard post: one enabled door of one shared prototype Room (P3). */
export interface GuardPost {
  roomId: RoomId;
  doorLabel: string;
}

/** `phishing_guard_now()`: where Anthony stands, and for how long (P3, P4). */
export interface GuardWindow extends GuardPost {
  /** ISO timestamps from the server's clock. */
  windowStart: string;
  windowEnd: string;
  serverNow: string;
}

export type PhishingMode = 'guard' | 'training';

/** `start_phishing_challenge()` (P5): a question and its four choices, A-D. */
export interface PhishingChallenge {
  challengeId: string;
  questionId: string;
  category: string;
  prompt: string;
  choices: [string, string, string, string];
  secondsLeft: number;
  mode: PhishingMode;
}

/** `phishing_state()` (P12). */
export interface PhishingState {
  locked: boolean;
  bypassCount: number;
  trainingCorrect: number;
  streak: number;
  dailyCorrect: number;
  passedGuardWindow: boolean;
}

/** `answer_phishing_question()` (P6). */
export interface PhishingAnswerResult extends PhishingState {
  correct: boolean;
  explanation: string;
  tokensAwarded: number;
  balance: number;
  badgesEarned: BadgeId[];
}

/** `record_map_bypass()` (P9). */
export interface PhishingBypassResult extends PhishingState {
  counted: boolean;
}

/** A choice index, 0-3 for A-D, or `null` when the timer ran out. */
export type PhishingChoice = 0 | 1 | 2 | 3 | null;

export interface PhishingClient {
  guardNow(): Promise<GuardWindow>;
  state(): Promise<PhishingState>;
  startChallenge(): Promise<PhishingChallenge>;
  answer(challengeId: string, choice: PhishingChoice): Promise<PhishingAnswerResult>;
  recordMapBypass(roomId: RoomId): Promise<PhishingBypassResult>;
}

/** The state a Player with no quiz history has (P12). */
export const DEFAULT_PHISHING_STATE: PhishingState = {
  locked: false,
  bypassCount: 0,
  trainingCorrect: 0,
  streak: 0,
  dailyCorrect: 0,
  passedGuardWindow: false,
};

/**
 * The guard window for `nowMs` over `posts` (P3): post index
 * floor(epoch seconds / 600) mod count, the same math as
 * `public.phishing_guard_at`. The fake uses it; the real client asks the
 * server instead and never holds the post list.
 */
export function guardWindowAt(posts: readonly GuardPost[], nowMs: number): GuardWindow {
  if (posts.length === 0) throw new Error('no_guard_posts');
  const windowMs = GUARD_WINDOW_SECONDS * 1000;
  const slot = Math.floor(nowMs / windowMs);
  const index = ((slot % posts.length) + posts.length) % posts.length;
  const start = slot * windowMs;
  return {
    ...posts[index],
    windowStart: new Date(start).toISOString(),
    windowEnd: new Date(start + windowMs).toISOString(),
    serverNow: new Date(nowMs).toISOString(),
  };
}

/** Milliseconds until `window` ends, by the server's own clock (never negative). */
export function msUntilWindowEnd(window: GuardWindow): number {
  return Math.max(0, Date.parse(window.windowEnd) - Date.parse(window.serverNow));
}
