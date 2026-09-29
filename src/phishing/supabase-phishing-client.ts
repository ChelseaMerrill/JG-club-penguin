import type { SupabaseClient } from '@supabase/supabase-js';
import type { BadgeId, RoomId } from '../contracts';
import type {
  GuardWindow,
  PhishingAnswerResult,
  PhishingBypassResult,
  PhishingChallenge,
  PhishingChoice,
  PhishingClient,
  PhishingMode,
  PhishingState,
} from './phishing-client';

export type PhishingRpcName =
  | 'phishing_guard_now'
  | 'phishing_state'
  | 'start_phishing_challenge'
  | 'answer_phishing_question'
  | 'record_map_bypass';

/** The one `SupabaseClient` call this file needs, narrowed (as `toProgressClient` does). */
export interface PhishingRpcClient {
  rpc(
    fn: PhishingRpcName,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function toPhishingRpcClient(client: SupabaseClient): PhishingRpcClient {
  return {
    rpc: (fn, args) => client.rpc(fn, args),
  };
}

type Raw = Record<string, unknown>;

function asObject(data: unknown): Raw {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('invalid_response');
  }
  return data as Raw;
}

function num(raw: Raw, key: string): number {
  const value = raw[key];
  if (typeof value !== 'number') throw new Error('invalid_response');
  return value;
}

function bool(raw: Raw, key: string): boolean {
  const value = raw[key];
  if (typeof value !== 'boolean') throw new Error('invalid_response');
  return value;
}

function str(raw: Raw, key: string): string {
  const value = raw[key];
  if (typeof value !== 'string') throw new Error('invalid_response');
  return value;
}

/** Only the documented fields are copied, so nothing else a reply carries reaches the UI. */
function toState(raw: Raw): PhishingState {
  return {
    locked: bool(raw, 'locked'),
    bypassCount: num(raw, 'bypassCount'),
    trainingCorrect: num(raw, 'trainingCorrect'),
    streak: num(raw, 'streak'),
    dailyCorrect: num(raw, 'dailyCorrect'),
    passedGuardWindow: bool(raw, 'passedGuardWindow'),
  };
}

/**
 * The real `PhishingClient` (#146): one call per RPC of
 * `20260928020000_phishing_quiz.sql`. Identity comes from the Supabase
 * session (auth.uid() on the server), so no call sends a Player id. An
 * error rejects with the server's code as its message.
 */
export function createSupabasePhishingClient(client: PhishingRpcClient): PhishingClient {
  async function call(fn: PhishingRpcName, args: Record<string, unknown> = {}): Promise<Raw> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(error.message);
    return asObject(data);
  }

  return {
    async guardNow(): Promise<GuardWindow> {
      const raw = await call('phishing_guard_now');
      return {
        roomId: str(raw, 'roomId') as RoomId,
        doorLabel: str(raw, 'doorLabel'),
        windowStart: str(raw, 'windowStart'),
        windowEnd: str(raw, 'windowEnd'),
        serverNow: str(raw, 'serverNow'),
      };
    },

    async state(): Promise<PhishingState> {
      return toState(await call('phishing_state'));
    },

    async startChallenge(): Promise<PhishingChallenge> {
      const raw = await call('start_phishing_challenge');
      const choices = raw.choices;
      if (
        !Array.isArray(choices) ||
        choices.length !== 4 ||
        !choices.every((c) => typeof c === 'string')
      ) {
        throw new Error('invalid_response');
      }
      return {
        challengeId: str(raw, 'challengeId'),
        questionId: str(raw, 'questionId'),
        category: str(raw, 'category'),
        prompt: str(raw, 'prompt'),
        choices: choices as PhishingChallenge['choices'],
        secondsLeft: num(raw, 'secondsLeft'),
        mode: str(raw, 'mode') as PhishingMode,
      };
    },

    async answer(challengeId: string, choice: PhishingChoice): Promise<PhishingAnswerResult> {
      const raw = await call('answer_phishing_question', { challenge_id: challengeId, choice });
      const badges = raw.badgesEarned;
      return {
        correct: bool(raw, 'correct'),
        explanation: str(raw, 'explanation'),
        tokensAwarded: num(raw, 'tokensAwarded'),
        balance: num(raw, 'balance'),
        ...toState(raw),
        badgesEarned: Array.isArray(badges) ? (badges as BadgeId[]) : [],
      };
    },

    async recordMapBypass(roomId: RoomId): Promise<PhishingBypassResult> {
      const raw = await call('record_map_bypass', { room_id: roomId });
      return { ...toState(raw), counted: bool(raw, 'counted') };
    },
  };
}
