import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/db'
import type { DailyTarget, MealEntry } from '@prisma/client'
import { getToday } from './getToday'
import { auth } from '@/auth'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>)

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    account: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    session: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    verificationToken: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    dailyTarget: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    mealEntry: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    chatMessage: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn(), count: vi.fn() },
  },
}))

const makeDailyTarget = (overrides: Partial<DailyTarget> = {}): DailyTarget =>
  ({
    id: '',
    userId: '',
    calories: 0,
    protein: 0,
    createdAt: new Date(Date.UTC(2000, 1, 1)),
    updatedAt: new Date(Date.UTC(2000, 1, 1)),
    ...overrides,
  } as unknown as DailyTarget)

const makeMealEntry = (overrides: Partial<MealEntry> = {}): MealEntry =>
  ({
    id: '',
    userId: '',
    photoUrl: '',
    foodItems: '',
    totalCalories: 0,
    totalProtein: 0,
    confirmed: false,
    loggedAt: new Date(Date.UTC(2000, 1, 1)),
    ...overrides,
  } as unknown as MealEntry)

describe('getToday', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sums calories and protein across today\'s meals', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as any)
    
    const meal1 = makeMealEntry({ totalCalories: 300, totalProtein: 20 })
    const meal2 = makeMealEntry({ totalCalories: 500, totalProtein: 40 })
    
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([meal1, meal2])
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(makeDailyTarget({ calories: 2000, protein: 150 }))

    const result = await getToday()

    expect(result.consumed).toEqual({ calories: 800, protein: 60 })
    expect(result.target).toEqual({ calories: 2000, protein: 150 })
    expect(prisma.mealEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'u1',
        loggedAt: expect.objectContaining({
          gte: expect.any(Date)
        })
      })
    }))
  })

  it('returns zeroes and a null target for a new user', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2' } } as any)
    
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([])
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(null)

    const result = await getToday()

    expect(result.consumed).toEqual({ calories: 0, protein: 0 })
    expect(result.target).toBeNull()
  })

  it('rejects when signed out', async () => {
    mockAuth.mockResolvedValue(null)

    await expect(getToday()).rejects.toThrow('Unauthorized')
    expect(prisma.mealEntry.findMany).not.toHaveBeenCalled()
  })
}) 