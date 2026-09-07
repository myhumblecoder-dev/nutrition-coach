import { describe, it, expect, vi, beforeEach } from 'vitest'
import { coachReply } from '@/lib/chat'
import { prisma } from '@/lib/db'
import { generate } from '@/lib/llm'
import { QUESTIONS, awaitingCheckInAnswer, recordAnswer } from '@/lib/checkin'

// The weekly check-in is answered in the conversation rather than on a screen
// of its own. Before this existed, the cron pushed a question every week that
// nothing in the product could record an answer to.

vi.mock('@/lib/limits', () => ({
  isOverLimit: vi.fn().mockResolvedValue(false),
  recordUsage: vi.fn(),
  todaySuccesses: vi.fn().mockResolvedValue(0),
  limitMessage: vi.fn(() => 'capped'),
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    chatMessage: { findMany: vi.fn(), create: vi.fn() },
    dailyTarget: { findUnique: vi.fn() },
    mealEntry: { findMany: vi.fn() },
    trainingEntry: { findMany: vi.fn() },
    measurement: { findFirst: vi.fn() },
    userProfile: { findUnique: vi.fn() },
    recoveryEntry: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/llm', () => ({ generate: vi.fn() }))
vi.mock('@/lib/extraction', () => ({ extractHealthFacts: vi.fn() }))
vi.mock('@/lib/caffeine', () => ({ caffeineStatus: vi.fn() }))
vi.mock('@/lib/checkin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/checkin')>()),
  awaitingCheckInAnswer: vi.fn(),
  recordAnswer: vi.fn(),
}))

const mockAwaiting = vi.mocked(awaitingCheckInAnswer)
const mockRecord = vi.mocked(recordAnswer)

const answered = (fields: Record<string, string | null>) => ({
  bodyAnswer: null, strengthAnswer: null, sleepAnswer: null, moodAnswer: null,
  ...fields,
})

describe('answering the weekly check-in in the conversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.trainingEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.measurement.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      { role: 'assistant', content: QUESTIONS.body },
    ] as never)
    vi.mocked(generate).mockResolvedValue('Same is fine, hon. Why do you think that is?')
  })

  it('records the reply as the answer when the coach just asked', async () => {
    mockAwaiting.mockResolvedValue('body')
    mockRecord.mockResolvedValue(answered({ bodyAnswer: 'About the same' }) as never)

    const { assistantReply } = await coachReply('u1', 'about the same honestly')

    expect(mockRecord).toHaveBeenCalledWith('u1', 'body', 'about the same honestly')
    expect(assistantReply).toBe('Same is fine, hon. Why do you think that is?')
  })

  it('writes both sides to the chat, so the check-in reads as conversation', async () => {
    mockAwaiting.mockResolvedValue('body')
    mockRecord.mockResolvedValue(answered({ bodyAnswer: 'About the same' }) as never)

    await coachReply('u1', 'about the same honestly')

    const written = vi.mocked(prisma.chatMessage.create).mock.calls.map((c) => c[0].data)
    expect(written).toContainEqual(
      expect.objectContaining({ role: 'user', content: 'about the same honestly' })
    )
    expect(written).toContainEqual(expect.objectContaining({ role: 'assistant' }))
  })

  it('keeps the answer when the coach reply fails, and still asks the next question', async () => {
    // The record is the point; the reply is decoration. Losing the answer to a
    // model timeout would be the one unrecoverable outcome.
    mockAwaiting.mockResolvedValue('body')
    mockRecord.mockResolvedValue(answered({ bodyAnswer: 'About the same' }) as never)
    vi.mocked(generate).mockRejectedValue(new Error('rate limited'))

    const { assistantReply } = await coachReply('u1', 'about the same honestly')

    expect(mockRecord).toHaveBeenCalled()
    expect(assistantReply).toBe(QUESTIONS.strength)
  })

  it('says the check-in is done when the last field is answered', async () => {
    mockAwaiting.mockResolvedValue('mood')
    mockRecord.mockResolvedValue(
      answered({ bodyAnswer: 'a', strengthAnswer: 'b', sleepAnswer: 'c', moodAnswer: 'd' }) as never
    )
    vi.mocked(generate).mockRejectedValue(new Error('rate limited'))

    const { assistantReply } = await coachReply('u1', 'good actually')

    expect(assistantReply).toMatch(/whole check-in/i)
  })

  it('is an ordinary chat message when no check-in is open', async () => {
    // The guard that stops small talk being recorded as a body measurement.
    mockAwaiting.mockResolvedValue(null)
    vi.mocked(generate).mockResolvedValue('Sure thing.')

    const { assistantReply } = await coachReply('u1', 'what should I eat tonight?')

    expect(mockRecord).not.toHaveBeenCalled()
    expect(assistantReply).toBe('Sure thing.')
  })

  it('only offers the coach a message it actually sent as the trigger', async () => {
    // A user message must never be mistaken for the coach having asked.
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      { role: 'user', content: QUESTIONS.body },
    ] as never)
    mockAwaiting.mockResolvedValue(null)

    await coachReply('u1', 'about the same')

    expect(mockAwaiting).toHaveBeenCalledWith('u1', null)
  })

  it('still extracts facts from a check-in answer', async () => {
    // "172 on the scale" belongs on Today whether it arrived as an answer or
    // as small talk.
    const { extractHealthFacts } = await import('@/lib/extraction')
    mockAwaiting.mockResolvedValue('body')
    mockRecord.mockResolvedValue(answered({ bodyAnswer: 'Leaner' }) as never)

    await coachReply('u1', 'leaner, 172 on the scale')

    expect(vi.mocked(extractHealthFacts)).toHaveBeenCalledWith('u1', 'leaner, 172 on the scale')
  })

  it('stamps the question before the answer, not alongside it', async () => {
    // The reply used to render above the message it answered, on web and iOS
    // alike: both rows were created in a Promise.all with createdAt defaulting
    // to now(), so at millisecond resolution the pair could tie or invert and
    // the ordering was a coin flip.
    mockAwaiting.mockResolvedValue('body')
    mockRecord.mockResolvedValue(answered({ bodyAnswer: 'About the same' }) as never)

    await coachReply('u1', 'about the same honestly')

    const calls = vi.mocked(prisma.chatMessage.create).mock.calls.map((c) => c[0].data)
    const user = calls.find((d) => d.role === 'user')
    const assistant = calls.find((d) => d.role === 'assistant')

    expect(user?.createdAt).toBeInstanceOf(Date)
    expect(assistant?.createdAt).toBeInstanceOf(Date)
    expect((assistant!.createdAt as Date).getTime()).toBeGreaterThan(
      (user!.createdAt as Date).getTime()
    )
  })

  it('writes the user message first, so a partial failure loses the reply not the question', async () => {
    mockAwaiting.mockResolvedValue(null)
    vi.mocked(generate).mockResolvedValue('Sure thing.')

    await coachReply('u1', 'what should I eat tonight?')

    const roles = vi.mocked(prisma.chatMessage.create).mock.calls.map((c) => c[0].data.role)
    expect(roles).toEqual(['user', 'assistant'])
  })
})

