import { describe, expect, it, vi } from 'vitest';
import { createSupabaseFeedbackClient, FeedbackError, type FeedbackRpc } from './feedback-client';

function rpcReturning(result: Awaited<ReturnType<FeedbackRpc['rpc']>>) {
  const rpc = vi.fn(() => Promise.resolve(result));
  return { rpc, client: { rpc } as FeedbackRpc };
}

const submission = {
  kind: 'issue' as const,
  message: 'The door in The Melt is stuck',
  roomId: 'the-melt',
  clientInfo: '1600x900 test agent',
};

describe('Supabase FeedbackClient', () => {
  it('calls submit_feedback with snake_case arguments and returns the id', async () => {
    const { rpc, client } = rpcReturning({ data: { id: 'b2f0c1d4' }, error: null });

    const receipt = await createSupabaseFeedbackClient(client).submit(submission);

    expect(rpc).toHaveBeenCalledWith('submit_feedback', {
      kind: 'issue',
      message: 'The door in The Melt is stuck',
      room_id: 'the-melt',
      client_info: '1600x900 test agent',
    });
    expect(receipt).toEqual({ id: 'b2f0c1d4' });
  });

  it.each(['feedback_rate_limited', 'invalid_feedback', 'not_authenticated', 'no_player'])(
    'maps a raised %s to a FeedbackError with that code',
    async (code) => {
      const { client } = rpcReturning({ data: null, error: { message: code, code: 'P0001' } });

      await expect(createSupabaseFeedbackClient(client).submit(submission)).rejects.toMatchObject({
        name: 'FeedbackError',
        code,
      });
    },
  );

  it('maps anything else (e.g. permission denied) to code unknown', async () => {
    const { client } = rpcReturning({
      data: null,
      error: { message: 'permission denied for function submit_feedback', code: '42501' },
    });

    const error = await createSupabaseFeedbackClient(client)
      .submit(submission)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(FeedbackError);
    expect((error as FeedbackError).code).toBe('unknown');
  });

  it('maps a network failure (a rejected call) to code unknown', async () => {
    const client = { rpc: () => Promise.reject(new TypeError('Failed to fetch')) } as FeedbackRpc;

    await expect(createSupabaseFeedbackClient(client).submit(submission)).rejects.toMatchObject({
      code: 'unknown',
    });
  });
});
