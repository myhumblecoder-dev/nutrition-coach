import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setTargetForUser, getTargetForUser, targetSchema } from '@/lib/targets'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: { dailyTarget: { upsert: vi.fn(), findUnique: vi.fn() } },
}))

describe('daily targets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts, because a target replaces rather than accumulates', async () => {
    vi.mocked(prisma.dailyTarget.upsert).mockResolvedValue({ calories: 2000, protein: 150 } as never)

    await setTargetForUser('u1', { calories: 2000, protein: 150 })

    expect(prisma.dailyTarget.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', calories: 2000, protein: 150 },
      update: { calories: 2000, protein: 150 },
    })
  })

  it('returns null when no target is set, rather than a zero', async () => {
    // A user with no target has not chosen zero calories, and Today renders
    // the two states differently: no rings versus rings that read 0.
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(null as never)

    await expect(getTargetForUser('u1')).resolves.toBeNull()
  })

  it.each([
    ['zero calories', { calories: 0, protein: 150 }],
    ['a typo of 200 kcal', { calories: 200, protein: 150 }],
    ['90,000 kcal', { calories: 90000, protein: 150 }],
    ['600g protein', { calories: 2000, protein: 600 }],
    ['fractional calories', { calories: 2000.5, protein: 150 }],
    ['negative protein', { calories: 2000, protein: -10 }],
  ])('rejects %s', (_label, input) => {
    // Bounds, not just positivity: a nonsense target becomes the denominator
    // under every ring on Today, and an extractor misreading a sentence is a
    // likelier source of one than a user typing it.
    expect(() => targetSchema.parse(input)).toThrow()
  })

  it('accepts the range a real person lands in', () => {
    for (const input of [
      { calories: 1200, protein: 90 },
      { calories: 2000, protein: 150 },
      { calories: 4000, protein: 220 },
    ]) {
      expect(() => targetSchema.parse(input)).not.toThrow()
    }
  })
})
