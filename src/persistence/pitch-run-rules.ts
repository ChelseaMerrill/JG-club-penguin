import { ProgressStoreError, type PitchRun, type PitchSubmitResult } from './progress-store';

/**
 * Linda's pitch Quest's server rules (#142,
 * `20261009010000_quest_pitch_hack.sql` P2-P8), as pure functions over a
 * Player's pitch-run record and the server's clock, for the in-memory fake
 * (`createInMemoryProgressStore`) to mirror the migration exactly.
 */

/** The Quest's id (`public.quests.id`). */
export const PITCH_HACK_QUEST_ID = 'pitch-hack';

/** The Quest's reward (`public.quests.reward_tokens`). */
export const PITCH_HACK_REWARD = 75;

/** How long a pitch attempt stays open after `startPitch` (P3). */
export const PITCH_LIMIT_SECONDS = 60;

/** Extra seconds a submission is still accepted after the 60 s, for the round trip the countdown can't see (P3). */
export const PITCH_GRACE_SECONDS = 5;

/** `player_pitch_runs`' row, in epoch milliseconds; `null` for a column not set yet. */
export interface PitchRunRecord {
  talkedAtMs: number;
  startedAtMs: number | null;
  passedAtMs: number | null;
  bestSeconds: number | null;
}

/**
 * `pitch_run_state`: the run a Player sees, `record` being `null` before
 * talking to Linda. Unlike the coffee run, nothing here is time-dependent
 * (there is no "is an attempt running" flag to report, P6), so this takes
 * no clock.
 */
export function pitchRunView(record: PitchRunRecord | null): PitchRun {
  if (record === null) {
    return { talkedToLinda: false, passed: false, bestSeconds: null };
  }
  return {
    talkedToLinda: true,
    passed: record.passedAtMs !== null,
    bestSeconds: record.bestSeconds,
  };
}

/** `quest_steps__pitch_hack` (P4). Not time-dependent, so this takes no clock either. */
export function pitchQuestSteps(record: PitchRunRecord | null): Record<string, boolean> {
  return {
    'talk-to-linda': record !== null,
    'pitch-under-60': record?.passedAtMs != null,
  };
}

function requireTalked(record: PitchRunRecord | null): PitchRunRecord {
  if (record === null) throw new ProgressStoreError('pitch_not_started');
  return record;
}

/** `mark_linda_talked`: coalesces talked_at, so a repeat keeps the first talk. */
export function startPitchRun(record: PitchRunRecord | null, nowMs: number): PitchRunRecord {
  return record ?? { talkedAtMs: nowMs, startedAtMs: null, passedAtMs: null, bestSeconds: null };
}

/** `start_pitch`: needs a talked_at; each call resets the clock. */
export function startPitch(record: PitchRunRecord | null, nowMs: number): PitchRunRecord {
  const run = requireTalked(record);
  return { ...run, startedAtMs: nowMs };
}

/**
 * `submit_pitch`: validates the three choices, requires an active
 * `startedAtMs`, accepts only within 65 s of it (else `pitch_timeout`,
 * writing nothing), and otherwise clears `startedAtMs`, sets `passedAtMs`
 * (first time only) and keeps the faster of this attempt and any earlier
 * one as `bestSeconds`. Returns the updated record and the accepted
 * attempt's whole seconds.
 */
export function submitPitch(
  record: PitchRunRecord | null,
  nowMs: number,
  problem: number,
  solution: number,
  ask: number,
): { record: PitchRunRecord; result: PitchSubmitResult } {
  if (![problem, solution, ask].every((choice) => choice === 0 || choice === 1 || choice === 2)) {
    throw new ProgressStoreError('invalid_pitch');
  }
  const run = requireTalked(record);
  if (run.startedAtMs === null) throw new ProgressStoreError('pitch_not_started');
  if (nowMs - run.startedAtMs > (PITCH_LIMIT_SECONDS + PITCH_GRACE_SECONDS) * 1000) {
    throw new ProgressStoreError('pitch_timeout');
  }
  const seconds = Math.floor((nowMs - run.startedAtMs) / 1000);
  const bestSeconds = run.bestSeconds === null ? seconds : Math.min(run.bestSeconds, seconds);
  return {
    record: {
      ...run,
      startedAtMs: null,
      passedAtMs: run.passedAtMs ?? nowMs,
      bestSeconds,
    },
    result: { seconds },
  };
}
