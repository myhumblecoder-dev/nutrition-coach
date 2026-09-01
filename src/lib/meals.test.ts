import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logMealForUser } from './meals'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: {
    mealEntry: {
      create: vi.fn(),
    },
  },
}))

describe('meals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the meal for the given user', async () => {
    const userId = 'u1'
    const input = {
      photoUrl: 'https://example.com/photo.jpg',
      foodItems: [
        { name: 'Apple', portion: '1 unit', calories: 52, protein: 0 }
      ],
      totalCalories: 52,
      totalProtein: 0
    }

    vi.mocked(prisma.mealEntry.create).mockResolvedValue({
      id: 'entry-1',
      userId: 'u1',
      photoUrl: 'https://example.com/photo.jpg',
      foodItems: JSON.stringify(input.foodItems),
      totalCalories: 52,
      totalProtein: 0,
      confirmed: true,
      loggedAt: new Date(Date.UTC(2024, 0, 1)),
    } as any)

    const result = await logMealForUser(userId, input)

    const arg = vi.mocked(prisma.mealEntry.create).mock.calls[0][0]
    expect(arg.data.userId).toBe('u1')
    expect(arg.data.confirmed).toBe(true)
    expect(result).toEqual({ id: 'entry-1' })
  })

  it('rejects invalid meal data before touching the database', async () => {
    const userId = 'u1'
    const invalidInput = {
      photoUrl: 'not-a-url',
      foodItems: [
        { name: 'Apple', portion: '1 unit', calories: 52, protein: 0 }
      ],
      totalCalories: 52,
      totalProtein: 0
    }

    await expect(logMealForUser(userId, invalidInput as any))
      .rejects.toThrow('Invalid meal entry data')

    expect(prisma.mealEntry.create).not.toHaveBeenCalled()
  })

  it('carries sourceText when provided', async () => {
    vi.mocked(prisma.mealEntry.create).mockResolvedValue({ id: 'e2' } as never)

    await logMealForUser('u1', {
      photoUrl: 'https://example.com/p.jpg',
      foodItems: [{ name: 'Chicken', portion: '1', calories: 200, protein: 30 }],
      totalCalories: 200,
      totalProtein: 30,
    }, 'my lunch caption')

    const arg = vi.mocked(prisma.mealEntry.create).mock.calls.at(-1)![0]
    expect(arg.data.sourceText).toBe('my lunch caption')
  })

  it('logs as pending when confirmed is false', async () => {
    vi.mocked(prisma.mealEntry.create).mockResolvedValue({ id: 'e3' } as never)

    await logMealForUser('u1', {
      photoUrl: 'https://example.com/p.jpg',
      foodItems: [{ name: 'Chicken', portion: '1', calories: 200, protein: 30 }],
      totalCalories: 200,
      totalProtein: 30,
    }, 'caption', false)

    const arg = vi.mocked(prisma.mealEntry.create).mock.calls.at(-1)![0]
    expect(arg.data.confirmed).toBe(false)
  })
})
