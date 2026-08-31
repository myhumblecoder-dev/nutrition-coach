import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveMealEntry } from './saveMealEntry'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

  it('the module source begins with the use server directive', () => {
    const firstLine = readFileSync(join(process.cwd(), 'src/app/actions/saveMealEntry.ts'), 'utf8').split('\n')[0]
    expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)
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

  it('creates mealEntry with correct userId and confirmed=true', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const mockResult = {
      id: 'entry-1',
      userId: 'u1',
      photoUrl: 'https://example.com/photo.jpg',
      foodItems: '[]',
      totalCalories: 95,
      totalProtein: 0,
      confirmed: true,
      loggedAt: new Date(Date.UTC(2024, 0, 1)),
    }
    mockCreate.mockResolvedValue(mockResult as any)

    const input = {
      photoUrl: 'https://example.com/photo.jpg',
      foodItems: [{ name: 'Apple', portion: '1 medium', calories: 95, protein: 0 }],
      totalCalories: 95,
      totalProtein: 0,
    }

    await saveMealEntry(input)

    const arg = mockCreate.mock.calls[0][0]
    expect(arg.data.userId).toBe('u1')
    expect(arg.data.confirmed).toBe(true)
    expect(arg.data.foodItems).toBe(JSON.stringify([{ name: 'Apple', portion: '1 medium', calories: 95, protein: 0 }]))
  })

  it('returns the id from the created entry', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockCreate.mockResolvedValue({ id: 'entry-1' } as any)

    const input = {
      photoUrl: 'https://example.com/photo.jpg',
      foodItems: [{ name: 'Apple', portion: '1 medium', calories: 95, protein: 0 }],
      totalCalories: 95,
      totalProtein: 0,
    }

    const result = await saveMealEntry(input)
    expect(result).toEqual({ id: 'entry-1' })
  })
})