import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deleteMealEntry } from './deleteMealEntry'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: { mealEntry: { deleteMany: vi.fn(), findFirst: vi.fn() } },
}))
vi.mock('@/lib/photoStore', () => ({ deletePhotos: vi.fn() }))

describe('deleteMealEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.mealEntry.findFirst).mockResolvedValue(null as never)
  })

  it('throws Unauthorized when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    await expect(deleteMealEntry('meal-1')).rejects.toThrow('Unauthorized')
    expect(prisma.mealEntry.deleteMany).not.toHaveBeenCalled()
  })

  it('deletes the meal scoped to the signed-in user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(prisma.mealEntry.deleteMany).mockResolvedValue({ count: 1 })

    const result = await deleteMealEntry('meal-1')

    const arg = vi.mocked(prisma.mealEntry.deleteMany).mock.calls[0][0]!
    expect(arg.where!.id).toBe('meal-1')
    expect(arg.where!.userId).toBe('u1')
    expect(result).toEqual({ deleted: true })
  })

  it('throws Meal not found when nothing was deleted', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(prisma.mealEntry.deleteMany).mockResolvedValue({ count: 0 })

    await expect(deleteMealEntry('missing')).rejects.toThrow('Meal not found')
  })
})

describe('deleting a meal takes its photo with it', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes the blob, which no row deletion reaches', async () => {
    // photoStore's own docstring claimed this path was covered; it was not.
    // This is the in-app "delete this meal" action, so it is the commonest
    // way a logged photo became garbage nothing pointed at.
    const { deletePhotos } = await import('@/lib/photoStore')
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(prisma.mealEntry.findFirst).mockResolvedValue({
      photoUrl: 'https://blob/a.jpg',
    } as never)
    vi.mocked(prisma.mealEntry.deleteMany).mockResolvedValue({ count: 1 } as never)

    await deleteMealEntry('meal-1')

    expect(deletePhotos).toHaveBeenCalledWith(['https://blob/a.jpg'])
  })

  it('does not delete a blob when nothing was deleted', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(prisma.mealEntry.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.mealEntry.deleteMany).mockResolvedValue({ count: 0 } as never)

    const { deletePhotos } = await import('@/lib/photoStore')
    await expect(deleteMealEntry('gone')).rejects.toThrow('Meal not found')

    expect(deletePhotos).not.toHaveBeenCalled()
  })
})
