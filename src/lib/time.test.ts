import { describe, it, expect, vi, afterEach } from 'vitest'
import { startOfToday, startOfWeek, appTimeZone } from '@/lib/time'

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
})
