import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveMealEntry } from './saveMealEntry'
import { auth } from '@/auth'
import { logMealForUser } from '@/lib/meals'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/meals', () => ({ logMealForUser: vi.fn() }))

const validInput = {
  photoUrl: 'https://example.com/photo.jpg',
  foodItems: [{ name: 'Apple', portion: '1 medium', calories: 95, protein: 0 }],
  totalCalories: 95,
  totalProtein: 0,
}

describe('saveMealEntry', () => {
  beforeEach(() => vi.clearAllMocks())

  it('the module source begins with the use server directive', () => {
    const firstLine = readFileSync(
      join(process.cwd(), 'src/app/actions/saveMealEntry.ts'),
      'utf8'
    ).split('\n')[0]
    expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)
  })

  it('throws Unauthorized when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    await expect(saveMealEntry(validInput)).rejects.toThrow('Unauthorized')
    expect(logMealForUser).not.toHaveBeenCalled()
  })

  it('delegates to the meal core with the session user id', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(logMealForUser).mockResolvedValue({ id: 'entry-1' })

    const result = await saveMealEntry(validInput)

    expect(logMealForUser).toHaveBeenCalledWith('u1', validInput)
    expect(result).toEqual({ id: 'entry-1' })
  })
})
