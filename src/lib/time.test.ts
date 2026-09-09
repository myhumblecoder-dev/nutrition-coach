import { describe, it, expect, vi, afterEach } from 'vitest'
import { startOfToday, startOfWeek, appTimeZone, toCalendarDate } from '@/lib/time'

describe('time', () => {
  const originalEnv = process.env.APP_TIMEZONE;

  afterEach(() => {
    vi.useRealTimers()
    process.env.APP_TIMEZONE = originalEnv
  })

  it('startOfToday is local midnight in the app timezone', () => {
    // Setup: Jan 15, 2026, 03:30:00 UTC
    // In America/New_York (EST, UTC-5), this is Jan 14, 2026, 22:30:00
    const systemTime = new Date(Date.UTC(2026, 0, 15, 3, 30, 0, 0))
    vi.useFakeTimers()
    vi.setSystemTime(systemTime)
    process.env.APP_TIMEZONE = 'America/New_York'

    const result = startOfToday(new Date())

    // Expected: Jan 14, 2026, 00:00:00 EST
    // 00:00 EST is 05:00 UTC
    const expected = new Date(Date.UTC(2026, 0, 14, 5, 0, 0, 0))
    
    expect(result.getUTCFullYear()).toBe(expected.getUTCFullYear())
    expect(result.getUTCMonth()).toBe(expected.getUTCMonth())
    expect(result.getUTCDate()).toBe(expected.getUTCDate())
    expect(result.getUTCHours()).toBe(expected.getUTCHours())
    expect(result.getUTCMinutes()).toBe(expected.getUTCMinutes())
    expect(result.getUTCSeconds()).toBe(expected.getUTCSeconds())
  })

  it('startOfWeek is the local Monday midnight', () => {
    // Setup: Jan 15, 2026, 03:30:00 UTC
    // In America/New_York, this is Jan 14, 2026 (Wednesday)
    const systemTime = new Date(Date.UTC(2026, 0, 15, 3, 30, 0, 0))
    vi.useFakeTimers()
    vi.setSystemTime(systemTime)
    process.env.APP_TIMEZONE = 'America/New_York'

    const result = startOfWeek(new Date())

    // Jan 14 is Wed. Monday was Jan 12.
    // Jan 12, 2026, 00:00:00 EST is Jan 12, 2026, 05:00:00 UTC
    const expected = new Date(Date.UTC(2026, 0, 12, 5, 0, 0, 0))

    expect(result.getUTCFullYear()).toBe(expected.getUTCFullYear())
    expect(result.getUTCMonth()).toBe(expected.getUTCMonth())
    expect(result.getUTCDate()).toBe(expected.getUTCDate())
    expect(result.getUTCHours()).toBe(expected.getUTCHours())
    expect(result.getUTCMinutes()).toBe(expected.getUTCMinutes())
    expect(result.getUTCSeconds()).toBe(expected.getUTCSeconds())
  })

  it('an invalid APP_TIMEZONE falls back instead of throwing', () => {
    process.env.APP_TIMEZONE = '[SENSITIVE]'
    try {
      expect(appTimeZone()).toBe('America/New_York')
      expect(() => startOfToday(new Date())).not.toThrow()
    } finally {
      delete process.env.APP_TIMEZONE
    }
  })
  describe('toCalendarDate', () => {
    it('renders the wall-clock date in the app timezone, not UTC', () => {
      process.env.APP_TIMEZONE = 'America/New_York'

      // Midnight Monday 24 August in New York is 04:00 UTC the same day.
      const weekOf = new Date('2026-08-24T04:00:00.000Z')

      expect(toCalendarDate(weekOf)).toBe('2026-08-24')
    })

    it('does not shift the day for an instant late in the UTC day', () => {
      // The regression this exists for: serialising weekOf as an instant and
      // formatting it anywhere west of APP_TIMEZONE labelled the week a day
      // early. 20:00 New York is already the next day in UTC, and the answer
      // must still be the New York date.
      process.env.APP_TIMEZONE = 'America/New_York'

      expect(toCalendarDate(new Date('2026-08-25T00:30:00.000Z'))).toBe('2026-08-24')
    })

    it('zero-pads month and day so the result always sorts and parses', () => {
      process.env.APP_TIMEZONE = 'America/New_York'

      expect(toCalendarDate(new Date('2026-01-05T05:00:00.000Z'))).toBe('2026-01-05')
    })

    it('follows APP_TIMEZONE rather than the machine running the server', () => {
      const instant = new Date('2026-08-24T04:00:00.000Z')

      process.env.APP_TIMEZONE = 'America/New_York'
      expect(toCalendarDate(instant)).toBe('2026-08-24')

      // Same instant, a timezone further west: still 23 August there, and the
      // function must say so rather than quietly reporting the New York date.
      process.env.APP_TIMEZONE = 'America/Los_Angeles'
      expect(toCalendarDate(instant)).toBe('2026-08-23')
    })
  })
})

describe('startOfToday in a specific timezone', () => {
  // 09:00 UTC on 10 September. Which day that belongs to, and when the day
  // began, depends entirely on where the person is standing.
  const now = new Date('2026-09-10T09:00:00.000Z')

  it('uses the zone it is given rather than the app default', () => {
    // Tokyo is UTC+9, so 09:00 UTC is 18:00 on the 10th — the day started at
    // 15:00 UTC on the 9th.
    expect(startOfToday(now, 'Asia/Tokyo').toISOString()).toBe('2026-09-09T15:00:00.000Z')
    // London is UTC+1 in September; the day started at 23:00 UTC on the 9th.
    expect(startOfToday(now, 'Europe/London').toISOString()).toBe('2026-09-09T23:00:00.000Z')
    // New York is UTC-4; 09:00 UTC is 05:00 local, day started at 04:00 UTC.
    expect(startOfToday(now, 'America/New_York').toISOString()).toBe('2026-09-10T04:00:00.000Z')
  })

  it('falls back to the app timezone when given nothing', () => {
    // Every existing caller passes no zone and must keep behaving identically.
    expect(startOfToday(now).getTime()).toBe(startOfToday(now, appTimeZone()).getTime())
  })

  it('ignores a zone the runtime does not recognise', () => {
    // A timezone arrives from a client and is not to be trusted. A bad one
    // must degrade to the app default, never throw — a thrown formatter here
    // would fail the request the user actually made.
    expect(startOfToday(now, 'Mars/Olympus_Mons').getTime()).toBe(startOfToday(now).getTime())
    expect(startOfToday(now, '').getTime()).toBe(startOfToday(now).getTime())
  })
})
