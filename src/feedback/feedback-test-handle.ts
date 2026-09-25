import type { RecordedFeedback } from './in-memory-feedback-client';

/**
 * Test handle `main.ts` exposes as `window.__feedbackTest` in dev/e2e-hook
 * builds, where feedback goes to the in-memory fake instead of Supabase.
 * Kept in its own file so e2e specs can import the type without pulling in
 * `main.ts`.
 */
export interface FeedbackTestHandle {
  /** Every submission the fake accepted, oldest first. */
  submissions(): RecordedFeedback[];
}
