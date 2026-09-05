import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  dailyMessageLimit,
  dailyLimit,
  isOverLimit,
  recordUsage,
  todaySuccesses,
  limitMessage,
  photoLimitMessage,
  UsageLimitError,
} from './limits'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: {
    usageEvent: { count: vi.fn(), create: vi.fn() },
    mealEntry: { count: vi.fn() },
    trainingEntry: { findMany: vi.fn() },
    recoveryEntry: { findMany: vi.fn() },
    moodEntry: { count: vi.fn() },
    measurement: { count: vi.fn() },
  },
}))

const mockPrisma = vi.mocked(prisma, true)

function stubCounts({
  meals = 0,
  training = [] as { kind: string }[],
  recovery = [] as { kind: string; value: number }[],
  mood = 0,
  measurement = 0,
} = {}) {
  mockPrisma.mealEntry.count.mockResolvedValue(meals as never)
  mockPrisma.trainingEntry.findMany.mockResolvedValue(training as never)
  mockPrisma.recoveryEntry.findMany.mockResolvedValue(recovery as never)
  mockPrisma.moodEntry.count.mockResolvedValue(mood as never)
  mockPrisma.measurement.count.mockResolvedValue(measurement as never)
}

describe('dailyMessageLimit', () => {
  const originalEnv = process.env
  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  it('has a generous default that ordinary use never reaches', () => {
    delete process.env.DAILY_MESSAGE_LIMIT
    expect(dailyMessageLimit()).toBeGreaterThanOrEqual(20)
  })

  it('is configurable', () => {
    process.env.DAILY_MESSAGE_LIMIT = '5'
    expect(dailyMessageLimit()).toBe(5)
  })

  it('ignores a non-numeric value rather than disabling the limit', () => {
    // A bad env var must not silently mean "unlimited" — that is the failure
    // mode the limit exists to prevent.
    process.env.DAILY_MESSAGE_LIMIT = 'lots'
    expect(dailyMessageLimit()).toBeGreaterThanOrEqual(20)
  })
})

describe('isOverLimit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.DAILY_MESSAGE_LIMIT = '3'
  })

  it('counts only this user, only today, only their own messages', async () => {
    mockPrisma.usageEvent.count.mockResolvedValue(0 as never)

    await isOverLimit('u1', 'chat', new Date())

    // Prisma types every filter field as optional, so the captured argument
    // needs narrowing before it can be asserted on.
    const where = mockPrisma.usageEvent.count.mock.calls[0][0]?.where as {
      userId: string
      kind: string
      createdAt: { gte: Date }
    }
    expect(where.userId).toBe('u1')
    expect(where.kind).toBe('chat')
    expect(where.createdAt.gte).toBeInstanceOf(Date)
  })

  it('is false below the limit and true at it', async () => {
    mockPrisma.usageEvent.count.mockResolvedValue(2 as never)
    await expect(isOverLimit('u1', 'chat', new Date())).resolves.toBe(false)

    mockPrisma.usageEvent.count.mockResolvedValue(3 as never)
    await expect(isOverLimit('u1', 'chat', new Date())).resolves.toBe(true)
  })
})

describe('todaySuccesses', () => {
  beforeEach(() => vi.resetAllMocks())

  it('names meals, training and sleep in plain language', async () => {
    stubCounts({ meals: 3, training: [{ kind: 'resistance' }], recovery: [{ kind: 'sleep', value: 7 }] })

    const summary = await todaySuccesses('u1', new Date())

    expect(summary).toContain('3 meals')
    expect(summary).toMatch(/lift|resistance/i)
    expect(summary).toContain('7')
  })

  it('uses the singular for one meal', async () => {
    stubCounts({ meals: 1 })

    expect(await todaySuccesses('u1', new Date())).toContain('1 meal')
    expect(await todaySuccesses('u1', new Date())).not.toContain('1 meals')
  })

  it('returns null when nothing was logged', async () => {
    stubCounts()

    await expect(todaySuccesses('u1', new Date())).resolves.toBeNull()
  })

  it('builds the summary without an LLM call', async () => {
    // The whole point is to stop spending model calls; generating this
    // sentence would defeat the limit it is attached to.
    stubCounts({ meals: 2 })
    const summary = await todaySuccesses('u1', new Date())

    expect(typeof summary).toBe('string')
  })
})

describe('limitMessage', () => {
  it('speaks in the coach voice and points at tomorrow', () => {
    const message = limitMessage('3 meals and a lift')

    expect(message).toMatch(/therapy app/i)
    expect(message).toMatch(/tomorrow/i)
    expect(message).toContain('3 meals and a lift')
  })

  it('does not scold when nothing was logged', () => {
    // A limit message is already a small rejection. Adding "you logged
    // nothing" to it would be the shaming this product refuses.
    const message = limitMessage(null)

    expect(message).toMatch(/tomorrow/i)
    expect(message).not.toMatch(/nothing|didn't log|failed/i)
  })
})

describe('the vision cap', () => {
  const originalEnv = process.env
  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...originalEnv }
  })

  it('is tracked separately from chat', async () => {
    mockPrisma.usageEvent.count.mockResolvedValue(0 as never)

    await isOverLimit('u1', 'vision', new Date())

    const where = mockPrisma.usageEvent.count.mock.calls[0][0]?.where as { kind: string }
    expect(where.kind).toBe('vision')
  })

  it('is lower than the chat cap by default, being the pricier call', () => {
    delete process.env.DAILY_MESSAGE_LIMIT
    delete process.env.DAILY_PHOTO_LIMIT
    expect(dailyLimit('vision')).toBeLessThan(dailyLimit('chat'))
  })

  it('has its own env var', () => {
    process.env.DAILY_PHOTO_LIMIT = '7'
    expect(dailyLimit('vision')).toBe(7)
    expect(dailyMessageLimit()).not.toBe(7)
  })

  it('speaks in the coach voice', () => {
    expect(photoLimitMessage(null)).toMatch(/camera/i)
    expect(photoLimitMessage(null)).toMatch(/tomorrow/i)
    expect(photoLimitMessage(null)).not.toMatch(/nothing|failed/i)
  })
})

describe('recordUsage', () => {
  beforeEach(() => vi.resetAllMocks())

  it('writes one row per call', async () => {
    await recordUsage('u1', 'vision')

    expect(mockPrisma.usageEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', kind: 'vision' },
    })
  })

  it('swallows a failed write rather than failing the user request', async () => {
    // Bookkeeping must never break the thing the user actually asked for.
    // Undercounting is the safe direction.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockPrisma.usageEvent.create.mockRejectedValue(new Error('db down'))

    await expect(recordUsage('u1', 'chat')).resolves.toBeUndefined()
  })
})

describe('UsageLimitError', () => {
  it('carries copy the caller can show verbatim', () => {
    const error = new UsageLimitError('enough photos, hon')

    expect(error).toBeInstanceOf(Error)
    expect(error.userMessage).toBe('enough photos, hon')
  })
})
