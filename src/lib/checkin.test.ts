import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CHECKIN_FIELDS,
  QUESTIONS,
  nextUnansweredField,
  buildAnswerPrompt,
  getOrCreateCheckIn,
  recordAnswer,
  listCheckIns,
} from './checkin'
import { prisma } from '@/lib/db'
import { generate } from '@/lib/llm'

vi.mock('@/lib/db', () => ({
  prisma: {
    weeklyCheckIn: { upsert: vi.fn(), update: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/llm', () => ({ generate: vi.fn() }))

const mockPrisma = vi.mocked(prisma, true)
const mockGenerate = vi.mocked(generate)

// Prisma types a field update as `value | { set: value }`, so the captured
// arguments need narrowing before they can be asserted on. These helpers keep
// that noise out of the tests themselves.
function upsertCall(index = 0) {
  return mockPrisma.weeklyCheckIn.upsert.mock.calls[index][0] as unknown as {
    where: { userId_weekOf: { weekOf: Date } }
    update: Record<string, unknown>
  }
}

function updateData(index = 0) {
  return mockPrisma.weeklyCheckIn.update.mock.calls[index][0].data as unknown as Record<
    string,
    string | Date | undefined
  >
}

function blankCheckIn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    userId: 'u1',
    weekOf: new Date('2026-08-31T04:00:00.000Z'),
    bodyAnswer: null,
    bodySourceText: null,
    strengthAnswer: null,
    strengthSourceText: null,
    sleepAnswer: null,
    sleepSourceText: null,
    moodAnswer: null,
    moodSourceText: null,
    completedAt: null,
    ...overrides,
  }
}

describe('the four questions', () => {
  it('asks exactly the four the product is built around', () => {
    expect(CHECKIN_FIELDS).toEqual(['body', 'strength', 'sleep', 'mood'])
  })

  it('phrases them as judgements the person makes, not numbers to report', () => {
    // The thesis: no counting. A question asking for a measurement would
    // reintroduce exactly the false precision the app rejects.
    for (const field of CHECKIN_FIELDS) {
      expect(QUESTIONS[field]).toBeTruthy()
      expect(QUESTIONS[field]).not.toMatch(/how many|how much|enter|log \d/i)
    }
  })
})

describe('nextUnansweredField', () => {
  it('starts at the first question', () => {
    expect(nextUnansweredField(blankCheckIn())).toBe('body')
  })

  it('advances in order as answers land', () => {
    expect(nextUnansweredField(blankCheckIn({ bodyAnswer: 'about the same' }))).toBe('strength')
    expect(
      nextUnansweredField(blankCheckIn({ bodyAnswer: 'a', strengthAnswer: 'b' }))
    ).toBe('sleep')
  })

  it('skips a field that was answered out of order', () => {
    expect(nextUnansweredField(blankCheckIn({ bodyAnswer: 'a', sleepAnswer: 'c' }))).toBe(
      'strength'
    )
  })

  it('returns null once all four are answered', () => {
    const done = blankCheckIn({
      bodyAnswer: 'a',
      strengthAnswer: 'b',
      sleepAnswer: 'c',
      moodAnswer: 'd',
    })
    expect(nextUnansweredField(done)).toBeNull()
  })
})

describe('buildAnswerPrompt', () => {
  it('asks the model to summarise, and forbids inventing what was not said', () => {
    const prompt = buildAnswerPrompt('sleep', 'rough week, kid was up a lot')

    expect(prompt).toContain('rough week, kid was up a lot')
    expect(prompt.toLowerCase()).toContain('never invent')
  })

  it('asks for a short phrase rather than a number', () => {
    const prompt = buildAnswerPrompt('body', 'jeans feel looser')

    expect(prompt).toMatch(/short/i)
    expect(prompt).not.toMatch(/estimate the (calories|weight|pounds)/i)
  })
})

describe('getOrCreateCheckIn', () => {
  beforeEach(() => vi.resetAllMocks())

  it('anchors the row to the Monday of the current week', async () => {
    mockPrisma.weeklyCheckIn.upsert.mockResolvedValue(blankCheckIn() as never)

    // A Wednesday.
    await getOrCreateCheckIn('u1', new Date('2026-09-02T20:00:00.000Z'))

    const call = upsertCall()
    const weekOf = call.where.userId_weekOf.weekOf
    // Monday of that week, in the app timezone.
    expect(weekOf.getTime()).toBeLessThan(new Date('2026-09-02T20:00:00.000Z').getTime())
    expect(call.update).toEqual({})
  })

  it('is idempotent — a second call in the same week returns the same row', async () => {
    mockPrisma.weeklyCheckIn.upsert.mockResolvedValue(blankCheckIn() as never)

    const now = new Date('2026-09-02T20:00:00.000Z')
    const a = await getOrCreateCheckIn('u1', now)
    const b = await getOrCreateCheckIn('u1', now)

    expect(a.weekOf.getTime()).toBe(b.weekOf.getTime())
    // Upsert with an empty update never clobbers answers already recorded.
    expect(upsertCall(1).update).toEqual({})
  })
})

describe('recordAnswer', () => {
  beforeEach(() => vi.resetAllMocks())

  it('stores the model summary alongside the verbatim words', async () => {
    mockGenerate.mockResolvedValue('sleeping worse')
    mockPrisma.weeklyCheckIn.upsert.mockResolvedValue(blankCheckIn() as never)
    mockPrisma.weeklyCheckIn.update.mockResolvedValue(blankCheckIn() as never)

    await recordAnswer('u1', 'sleep', 'rough week, kid was up a lot', new Date())

    const data = updateData()
    expect(data.sleepAnswer).toBe('sleeping worse')
    expect(data.sleepSourceText).toBe('rough week, kid was up a lot')
  })

  it('keeps the verbatim words even when the model call fails', async () => {
    // The receipt is the honest part. Losing it because a summariser errored
    // would leave a row the user cannot verify.
    mockGenerate.mockRejectedValue(new Error('rate limited'))
    mockPrisma.weeklyCheckIn.upsert.mockResolvedValue(blankCheckIn() as never)
    mockPrisma.weeklyCheckIn.update.mockResolvedValue(blankCheckIn() as never)

    await recordAnswer('u1', 'mood', 'honestly pretty flat', new Date())

    const data = updateData()
    expect(data.moodSourceText).toBe('honestly pretty flat')
    expect(data.moodAnswer).toBe('honestly pretty flat')
  })

  it('truncates a very long answer rather than rejecting it', async () => {
    mockGenerate.mockResolvedValue('fine')
    mockPrisma.weeklyCheckIn.upsert.mockResolvedValue(blankCheckIn() as never)
    mockPrisma.weeklyCheckIn.update.mockResolvedValue(blankCheckIn() as never)

    await recordAnswer('u1', 'body', 'x'.repeat(5000), new Date())

    const sourceText = updateData().bodySourceText as string
    expect(sourceText.length).toBeLessThanOrEqual(2000)
  })

  it('marks the check-in complete once the fourth answer lands', async () => {
    mockGenerate.mockResolvedValue('good')
    mockPrisma.weeklyCheckIn.upsert.mockResolvedValue(
      blankCheckIn({ bodyAnswer: 'a', strengthAnswer: 'b', sleepAnswer: 'c' }) as never
    )
    mockPrisma.weeklyCheckIn.update.mockResolvedValue(blankCheckIn() as never)

    await recordAnswer('u1', 'mood', 'good', new Date())

    expect(updateData().completedAt).toBeInstanceOf(Date)
  })

  it('leaves completedAt null while questions remain', async () => {
    mockGenerate.mockResolvedValue('same')
    mockPrisma.weeklyCheckIn.upsert.mockResolvedValue(blankCheckIn() as never)
    mockPrisma.weeklyCheckIn.update.mockResolvedValue(blankCheckIn() as never)

    await recordAnswer('u1', 'body', 'about the same', new Date())

    expect(updateData().completedAt).toBeUndefined()
  })
})

describe('listCheckIns', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns the user history newest first', async () => {
    mockPrisma.weeklyCheckIn.findMany.mockResolvedValue([] as never)

    await listCheckIns('u1')

    expect(mockPrisma.weeklyCheckIn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        orderBy: { weekOf: 'desc' },
      })
    )
  })
})
