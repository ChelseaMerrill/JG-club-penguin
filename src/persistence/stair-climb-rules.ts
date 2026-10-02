/**
 * The Stairs Challenge's rules (#51 slice 4), mirroring
 * `supabase/migrations/20260929000000_stair_climb.sql` (SC8-SC11) for the
 * in-memory fake and the client.
 */

/** Tokens a valid flight pays (SC10). */
export const STAIR_FLIGHT_TOKENS = 10;

/** The most flight Tokens a Player earns per America/New_York day (SC10). */
export const STAIR_DAILY_TOKEN_CAP = 100;

/** The least time between two logged flights; a flight sooner is `too_soon` (SC9). */
export const STAIR_FLIGHT_MIN_INTERVAL_MS = 2000;

/** The top Stairwell floor: logging it finishes a climb (SC11). */
export const STAIR_TOP_FLOOR = 5;

/** JG HQ's time zone: the daily cap resets at midnight here (SC10). */
export const STAIR_TIME_ZONE = 'America/New_York';

const easternDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: STAIR_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The America/New_York calendar day `date` falls on, as `YYYY-MM-DD`, with
 * daylight saving from the platform's time zone data. Mirrors the
 * migration's `public.stair_day`.
 */
export function stairDay(date: Date): string {
  return easternDate.format(date);
}

/** What a valid flight pays with `tokensToday` flight Tokens already earned today (SC10). */
export function stairFlightPay(tokensToday: number): number {
  return Math.max(0, Math.min(STAIR_FLIGHT_TOKENS, STAIR_DAILY_TOKEN_CAP - tokensToday));
}
