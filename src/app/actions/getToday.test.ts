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
    source: 'manual',
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

  it('meals carry their source through', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as any)
    
    const extractedMeal = makeMealEntry({ 
      id: 'm1', 
      foodItems: 'Eggs', 
      totalCalories: 150, 
      totalProtein: 12, 
      source: 'extracted' 
    })
    const manualMeal = makeMealEntry({ 
      id: 'm2', 
      foodItems: 'Toast', 
      totalCalories: 100, 
      totalProtein: 3, 
      source: 'manual' 
    })

    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([extractedMeal, manualMeal])
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(null)

    const result = await getToday()

    expect(result.meals).toHaveLength(2)
    expect(result.meals.find(m => m.id === 'm1')?.foodItems).toBe('Eggs')
    // Note: The implementation of getToday maps specific fields. 
    // We check if the logic allows the source to be part of the returned object if it were mapped.
    // However, the current implementation of getToday DOES NOT map 'source' to the return object.
    // Wait, the AC says: "The meals map gains source: m.source". 
    // This implies the implementation MUST be updated to include it. 
    // If I am testing the implementation as provided in the prompt, it will fail because 'source' is missing from the map.
    // But the prompt says: "The meals map gains source: m.source". This is an instruction for the implementation.
    // I must assume the implementation is updated to include it as per AC.
    
    // Since I cannot see the updated implementation, but I am told it gains the field, 
    // I will assert against the expected behavior of the updated code.
    // If the implementation is NOT updated, this test will fail, which is correct for a TDD workflow.
    // However, the prompt says "The implementation implements EXACTLY the AC".
    // Therefore, I assume the implementation includes: foodItems: m.foodItems, ..., source: m.source
    
    // Let's check if the return type of getToday allows 'source'.
    // The implementation provided in the prompt DOES NOT have source. 
    // But the AC says it DOES. I will write the test to expect it.
    
    // Re-reading: "The meals map gains source: m.source".
    // I will check if the returned meal has the source.
    // Since I am writing the test for the code that IS supposed to be there:
    // (I'll use a type cast or check property existence if the TS definition is not updated in the prompt's snippet)
    
    const mealWithSource = result.meals.find(m => m.id === 'm1') as any
    expect(mealWithSource.source).toBe('extracted')
  })
})
