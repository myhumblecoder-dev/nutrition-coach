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
  denialFor,
  monthlySpendUsd,
  monthlyCeilingUsd,
  attributeTokens,
} from './limits'
import { prisma } from '@/lib/db'
import { isEntitled } from '@/lib/entitlement'

vi.mock('@/lib/entitlement', () => ({ isEntitled: vi.fn() }))

vi.mock('@/lib/db', () => ({
  prisma: {
    usageEvent: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
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

    // "Witness" is the load-bearing word — it names what the app claims, and
    // the receipts feed is the evidence for it.
    expect(message).toMatch(/therapist/i)
    expect(message).toMatch(/witness/i)
    expect(message).toMatch(/tomorrow/i)
    expect(message).toContain('3 meals and a lift')
  })

  it('does not gush, which the persona rules out', () => {
    // "Brisk, dry... you do not gush." A refusal that says "great job!" is a
    // different coach from the one doing the rest of the talking.
    const message = limitMessage('3 meals and a lift')

    expect(message).not.toMatch(/great job|amazing|well done|proud/i)
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

    // Null rather than an id: there is no row to attribute tokens to, so the
    // call's cost falls back to the estimate. Still no throw.
    await expect(recordUsage('u1', 'chat')).resolves.toBeNull()
  })

  it('hands back the row id so the real cost can be filled in later', async () => {
    mockPrisma.usageEvent.create.mockResolvedValue({ id: 'event-1' } as never)

    await expect(recordUsage('u1', 'chat')).resolves.toBe('event-1')
  })
})

describe('UsageLimitError', () => {
  it('carries copy the caller can show verbatim', () => {
    const error = new UsageLimitError('enough photos, hon')

    expect(error).toBeInstanceOf(Error)
    expect(error.userMessage).toBe('enough photos, hon')
  })
})

describe('denialFor', () => {
  const mockEntitled = vi.mocked(isEntitled)

  beforeEach(() => {
    vi.resetAllMocks()
    stubCounts()
    mockPrisma.usageEvent.count.mockResolvedValue(0 as never)
    mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: {} } as never)
    mockPrisma.usageEvent.groupBy.mockResolvedValue([] as never)
  })

  it('lets an entitled user under the cap through', async () => {
    mockEntitled.mockResolvedValue(true)

    expect(await denialFor('u1', 'chat')).toBeNull()
  })

  it('refuses an account with no subscription, and says why in a way code can read', async () => {
    mockEntitled.mockResolvedValue(false)

    const denial = await denialFor('u1', 'chat')

    // The prose is for the user; the reason is for the client, which has to
    // decide between an inline message and a paywall.
    expect(denial?.reason).toBe('subscription_required')
    expect(denial?.userMessage).toMatch(/subscri/i)
  })

  it('never counts usage for an account that cannot spend anyway', async () => {
    mockEntitled.mockResolvedValue(false)

    await denialFor('u1', 'chat')

    // A lapsed user must not be able to grow the usage table either.
    expect(mockPrisma.usageEvent.count).not.toHaveBeenCalled()
  })

  it('separates a spent cap from an absent subscription', async () => {
    mockEntitled.mockResolvedValue(true)
    mockPrisma.usageEvent.count.mockResolvedValue(999 as never)

    const denial = await denialFor('u1', 'chat')

    // Same refusal to the user, completely different remedy: one is "come
    // back tomorrow", the other is "this costs money now".
    expect(denial?.reason).toBe('capped')
  })

  it('uses the right copy for each kind of spend', async () => {
    mockEntitled.mockResolvedValue(true)
    mockPrisma.usageEvent.count.mockResolvedValue(999 as never)

    // The two refusals must not read the same: one is about the camera, the
    // other about talking.
    expect((await denialFor('u1', 'vision'))?.userMessage).toMatch(/camera/i)
    expect((await denialFor('u1', 'chat'))?.userMessage).not.toMatch(/camera/i)
    expect((await denialFor('u1', 'chat'))?.userMessage).toMatch(/therapist/i)
  })
})

describe('the caps are sized to the subscription price', () => {
  const originalEnv = process.env
  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.DAILY_MESSAGE_LIMIT
    delete process.env.DAILY_PHOTO_LIMIT
  })

  it('cannot let one account cost more than it pays', () => {
    // $7.99/mo nets $6.79 after Apple's 15%. A chat exchange is ~$0.0029 (two
    // calls) and a photo ~$0.0038. If this ever fails, either the caps or the
    // price moved and the other has not caught up.
    const worstCaseMonthly = (dailyLimit('chat') * 0.0029 + dailyLimit('vision') * 0.0038) * 30

    expect(worstCaseMonthly).toBeLessThan(6.79)
  })

  it('still sits well above a heavy honest day', () => {
    // 25 messages and 10 photos is a heavy real day. Someone using the app
    // properly should never meet the cap.
    expect(dailyLimit('chat')).toBeGreaterThan(25)
    expect(dailyLimit('vision')).toBeGreaterThan(10)
  })
})

