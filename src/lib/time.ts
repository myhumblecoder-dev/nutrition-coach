// A bad APP_TIMEZONE (e.g. Vercel's '[SENSITIVE]' placeholder in CI builds)
// must degrade to the default, never throw — it once failed a prod build
// during the /_not-found prerender.
export function appTimeZone(): string {
  const tz = process.env.APP_TIMEZONE ?? 'America/New_York';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'America/New_York';
  }
}

const timeFormatOptions = (): Intl.DateTimeFormatOptions => ({
  timeZone: appTimeZone(),
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function startOfToday(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', timeFormatOptions()).formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value;

  const hour = parseInt(getPart('hour') || '0', 10);
  const minute = parseInt(getPart('minute') || '0', 10);
  const second = parseInt(getPart('second') || '0', 10);

  const elapsedMs = (hour * 3600 + minute * 60 + second) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}

/**
 * A wall-clock calendar date as YYYY-MM-DD, in the app's timezone.
 *
 * `weekOf` is a date, not an instant: "the week of 24 August". Storing it as
 * midnight in APP_TIMEZONE is fine; serialising that with toISOString() is not,
 * because it hands the client an instant that a device-local formatter renders
 * a day early for anyone west of APP_TIMEZONE — "Week of August 23" for a week
 * that began on the 24th.
 *
 * Sending the date itself removes the ambiguity at the source, rather than
 * asking every client to remember to undo it.
 */
export function toCalendarDate(date: Date): string {
  // formatToParts rather than a locale that happens to emit YYYY-MM-DD:
  // assembling the parts explicitly is not at the mercy of ICU changing what
  // en-CA formats like.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: appTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function startOfWeek(now: Date): Date {
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: appTimeZone(),
    weekday: 'short',
  }).format(now);

  const daysSinceMondayMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };

  const daysSinceMonday = daysSinceMondayMap[dayName] ?? 0;
  const startToday = startOfToday(now);
  return new Date(startToday.getTime() - daysSinceMonday * 86400000);
}
// The partner-coach-bot pattern: the coach's prompt opens with the current
// date and time so it never claims it cannot see a calendar.
export function nowLine(now: Date = new Date()): string {
  const tz = appTimeZone();
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);
  return `Today is ${date}, ${time} (${tz}).`;
}
