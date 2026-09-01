import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getActivity } from './getActivity'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

vi.mock('@/auth', () => ({
  auth: vi.fn()
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    mealEntry: { findMany: vi.fn() },
    trainingEntry: { findMany: vi.fn() },
    recoveryEntry: { findMany: vi.fn() },
    moodEntry: { findMany: vi.fn() },
    measurement: { findMany: vi.fn() }
  }
}))

describe('getActivity', () => {
  const mockAuth = vi.mocked(auth)
  const db = prisma

  beforeEach(() => {
    vi.clearAllMocks()
    // Default to authorized state
    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as never)
    
    // Default all findMany to empty arrays
    vi.mocked(db.mealEntry.findMany).mockResolvedValue([])
    vi.mocked(db.trainingEntry.findMany).mockResolvedValue([])
    vi.mocked(db.recoveryEntry.findMany).mockResolvedValue([])
    vi.mocked(db.moodEntry.findMany).mockResolvedValue([])
    vi.mocked(db.measurement.findMany).mockResolvedValue([])
  })

  it('throws Unauthorized when no session', async () => {
    mockAuth.mockResolvedValue({ user: { id: null } } as never)
    await expect(getActivity()).rejects.toThrow('Unauthorized')
  })

  it('merges and orders the receipts across tables', async () => {
    // Setup: trainingEntry is more recent than mealEntry
    const trainingDate = new Date(Date.UTC(2026, 7, 31, 20, 32, 0))
    const mealDate = new Date(Date.UTC(2026, 7, 31, 13, 17, 0))

    vi.mocked(db.trainingEntry.findMany).mockResolvedValue([
      {
        id: 't1',
        kind: 'neat',
        minutes: 45,
        steps: null,
        note: null,
        source: '',
        sourceText: '',
        loggedAt: trainingDate,
        userId: 'u1'
      }
    ] as any)

    vi.mocked(db.mealEntry.findMany).mockResolvedValue([
      {
        id: 'm1',
        photoUrl: '',
        foodItems: '[{"name":"Baozi"}]',
        totalCalories: 600,
        totalProtein: 25,
        confirmed: true,
        source: 'extracted',
        sourceText: 'had baozi',
        loggedAt: mealDate,
        userId: 'u1'
      }
    ] as any)

    const result = await getActivity()

    const mealArg = vi.mocked(prisma.mealEntry.findMany).mock.calls[0][0] as { where: { loggedAt: { gte: Date } } }
    expect(mealArg?.where?.loggedAt?.gte).toBeInstanceOf(Date)
    const trainArg = vi.mocked(prisma.trainingEntry.findMany).mock.calls[0][0] as { where: { loggedAt: { gte: Date } } }
    expect(trainArg?.where?.loggedAt?.gte).toBeInstanceOf(Date)
    expect(result).toHaveLength(2)
    
    // Check order (descending by date)
    expect(result[0].at.getTime()).toBe(trainingDate.getTime())
    expect(result[0].kind).toBe('training')
    expect(result[0].label).toContain('45 min')

    expect(result[1].at.getTime()).toBe(mealDate.getTime())
    expect(result[1].kind).toBe('meal')
    expect(result[1].label).toContain('Baozi')
    expect(result[1].label).toContain('600 kcal')
  })
})