/** JG HQ's time zone: Night Owl's window is Eastern time (#138). */
export const NIGHT_OWL_TIME_ZONE = 'America/New_York';

const easternHour = new Intl.DateTimeFormat('en-US', {
  timeZone: NIGHT_OWL_TIME_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
});

/**
 * True when `date` falls in Night Owl's window, [02:00, 05:00) Eastern, with
 * daylight saving handled by the platform's time zone data. Mirrors #138's
 * `public.is_night_owl_time`, which the server uses with its own clock; the
 * in-memory fake uses this with its injected clock.
 */
export function isNightOwlTime(date: Date): boolean {
  const hourPart = easternHour.formatToParts(date).find((part) => part.type === 'hour');
  const hour = Number(hourPart?.value);
  return hour >= 2 && hour <= 4;
}
