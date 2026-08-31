import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deleteMealEntry } from './deleteMealEntry'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: { mealEntry: { deleteMany: vi.fn() } },
}))

describe('deleteMealEntry', () => {
  beforeEach(() => vi.clearAllMocks())

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
