import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getWeek } from './getWeek'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { startOfToday, startOfWeek } from '@/lib/time'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    trainingEntry: { findMany: vi.fn() },
    recoveryEntry: { findMany: vi.fn() },
    moodEntry: { findFirst: vi.fn() },
    measurement: { findFirst: vi.fn() },
  },
}))

// We do NOT mock @/lib/time because it is a pure local module.
// We will rely on the implementation using real logic and control the
// environment via the mocked database return values.

describe('getWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws Unauthorized when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    await expect(getWeek()).rejects.toThrow('Unauthorized')
  })

  it('aggregates the week into the pillar shape', async () => {
    // Setup session
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)

    // Setup Training Entries
    // We use specific dates that are guaranteed to be within the same week
    // based on the logic in the implementation (which uses startOfWeek(new Date()))
    // Since we can't easily mock the system clock without global setup, 
    // we provide data that satisfies the 'gte' check for a generic recent date.
    const now = new Date()
    const startOfWeekDate = startOfWeek(now)
    const startOfTodayDate = startOfToday(now)

    vi.mocked(prisma.trainingEntry.findMany).mockResolvedValue([
      { kind: 'resistance', steps: 0, loggedAt: new Date(startOfWeekDate.getTime()) },
      { kind: 'resistance', steps: 0, loggedAt: new Date(startOfWeekDate.getTime()) },
      { kind: 'core', steps: 0, loggedAt: new Date(startOfWeekDate.getTime()) },
      { kind: 'neat', steps: 500, loggedAt: new Date(startOfTodayDate.getTime()) },
    ] as any)

    // Setup Recovery Entries
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([
      { kind: 'sleep', value: 7, loggedAt: new Date(startOfTodayDate.getTime()) },
      { kind: 'water', value: 2, loggedAt: new Date(startOfTodayDate.getTime()) },
    ] as any)

    // Setup Mood and Measurement
    vi.mocked(prisma.moodEntry.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.measurement.findFirst).mockResolvedValue(null)

    const result = await getWeek()

    expect(result).toEqual({
      training: {
        resistance: 2,
        hiit: 0,
        core: 1,
        stepsToday: 500,
      },
      recovery: {
        sleepHours: 7,
        waterLiters: 2,
        alcoholDrinks: null,
      },
      mood: null,
      measurement: null,
    })

    expect(prisma.trainingEntry.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        loggedAt: { gte: startOfWeekDate },
      },
    })
  })
})
