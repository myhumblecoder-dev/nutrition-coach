import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getWeek } from './getWeek'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { startOfToday, startOfWeek } from '@/lib/time'
import { caffeineStatus } from '@/lib/caffeine'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
// The maths has its own tests; here we assert this action's wiring into it.
vi.mock('@/lib/caffeine', () => ({ caffeineStatus: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    trainingEntry: { findMany: vi.fn() },
    recoveryEntry: { findMany: vi.fn() },
    mealEntry: { findMany: vi.fn() },
    moodEntry: { findFirst: vi.fn() },
    measurement: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}))

// We do NOT mock @/lib/time because it is a pure local module.
// We will rely on the implementation using real logic and control the
// environment via the mocked database return values.

describe('getWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.measurement.findMany).mockResolvedValue([] as never)
  })

  afterEach(() => vi.useRealTimers())

  it('training days resolve to weekday booleans', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T15:00:00.000Z'))
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(prisma.trainingEntry.findMany).mockResolvedValue([
      { kind: 'resistance', loggedAt: new Date('2026-01-12T15:00:00Z'), steps: null },
      { kind: 'resistance', loggedAt: new Date('2026-01-14T15:00:00Z'), steps: null },
    ] as never)
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.moodEntry.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.measurement.findFirst).mockResolvedValue(null as never)

    const week = await getWeek()

    expect(week.training.days.resistance).toEqual([true, false, true, false, false, false, false])
    const moodArg = vi.mocked(prisma.moodEntry.findFirst).mock.calls[0][0] as { where: { loggedAt: { gte: Date } } }
    expect(moodArg?.where?.loggedAt?.gte).toBeInstanceOf(Date)
  })

  it('the meal streak buckets the last seven days', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T15:00:00.000Z'))
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(prisma.trainingEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.moodEntry.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.measurement.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([
      { loggedAt: new Date('2026-01-14T15:00:00Z') },
      { loggedAt: new Date('2026-01-15T15:00:00Z') },
    ] as never)

    const week = await getWeek()

    expect(week.streak).toHaveLength(7)
    expect(week.streak.slice(5)).toEqual([true, true])
    expect(week.streak.slice(0, 5)).toEqual([false, false, false, false, false])
  })

  it('weights map oldest to newest', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(prisma.trainingEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.moodEntry.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.measurement.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.measurement.findMany).mockResolvedValue([
      { measuredAt: new Date('2026-01-14T12:00:00Z'), weightLb: 172 },
      { measuredAt: new Date('2026-01-01T12:00:00Z'), weightLb: 174 },
    ] as never)

    const week = await getWeek()

    expect(week.weights).toEqual([
      { at: new Date('2026-01-01T12:00:00Z'), weightLb: 174 },
      { at: new Date('2026-01-14T12:00:00Z'), weightLb: 172 },
    ])
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
        days: {
          resistance: [true, false, false, false, false, false, false],
          hiit: [false, false, false, false, false, false, false],
          core: [true, false, false, false, false, false, false],
        },
      },
      recovery: {
        sleepHours: 7,
        waterLiters: 2,
        caffeine: null,
      },
      streak: [false, false, false, false, false, false, false],
      weights: [],
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

  it('feeds today caffeine rows to the calculator as timed doses', async () => {
    const at = new Date('2026-09-02T14:00:00Z')
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([
      { kind: 'sleep', value: 7, loggedAt: at },
      { kind: 'caffeine', value: 95, loggedAt: at },
      { kind: 'caffeine', value: 65, loggedAt: at },
    ] as never)
    vi.mocked(caffeineStatus).mockReturnValue({ totalMg: 160, currentMg: 120, hoursUntilNegligible: 4.2 })

    const week = await getWeek()

    const doses = vi.mocked(caffeineStatus).mock.calls[0][0]
    expect(doses).toEqual([
      { mg: 95, at },
      { mg: 65, at },
    ])
    expect(week.recovery.caffeine).toEqual({ totalMg: 160, currentMg: 120, hoursUntilNegligible: 4.2 })
    expect(week.recovery.sleepHours).toBe(7)
  })

  it('reports null caffeine when none was logged today', async () => {
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([
      { kind: 'water', value: 1.5, loggedAt: new Date() },
    ] as never)

    const week = await getWeek()

    expect(week.recovery.caffeine).toBeNull()
    expect(caffeineStatus).not.toHaveBeenCalled()
  })
})
