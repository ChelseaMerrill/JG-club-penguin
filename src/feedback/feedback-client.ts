/**
 * The in-game feedback channel: a Player reports an issue or makes a
 * suggestion from the HUD's feedback button. Submissions go only through
 * `public.submit_feedback` (supabase/migrations/20260925010000_feedback.sql),
 * which validates, rate-limits and stores them; a Database Webhook then
 * emails the owner (supabase/functions/feedback-email). Deliberately not part
 * of `ProgressStore`: feedback is not Player progress.
 */

export type FeedbackKind = 'issue' | 'suggestion';

export const FEEDBACK_KINDS: readonly FeedbackKind[] = ['issue', 'suggestion'];

/** Mirrors the migration's `feedback_message_length` check (after trim). */
export const FEEDBACK_MESSAGE_MAX = 2000;
/** Mirrors the migration's `feedback_client_info_length` check. */
export const FEEDBACK_CLIENT_INFO_MAX = 300;
/** Mirrors the migration's rate limit: 5 submissions per Player per 10 minutes. */
export const FEEDBACK_RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 } as const;

export interface FeedbackSubmission {
  kind: FeedbackKind;
  message: string;
  /** The Room the Player was in when they opened the modal. */
  roomId: string | null;
  /** Short client description (viewport, user agent), at most 300 characters. */
  clientInfo: string | null;
}

export interface FeedbackReceipt {
  id: string;
}

export interface FeedbackClient {
  submit(submission: FeedbackSubmission): Promise<FeedbackReceipt>;
}

/** The codes `submit_feedback` raises (its message is the code), plus `unknown` for anything else. */
export type FeedbackErrorCode =
  'not_authenticated' | 'no_player' | 'invalid_feedback' | 'feedback_rate_limited' | 'unknown';

const KNOWN_CODES: ReadonlySet<string> = new Set([
  'not_authenticated',
  'no_player',
  'invalid_feedback',
  'feedback_rate_limited',
]);

export class FeedbackError extends Error {
  constructor(
    readonly code: FeedbackErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'FeedbackError';
  }
}

/** `null` when valid; otherwise why the server would refuse it with `invalid_feedback`. */
export function feedbackValidationError(submission: FeedbackSubmission): string | null {
  if (!FEEDBACK_KINDS.includes(submission.kind)) return 'unknown kind';
  const trimmed = typeof submission.message === 'string' ? submission.message.trim() : '';
  if (trimmed.length < 1 || trimmed.length > FEEDBACK_MESSAGE_MAX) return 'message length';
  if (submission.clientInfo !== null && submission.clientInfo.length > FEEDBACK_CLIENT_INFO_MAX) {
    return 'client info length';
  }
  return null;
}

/** The narrow slice of a Supabase client the Supabase `FeedbackClient` calls. */
export interface FeedbackRpc {
  rpc(
    fn: 'submit_feedback',
    args: { kind: string; message: string; room_id: string | null; client_info: string | null },
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

/** Submits through `public.submit_feedback`, mapping its raised codes to `FeedbackError`. */
export function createSupabaseFeedbackClient(client: FeedbackRpc): FeedbackClient {
  return {
    async submit(submission) {
      let result: Awaited<ReturnType<FeedbackRpc['rpc']>>;
      try {
        result = await client.rpc('submit_feedback', {
          kind: submission.kind,
          message: submission.message,
          room_id: submission.roomId,
          client_info: submission.clientInfo,
        });
      } catch (err) {
        throw new FeedbackError('unknown', err instanceof Error ? err.message : String(err));
      }
      if (result.error) {
        const { message } = result.error;
        throw KNOWN_CODES.has(message)
          ? new FeedbackError(message as FeedbackErrorCode)
          : new FeedbackError('unknown', message);
      }
      const id = (result.data as { id?: unknown } | null)?.id;
      if (typeof id !== 'string' && typeof id !== 'number') {
        throw new FeedbackError('unknown', 'submit_feedback returned no id');
      }
      return { id: String(id) };
    },
  };
}
