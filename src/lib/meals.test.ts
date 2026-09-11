import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  logMealForUser,
  confirmPendingMeal,
  discardPendingMeal,
  getPendingMeal,
  updatePendingMealAnalysis,
} from './meals'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: {
    mealEntry: {
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
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

describe('pending meals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('confirms only a pending meal belonging to the user', async () => {
    vi.mocked(prisma.mealEntry.updateMany).mockResolvedValue({ count: 1 } as never)

    const confirmed = await confirmPendingMeal('u1', 'meal-1')

    expect(confirmed).toBe(true)
    const arg = vi.mocked(prisma.mealEntry.updateMany).mock.calls[0][0]
    // The meal id reaches us from a client — a Telegram callback payload or an
    // iOS request path — so it can never be the only thing scoping the write.
    expect(arg.where).toEqual({ id: 'meal-1', userId: 'u1', confirmed: false })
    expect(arg.data).toEqual({ confirmed: true })
  })

  it('applies edited totals when confirming', async () => {
    vi.mocked(prisma.mealEntry.updateMany).mockResolvedValue({ count: 1 } as never)

    await confirmPendingMeal('u1', 'meal-1', { totalCalories: 500, totalProtein: 40 })

    const arg = vi.mocked(prisma.mealEntry.updateMany).mock.calls[0][0]
    expect(arg.data).toEqual({ confirmed: true, totalCalories: 500, totalProtein: 40 })
  })

  it('ignores overrides that were not supplied', async () => {
    vi.mocked(prisma.mealEntry.updateMany).mockResolvedValue({ count: 1 } as never)

    await confirmPendingMeal('u1', 'meal-1', { totalCalories: 500 })

    const arg = vi.mocked(prisma.mealEntry.updateMany).mock.calls[0][0]
    // Not `totalProtein: undefined`: Prisma treats an explicit undefined as
    // "leave alone", but writing the key at all invites a later refactor to
    // pass null through and blank the column.
    expect(arg.data).toEqual({ confirmed: true, totalCalories: 500 })
  })

  it('reports false when nothing was pending', async () => {
    vi.mocked(prisma.mealEntry.updateMany).mockResolvedValue({ count: 0 } as never)

    expect(await confirmPendingMeal('u1', 'gone')).toBe(false)
  })

  it('discards only a pending meal belonging to the user', async () => {
    vi.mocked(prisma.mealEntry.deleteMany).mockResolvedValue({ count: 1 } as never)

    const discarded = await discardPendingMeal('u1', 'meal-1')

    expect(discarded).toBe(true)
    const arg = vi.mocked(prisma.mealEntry.deleteMany).mock.calls[0][0]
    expect(arg?.where).toEqual({ id: 'meal-1', userId: 'u1', confirmed: false })
  })

  it('never deletes a meal the user already confirmed', async () => {
    vi.mocked(prisma.mealEntry.deleteMany).mockResolvedValue({ count: 0 } as never)

    expect(await discardPendingMeal('u1', 'already-logged')).toBe(false)
  })
})

describe('revising a pending meal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads back only a pending meal belonging to the user', async () => {
    vi.mocked(prisma.mealEntry.findFirst).mockResolvedValue({
      photoUrl: 'https://blob/x.jpg',
      sourceText: 'chicken burrito bowl',
    } as never)

    const meal = await getPendingMeal('u1', 'meal-1')

    expect(meal).toEqual({ photoUrl: 'https://blob/x.jpg', sourceText: 'chicken burrito bowl' })
    const arg = vi.mocked(prisma.mealEntry.findFirst).mock.calls[0][0]
    expect(arg?.where).toEqual({ id: 'meal-1', userId: 'u1', confirmed: false })
  })

  it('reports nothing for a meal that is not pending', async () => {
    vi.mocked(prisma.mealEntry.findFirst).mockResolvedValue(null as never)

    expect(await getPendingMeal('u1', 'gone')).toBeNull()
  })

  it('writes the re-read analysis back over the pending row', async () => {
    vi.mocked(prisma.mealEntry.updateMany).mockResolvedValue({ count: 1 } as never)

    const updated = await updatePendingMealAnalysis('u1', 'meal-1', {
      foodItems: [{ name: 'chicken', portion: '2 cups', calories: 700, protein: 60 }],
      totalCalories: 700,
      totalProtein: 60,
    }, 'chicken burrito bowl. double portion')

    expect(updated).toBe(true)
    const arg = vi.mocked(prisma.mealEntry.updateMany).mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'meal-1', userId: 'u1', confirmed: false })
    // foodItems is a JSON string column, same as on create.
    expect(JSON.parse(arg.data.foodItems as string)[0].name).toBe('chicken')
    expect(arg.data.totalCalories).toBe(700)
    // The accumulated words are the receipt Today's feed quotes back, so the
    // correction has to land in the row, not just in the estimate.
    expect(arg.data.sourceText).toBe('chicken burrito bowl. double portion')
    // Still pending: a correction is not an agreement to log it.
    expect(arg.data.confirmed).toBeUndefined()
  })

  it('reports false when the meal stopped being pending mid-correction', async () => {
    vi.mocked(prisma.mealEntry.updateMany).mockResolvedValue({ count: 0 } as never)

    const updated = await updatePendingMealAnalysis('u1', 'meal-1', {
      foodItems: [{ name: 'x', portion: '1', calories: 1, protein: 1 }],
      totalCalories: 1,
      totalProtein: 1,
    }, 'x')

    expect(updated).toBe(false)
  })
})

describe('what survives the write', () => {
  it('keeps fat, its source and the processing group', async () => {
    // `foodItemSchema` is a plain z.object, so unknown keys are stripped and
    // the *parsed* value is what gets written. A field missing from that
    // schema is a field silently lost — which is exactly what happened to
    // processingGroup, leaving the gauge unlit for every photo-logged meal.
    vi.mocked(prisma.mealEntry.create).mockResolvedValue({ id: 'm1' } as never)

    await logMealForUser('u1', {
      photoUrl: 'https://blob/m.jpg',
      foodItems: [
        {
          name: 'crisps',
          portion: 'small bag',
          calories: 150,
          protein: 2,
          fat: 10,
          fatSource: 'refined',
          processingGroup: 4,
        },
      ],
      totalCalories: 150,
      totalProtein: 2,
      totalFat: 10,
    })

    const written = vi.mocked(prisma.mealEntry.create).mock.calls[0][0]
      .data as { foodItems: string; totalFat: number }
    const items = JSON.parse(written.foodItems)

    expect(items[0].fat).toBe(10)
    expect(items[0].fatSource).toBe('refined')
    expect(items[0].processingGroup).toBe(4)
    expect(written.totalFat).toBe(10)
  })
})
