import { describe, expect, it, vi } from 'vitest';
import { createSupabasePhishingClient, type PhishingRpcClient } from './supabase-phishing-client';

const STATE = {
  locked: false,
  bypassCount: 1,
  trainingCorrect: 0,
  streak: 2,
  dailyCorrect: 3,
  passedGuardWindow: false,
};

function rpcReturning(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn<PhishingRpcClient['rpc']>(() => Promise.resolve({ data, error }));
  return { rpc, client: createSupabasePhishingClient({ rpc }) };
}

describe('createSupabasePhishingClient', () => {
  it('starts a challenge with no arguments and keeps only the documented fields', async () => {
    const { rpc, client } = rpcReturning({
      challengeId: 'c-1',
      questionId: 'links',
      category: 'LINKS',
      prompt: 'Before clicking a link?',
      choices: ['a', 'b', 'c', 'd'],
      secondsLeft: 20,
      mode: 'guard',
      // A server bug must still never reach the UI.
      correctIndex: 1,
    });

    const challenge = await client.startChallenge();

    expect(rpc).toHaveBeenCalledWith('start_phishing_challenge', {});
    expect(challenge).toEqual({
      challengeId: 'c-1',
      questionId: 'links',
      category: 'LINKS',
      prompt: 'Before clicking a link?',
      choices: ['a', 'b', 'c', 'd'],
      secondsLeft: 20,
      mode: 'guard',
    });
  });

  it('answers by challenge id and choice (null for a timeout), defaulting badgesEarned to []', async () => {
    const { rpc, client } = rpcReturning({
      correct: false,
      explanation: 'Hover first.',
      tokensAwarded: 0,
      balance: 40,
      ...STATE,
    });

    const result = await client.answer('c-1', null);

    expect(rpc).toHaveBeenCalledWith('answer_phishing_question', {
      challenge_id: 'c-1',
      choice: null,
    });
    expect(result).toEqual({
      correct: false,
      explanation: 'Hover first.',
      tokensAwarded: 0,
      balance: 40,
      ...STATE,
      badgesEarned: [],
    });
  });

  it('records a Map bypass for the Room being left', async () => {
    const { rpc, client } = rpcReturning({ ...STATE, counted: true });

    expect(await client.recordMapBypass('town-center')).toEqual({ ...STATE, counted: true });
    expect(rpc).toHaveBeenCalledWith('record_map_bypass', { room_id: 'town-center' });
  });

  it("rejects with the server's error code", async () => {
    const { client } = rpcReturning(null, { message: 'challenge_closed' });

    await expect(client.answer('c-1', 0)).rejects.toThrow('challenge_closed');
  });

  it('rejects a malformed reply instead of reading it as a default', async () => {
    const { client } = rpcReturning({ locked: 'yes' });

    await expect(client.state()).rejects.toThrow('invalid_response');
  });
});
