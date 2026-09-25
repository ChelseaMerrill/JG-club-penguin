import { describe, expect, it } from 'vitest';
import { FeedbackError } from './feedback-client';
import { createInMemoryFeedbackClient } from './in-memory-feedback-client';

const TEN_MINUTES_MS = 10 * 60 * 1000;

function clock(start = Date.UTC(2026, 8, 25, 12, 0, 0)) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return err instanceof FeedbackError ? err.code : 'not a FeedbackError';
  }
  return 'resolved';
}

describe('in-memory FeedbackClient', () => {
  it('records a submission with its Room id and returns an id', async () => {
    const client = createInMemoryFeedbackClient();

    const result = await client.submit({
      kind: 'suggestion',
      message: '  More snowballs please  ',
      roomId: 'dev-pit',
      clientInfo: 'test agent',
    });

    expect(result.id).toEqual(expect.any(String));
    expect(client.submissions()).toEqual([
      {
        id: result.id,
        kind: 'suggestion',
        message: 'More snowballs please',
        roomId: 'dev-pit',
        clientInfo: 'test agent',
      },
    ]);
  });

  it.each([
    ['an unknown kind', { kind: 'rant', message: 'hi' }],
    ['a whitespace-only message', { kind: 'issue', message: '   \n ' }],
    ['a 2001-character message', { kind: 'issue', message: 'x'.repeat(2001) }],
    [
      'client info over 300 characters',
      { kind: 'issue', message: 'hi', clientInfo: 'u'.repeat(301) },
    ],
  ])('rejects %s with invalid_feedback and records nothing', async (_label, input) => {
    const client = createInMemoryFeedbackClient();

    const code = await codeOf(client.submit({ roomId: null, clientInfo: null, ...input } as never));

    expect(code).toBe('invalid_feedback');
    expect(client.submissions()).toEqual([]);
  });

  it('accepts a message of exactly 2000 characters', async () => {
    const client = createInMemoryFeedbackClient();

    await client.submit({
      kind: 'issue',
      message: 'y'.repeat(2000),
      roomId: null,
      clientInfo: null,
    });

    expect(client.submissions()).toHaveLength(1);
  });

  it('allows 5 submissions per 10 minutes, then rejects with feedback_rate_limited', async () => {
    const time = clock();
    const client = createInMemoryFeedbackClient({ now: time.now });
    const send = () =>
      client.submit({ kind: 'issue', message: 'bug', roomId: 'town-center', clientInfo: null });

    for (let i = 0; i < 5; i += 1) {
      await send();
      time.advance(1000);
    }

    expect(await codeOf(send())).toBe('feedback_rate_limited');
    expect(client.submissions()).toHaveLength(5);

    // Once the first submission is more than 10 minutes old, one more fits.
    time.advance(TEN_MINUTES_MS - 5000 + 1);
    expect(await codeOf(send())).toBe('resolved');
  });
});
