import { ProgressStoreError, type CoffeeRun } from './progress-store';

/**
 * The Nicole coffee Quest's server rules (#141,
 * `20261006020000_quest_nicole_coffee.sql` C2-C7), as pure functions over a
 * Player's coffee-run record and the server's clock, for the in-memory fake
 * (`createInMemoryProgressStore`) to mirror the migration exactly.
 */

/** The Quest's id (`public.quests.id`). */
export const NICOLE_COFFEE_QUEST_ID = 'nicole-coffee';

/** The Quest's reward (`public.quests.reward_tokens`). */
export const NICOLE_COFFEE_REWARD = 75;

/** How long a cup stays hot after Tom hands it over (C3). */
export const COFFEE_LIMIT_SECONDS = 60;

/** Extra seconds a delivery is still accepted after the 1:00, for round trips the countdown can't see (C3). */
export const COFFEE_GRACE_SECONDS = 5;

/** `player_coffee_runs`' row, in epoch milliseconds; `null` for a column not set yet. */
export interface CoffeeRunRecord {
  talkedAtMs: number;
  kitchenVisitedAtMs: number | null;
  handedOverAtMs: number | null;
  deliveredAtMs: number | null;
}

/** Whether a cup is being carried within the 60 s limit at `nowMs` (C6). */
function carrying(record: CoffeeRunRecord, nowMs: number): boolean {
  return (
    record.deliveredAtMs === null &&
    record.handedOverAtMs !== null &&
    nowMs - record.handedOverAtMs <= COFFEE_LIMIT_SECONDS * 1000
  );
}

/** `coffee_run_state`: the run a Player sees, `record` being `null` before talking to Nicole. */
export function coffeeRunView(record: CoffeeRunRecord | null, nowMs: number): CoffeeRun {
  if (record === null) {
    return {
      talkedToNicole: false,
      kitchenVisited: false,
      delivered: false,
      handedOverAt: null,
      secondsLeft: null,
    };
  }
  const hot = carrying(record, nowMs);
  const handedOverAtMs = record.handedOverAtMs ?? 0;
  return {
    talkedToNicole: true,
    kitchenVisited: record.kitchenVisitedAtMs !== null,
    delivered: record.deliveredAtMs !== null,
    handedOverAt: hot ? new Date(handedOverAtMs).toISOString() : null,
    secondsLeft: hot ? Math.max(0, COFFEE_LIMIT_SECONDS - (nowMs - handedOverAtMs) / 1000) : null,
  };
}

/** `quest_steps__nicole_coffee` (C4): all five are true only after a delivery in time. */
export function coffeeQuestSteps(
  record: CoffeeRunRecord | null,
  nowMs: number,
): Record<string, boolean> {
  const delivered = record?.deliveredAtMs != null;
  return {
    'talk-to-nicole': record !== null,
    'visit-kitchen': record?.kitchenVisitedAtMs != null,
    'ask-tom': delivered || (record !== null && carrying(record, nowMs)),
    'carry-coffee': delivered,
    'deliver-coffee': delivered,
  };
}

function requireStarted(record: CoffeeRunRecord | null): CoffeeRunRecord {
  if (record === null) throw new ProgressStoreError('coffee_not_started');
  return record;
}

/** `start_coffee_run`: a repeat keeps the first talk. */
export function startCoffeeRun(record: CoffeeRunRecord | null, nowMs: number): CoffeeRunRecord {
  return (
    record ?? {
      talkedAtMs: nowMs,
      kitchenVisitedAtMs: null,
      handedOverAtMs: null,
      deliveredAtMs: null,
    }
  );
}

/** `mark_kitchen_visited`: a repeat keeps the first visit. */
export function visitKitchen(record: CoffeeRunRecord | null, nowMs: number): CoffeeRunRecord {
  const run = requireStarted(record);
  return { ...run, kitchenVisitedAtMs: run.kitchenVisitedAtMs ?? nowMs };
}

/** `ask_tom_for_coffee`: a fresh cup unless one is hot or it was delivered. */
export function askTom(record: CoffeeRunRecord | null, nowMs: number): CoffeeRunRecord {
  const run = requireStarted(record);
  if (
    run.deliveredAtMs === null &&
    (run.handedOverAtMs === null || nowMs - run.handedOverAtMs > COFFEE_LIMIT_SECONDS * 1000)
  ) {
    return {
      ...run,
      handedOverAtMs: nowMs,
      kitchenVisitedAtMs: run.kitchenVisitedAtMs ?? nowMs,
    };
  }
  return run;
}

/** `deliver_coffee`: accepted up to 65 s after the hand-over, else `coffee_cold` (nothing written). */
export function deliverCoffee(record: CoffeeRunRecord | null, nowMs: number): CoffeeRunRecord {
  const run = requireStarted(record);
  if (run.deliveredAtMs !== null) return run;
  if (run.handedOverAtMs === null) throw new ProgressStoreError('coffee_not_carrying');
  if (nowMs - run.handedOverAtMs > (COFFEE_LIMIT_SECONDS + COFFEE_GRACE_SECONDS) * 1000) {
    throw new ProgressStoreError('coffee_cold');
  }
  return { ...run, deliveredAtMs: nowMs };
}
