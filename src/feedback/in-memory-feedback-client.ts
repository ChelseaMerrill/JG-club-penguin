import {
  FEEDBACK_RATE_LIMIT,
  FeedbackError,
  feedbackValidationError,
  type FeedbackClient,
  type FeedbackKind,
} from './feedback-client';

export interface RecordedFeedback {
  id: string;
  kind: FeedbackKind;
  message: string;
  roomId: string | null;
  clientInfo: string | null;
}

export interface InMemoryFeedbackClient extends FeedbackClient {
  /** Every accepted submission, oldest first (a copy). */
  submissions(): RecordedFeedback[];
}

/**
 * A fake `FeedbackClient` for unit tests and the dev/e2e hooks (`main.ts`
 * picks it exactly when it picks the in-memory progress store). Mirrors
 * `submit_feedback`'s validation and its 5-per-10-minutes rate limit, so the
 * modal's rate-limit path can be exercised without a database.
 */
export function createInMemoryFeedbackClient(
  options: { now?: () => number } = {},
): InMemoryFeedbackClient {
  const now = options.now ?? (() => Date.now());
  const recorded: Array<RecordedFeedback & { at: number }> = [];
  let nextId = 1;

  return {
    async submit(submission) {
      if (feedbackValidationError(submission) !== null) {
        throw new FeedbackError('invalid_feedback');
      }
      const at = now();
      const recent = recorded.filter((row) => row.at > at - FEEDBACK_RATE_LIMIT.windowMs);
      if (recent.length >= FEEDBACK_RATE_LIMIT.max) {
        throw new FeedbackError('feedback_rate_limited');
      }
      const row = {
        id: `feedback-${nextId++}`,
        kind: submission.kind,
        message: submission.message.trim(),
        roomId: submission.roomId,
        clientInfo: submission.clientInfo,
        at,
      };
      recorded.push(row);
      return { id: row.id };
    },
    submissions() {
      return recorded.map(({ id, kind, message, roomId, clientInfo }) => ({
        id,
        kind,
        message,
        roomId,
        clientInfo,
      }));
    },
  };
}