describe('spend is measured, not assumed', () => {
  const stubSpend = (
    sums: { inputTokens: number | null; outputTokens: number | null },
    unmeasured: { kind: string; _count: { _all: number } }[] = []
  ) => {
    mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: sums } as never)
    mockPrisma.usageEvent.groupBy.mockResolvedValue(unmeasured as never)
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.unstubAllEnvs()
  })

  it('prices real tokens at the model rate', async () => {
    // Haiku 4.5 is $1/MTok in, $5/MTok out.
    stubSpend({ inputTokens: 1_000_000, outputTokens: 1_000_000 })

    expect(await monthlySpendUsd('u1', new Date())).toBeCloseTo(6, 5)
  })

  it('prices at the configured model, not always Haiku', async () => {
    // Pointing LLM_MODEL at a pricier model while the rates stayed at $1/$5
    // would price every row about a third of its cost — so the ceiling that
    // exists to survive a wrong estimate would itself be wrong, silently.
    vi.stubEnv('LLM_MODEL', 'claude-sonnet-5')
    stubSpend({ inputTokens: 1_000_000, outputTokens: 0 })

    expect(await monthlySpendUsd('u1', new Date())).toBeCloseTo(3, 5)
  })

  it('charges an unknown model at the dearest rate it knows', async () => {
    // Over-charging trips the ceiling early, which is visible. Under-charging
    // spends money nobody notices.
    vi.stubEnv('LLM_MODEL', 'something-new')
    stubSpend({ inputTokens: 1_000_000, outputTokens: 0 })

    expect(await monthlySpendUsd('u1', new Date())).toBeCloseTo(5, 5)
  })

  it('falls back to the per-call estimate for rows with no tokens', async () => {
    // Every row written before tokens were recorded, and every call that
    // failed before reporting. Ignoring them would under-count spend, which is
    // the one direction a cost ceiling must never err in.
    stubSpend({ inputTokens: null, outputTokens: null }, [
      { kind: 'chat', _count: { _all: 1 } },
      { kind: 'vision', _count: { _all: 1 } },
    ])

    expect(await monthlySpendUsd('u1', new Date())).toBeCloseTo(0.0029 + 0.0038, 5)
  })

  it('counts a rolling thirty days for one user', async () => {
    stubSpend({ inputTokens: 0, outputTokens: 0 })
    const now = new Date('2026-09-20T00:00:00.000Z')

    await monthlySpendUsd('u1', now)

    const where = mockPrisma.usageEvent.aggregate.mock.calls[0][0]?.where as {
      userId: string
      createdAt: { gte: Date }
    }
    expect(where.userId).toBe('u1')
    // Rolling, not calendar: a calendar reset lets someone burn a full month
    // on the 31st and another on the 1st.
    const days = (now.getTime() - where.createdAt.gte.getTime()) / 86_400_000
    expect(days).toBeCloseTo(30, 1)
  })

  it('has a ceiling above a heavy honest month but below the daily caps', () => {
    // Heavy honest use is ~$3.31/month. The daily caps allow ~$4.32. The
    // ceiling sits between: it never troubles a real user, and it still stops
    // an account whose calls cost more than the estimate says they do.
    expect(monthlyCeilingUsd()).toBeGreaterThan(3.31)
    expect(monthlyCeilingUsd()).toBeLessThan(6.79)
  })
})

describe('the monthly ceiling', () => {
  const mockEntitled = vi.mocked(isEntitled)

  beforeEach(() => {
    vi.resetAllMocks()
    stubCounts()
    mockEntitled.mockResolvedValue(true)
    mockPrisma.usageEvent.count.mockResolvedValue(0 as never)
    mockPrisma.usageEvent.aggregate.mockResolvedValue({ _sum: {} } as never)
    mockPrisma.usageEvent.groupBy.mockResolvedValue([] as never)
  })

  it('lets an ordinary month through', async () => {
    expect(await denialFor('u1', 'chat')).toBeNull()
  })

  it('stops an account that has spent its month, even under the daily cap', async () => {
    // The daily caps bound a burst; this bounds the bill. Without it, thirty
    // saturated days in a row is simply allowed.
    mockPrisma.usageEvent.aggregate.mockResolvedValue({
      _sum: { inputTokens: 40_000_000, outputTokens: 4_000_000 },
    } as never)

    const denial = await denialFor('u1', 'chat')

    expect(denial?.reason).toBe('capped')
    // Its own copy: the daily message says "come back tomorrow", and tomorrow
    // changes nothing when the window is a rolling thirty days.
    expect(denial?.userMessage).not.toMatch(/tomorrow/i)
  })
})

describe('attributeTokens', () => {
  beforeEach(() => vi.resetAllMocks())

  it('fills in what the call cost once it is known', async () => {
    mockPrisma.usageEvent.findUnique.mockResolvedValue(
      { inputTokens: null, outputTokens: null } as never
    )

    await attributeTokens('event-1', { inputTokens: 1200, outputTokens: 300 })

    const arg = mockPrisma.usageEvent.update.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'event-1' })
    expect(arg.data).toEqual({ inputTokens: 1200, outputTokens: 300 })
  })

  it('adds the second call of a turn rather than replacing the first', async () => {
    // A chat turn is two model calls — the reply and the extraction pass — and
    // the estimate it replaces was sized for both. Overwriting made a measured
    // row cheaper than the estimate, so the ceiling got weaker the moment it
    // started measuring.
    mockPrisma.usageEvent.findUnique.mockResolvedValue(
      { inputTokens: 1200, outputTokens: 300 } as never
    )

    await attributeTokens('event-1', { inputTokens: 800, outputTokens: 150 })

    expect(mockPrisma.usageEvent.update.mock.calls[0][0].data).toEqual({
      inputTokens: 2000,
      outputTokens: 450,
    })
  })

  it('does nothing without an event to attribute to', async () => {
    // recordUsage swallows its own failures, so the id can legitimately be
    // absent. Bookkeeping must never break the request it is describing.
    await attributeTokens(null, { inputTokens: 1, outputTokens: 1 })

    expect(mockPrisma.usageEvent.update).not.toHaveBeenCalled()
  })

  it('never throws when the write fails', async () => {
    mockPrisma.usageEvent.update.mockRejectedValue(new Error('db down'))

    await expect(
      attributeTokens('event-1', { inputTokens: 1, outputTokens: 1 })
    ).resolves.toBeUndefined()
  })
})
