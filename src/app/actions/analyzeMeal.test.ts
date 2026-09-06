import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeMeal } from './analyzeMeal'
import { auth } from '@/auth'
import { analyzeMeal as analyzeMealCore } from '@/lib/analyzeMeal'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/analyzeMeal', () => ({ analyzeMeal: vi.fn() }))

describe('analyzeMeal (action wrapper)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('the module source begins with the use server directive', () => {
    const firstLine = readFileSync(
      join(process.cwd(), 'src/app/actions/analyzeMeal.ts'),
      'utf8'
    ).split('\n')[0]
    expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)
  })

  it('throws Unauthorized for a signed-out caller without touching the LLM', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    await expect(analyzeMeal('https://example.com/p.jpg')).rejects.toThrow('Unauthorized')
    expect(analyzeMealCore).not.toHaveBeenCalled()
  })

  it('delegates to the core lib for a signed-in user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    const analysis = { foodItems: [], totalCalories: 1, totalProtein: 1 }
    vi.mocked(analyzeMealCore).mockResolvedValue(analysis as never)

    const result = await analyzeMeal('https://example.com/p.jpg', 'a caption')

    // The session's user id is what gates the cap, so it must be threaded
    // through rather than left to the caller to supply.
    expect(analyzeMealCore).toHaveBeenCalledWith('u1', 'https://example.com/p.jpg', 'a caption')
    expect(result).toBe(analysis)
  })

  it('surfaces the cap copy rather than a generic failure', async () => {
    const { UsageLimitError } = await import('@/lib/limits')
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(analyzeMealCore).mockRejectedValue(new UsageLimitError('enough photos, hon'))

    await expect(analyzeMeal('https://example.com/p.jpg')).rejects.toThrow('enough photos, hon')
  })
})
