import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { getToday } from './getToday'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    mealEntry: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    dailyTarget: {
      findUnique: vi.fn(),
    },
  },
}))

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>)
const mockFindMany = vi.mocked(prisma.mealEntry.findMany)
const mockFindUnique = vi.mocked(prisma.mealEntry.findUnique)

describe('getToday', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Set system time to 2026-01-15T03:30:00.000Z
    // In America/New_York (EST, UTC-5), this is 2026-01-14 22:30:00
    const date = new Date(Date.UTC(2026, 0, 15, 3, 30, 0, 0))
    vi.setSystemTime(date)
    
    // Ensure environment variable is set for deterministic testing
    process.env.APP_TIMEZONE = 'America/New_York'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('the day boundary is local midnight in the app timezone', async () => {
    // Setup: Auth returns a user
    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as any)
    
    // Setup: Prisma returns empty meals and a target
    mockFindMany.mockResolvedValue([])
    mockFindUnique.mockResolvedValue({
      calories: 2000,
      protein: 150,
    } as any)

    await getToday()

    // The system time is 2026-01-15 03:30:00 UTC.
    // In America/New_York, this is 2026-01-14 22:30:00.
    // The start of that day (midnight) in New York is 2026-01-14 00:00:00 EST.
    // 2026-01-14 00:00:00 EST is 2026-01-14 05:00:00 UTC.
    const expectedStartOfDay = new Date(Date.UTC(2026, 0, 14, 5, 0, 0, 0))

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        loggedAt: expect.objectContaining({
          gte: expectedStartOfDay
        })
      })
    }))
  })
})