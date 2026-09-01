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