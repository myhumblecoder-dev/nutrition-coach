import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveMealEntry } from './saveMealEntry'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    mealEntry: {
      create: vi.fn(),
    },
  },
}))

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>)
const mockCreate = vi.mocked(prisma.mealEntry.create)

describe('saveMealEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws Unauthorized when auth returns no session', async () => {
    mockAuth.mockResolvedValue(null)

    const input = {
      photoUrl: 'https://example.com/photo.jpg',
      foodItems: [{ name: 'Apple', portion: '1', calories: 50, protein: 0 }],
      totalCalories: 50,
      totalProtein: 0
    }

    await expect(saveMealEntry(input)).rejects.toThrow('Unauthorized')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('throws Invalid meal entry data when photoUrl is not a URL', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })

    const input = {
      photoUrl: 'not-a-url',
      foodItems: [{ name: 'Apple', portion: '1', calories: 50, protein: 0 }],
      totalCalories: 50,
      totalProtein: 0
    }

    await expect(saveMealEntry(input)).rejects.toThrow('Invalid meal entry data')
    expect(mockCreate).not.toHaveBeenCalled()
  })
})