import { describe, it, expect, vi, beforeEach } from 'vitest'
import { estimateTargets, ensureOpeningMessage, OPENING_MESSAGE } from '@/lib/onboarding'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: { chatMessage: { count: vi.fn(), create: vi.fn() } },
}))

describe('the opening message', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is written once, for an account that has never had a conversation', async () => {
    vi.mocked(prisma.chatMessage.count).mockResolvedValue(0 as never)

    await ensureOpeningMessage('u1')

    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: { userId: 'u1', role: 'assistant', content: OPENING_MESSAGE },
    })
  })

  it('never interrupts a conversation already under way', async () => {
    // It runs on every chat read, so this is the guard that keeps it from
    // dropping an onboarding prompt into a months-old conversation.
    vi.mocked(prisma.chatMessage.count).mockResolvedValue(12 as never)

    await ensureOpeningMessage('u1')

    expect(prisma.chatMessage.create).not.toHaveBeenCalled()
  })

  it('offers both routes, because one of them is the fallback for not knowing', () => {
    expect(OPENING_MESSAGE).toMatch(/calories and protein/i)
    expect(OPENING_MESSAGE).toMatch(/how tall|height/i)
    expect(OPENING_MESSAGE).toMatch(/weigh/i)
  })
})

describe('estimating a starting target', () => {
  it('lands in a plausible range for an average adult', () => {
    // 5'10", 180 lb. Not asserting an exact number — the formula assumes an
    // age and splits the sex constant, so precision here would be false. What
    // matters is that it is a sane starting point.
    const target = estimateTargets({ heightIn: 70, weightLb: 180 })

    expect(target.calories).toBeGreaterThan(1800)
    expect(target.calories).toBeLessThan(2800)
    expect(target.protein).toBeGreaterThan(120)
    expect(target.protein).toBeLessThan(170)
  })

  it('scales with body size', () => {
    const smaller = estimateTargets({ heightIn: 62, weightLb: 120 })
    const larger = estimateTargets({ heightIn: 76, weightLb: 240 })

    expect(larger.calories).toBeGreaterThan(smaller.calories)
    expect(larger.protein).toBeGreaterThan(smaller.protein)
  })

  it('rounds calories to something a person would actually say', () => {
    // "2,150" reads as a target; "2,147" reads as a claim to precision this
    // app spends its whole description disowning.
    for (const input of [
      { heightIn: 70, weightLb: 180 },
      { heightIn: 64, weightLb: 140 },
      { heightIn: 74, weightLb: 210 },
    ]) {
      expect(estimateTargets(input).calories % 10).toBe(0)
    }
  })

  it('stays inside the bounds the API enforces, even for extreme input', () => {
    // A misread height or weight must not produce a target the rest of the app
    // would reject, or a denominator a ring cannot divide by.
    const tiny = estimateTargets({ heightIn: 36, weightLb: 40 })
    const huge = estimateTargets({ heightIn: 96, weightLb: 700 })

    expect(tiny.calories).toBeGreaterThanOrEqual(500)
    expect(tiny.protein).toBeGreaterThanOrEqual(20)
    expect(huge.calories).toBeLessThanOrEqual(10000)
    expect(huge.protein).toBeLessThanOrEqual(500)
  })
})
