import { describe, it, expect, vi, beforeEach } from 'vitest'
import { coachReply } from './chat'
import { prisma } from '@/lib/db'
import { generate } from '@/lib/llm'
import { extractHealthFacts } from '@/lib/extraction'
import { caffeineStatus } from '@/lib/caffeine'

// The cap has its own tests; here it is stubbed off so the existing cases
// exercise the reply path rather than the limit.
vi.mock('@/lib/limits', () => ({
  isOverLimit: vi.fn().mockResolvedValue(false),
  todaySuccesses: vi.fn().mockResolvedValue(null),
  limitMessage: vi.fn(() => 'limit reached'),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    chatMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    dailyTarget: {
      findUnique: vi.fn(),
    },
    mealEntry: {
      findMany: vi.mocked(vi.fn()),
    },
    trainingEntry: {
      findMany: vi.fn(),
    },
    measurement: {
      findFirst: vi.fn(),
    },
    userProfile: {
      findUnique: vi.fn(),
    },
    recoveryEntry: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/llm', () => ({
  generate: vi.fn(),
}))

vi.mock('@/lib/extraction', () => ({ extractHealthFacts: vi.fn() }))
vi.mock('@/lib/caffeine', () => ({ caffeineStatus: vi.fn() }))

describe('chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default behavior: no target, no meals
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([])
    vi.mocked(prisma.trainingEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.measurement.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(extractHealthFacts).mockResolvedValue({
      meals: 0, training: 0, recovery: 0, mood: 0, measurement: 0,
    })
  })

  it('extraction runs on every user turn', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('Nice!')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)

    await coachReply('u1', 'how did I do?')

    expect(extractHealthFacts).toHaveBeenCalledWith('u1', 'how did I do?')
  })

  it('an extraction failure does not break the reply', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('Nice!')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)
    vi.mocked(extractHealthFacts).mockRejectedValue(new Error('boom'))

    await expect(coachReply('u1', 'hello')).resolves.toEqual({ assistantReply: 'Nice!' })
  })

  it('the prompt forbids markdown', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('ok')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)

    await coachReply('u1', 'hello')

    expect(vi.mocked(generate).mock.calls[0][0]).toContain('no markdown')
  })

  it('the prompt includes weekly training and latest measurement', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('ok')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)
    vi.mocked(prisma.trainingEntry.findMany).mockResolvedValue([
      { kind: 'resistance' }, { kind: 'resistance' }, { kind: 'hiit' },
    ] as never)
    vi.mocked(prisma.measurement.findFirst).mockResolvedValue({
      weightLb: 172, waistIn: null,
    } as never)

    await coachReply('u1', 'hello')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).toContain('This week: 2 resistance, 1 hiit, 0 core sessions.')
    expect(prompt).toContain('Latest measurement: 172 lb.')
  })

  it('the context lines are omitted without data', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('ok')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)

    await coachReply('u1', 'hello')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).not.toContain('This week:')
    expect(prompt).not.toContain('Latest measurement:')
  })

  it('rejects an empty message', async () => {
    await expect(coachReply('u1', '   ')).rejects.toThrow('Message cannot be empty')
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled()
  })

  it('generates persists and returns the reply', async () => {
    const userId = 'u1'
    const userText = 'how did I do?'
    const assistantReply = 'Great job!'

    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue(assistantReply)
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as any)

    const result = await coachReply(userId, userText)

    const promptCall = vi.mocked(generate).mock.calls[0][0]
    expect(promptCall).toContain(`user: ${userText}`)

    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        role: 'user',
        content: 'how did I do?',
      }),
    })

    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        role: 'assistant',
        content: 'Great job!',
      }),
    })

    expect(result).toEqual({ assistantReply: 'Great job!' })
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2)
  })

  it("the prompt includes today's totals when a target exists", async () => {
    const userId = 'u1'
    const userText = 'How am I doing?'
    const assistantReply = 'You are doing great!'
    
    // Setup target and meals
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue({
      id: 't1',
      userId: 'u1',
      calories: 2000,
      protein: 150,
      createdAt: new Date(Date.UTC(2024, 0, 1)),
      updatedAt: new Date(Date.UTC(2024, 0, 1)),
    } as any)

    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([
      { totalCalories: 485, totalProtein: 37 } as any,
    ])

    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue(assistantReply)
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as any)

    await coachReply(userId, userText)

    const promptCall = vi.mocked(generate).mock.calls[0][0]
    expect(promptCall).toContain('Today so far: 485 of 2000 cal, 37g of 150g protein.')
  })

  it('the prompt omits the context line without a target', async () => {
    const userId = 'u1'
    const userText = 'How am I doing?'
    const assistantReply = 'You are doing great!'

    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([])
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue(assistantReply)
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as any)

    await coachReply(userId, userText)

    const promptCall = vi.mocked(generate).mock.calls[0][0]
    expect(promptCall).not.toContain('Today so far:')
  })

  it('the prompt tells the coach the current date and time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T15:41:00.000Z')) // Thu 10:41 AM EST
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('ok')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)

    await coachReply('u1', 'what time is it?')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).toContain('Today is Thursday, January 15, 2026, 10:41 AM (America/New_York).')
    vi.useRealTimers()
  })

  it('the prompt includes the home gym equipment when a profile exists', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('ok')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue({
      equipment: 'pull-up bar with rings, kettlebells, dumbbells',
    } as never)

    await coachReply('u1', 'what should I train?')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).toContain(
      'Home gym equipment: pull-up bar with rings, kettlebells, dumbbells.'
    )
  })

  it('the prompt omits the equipment line without a profile', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('ok')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)

    await coachReply('u1', 'hello')

    expect(vi.mocked(generate).mock.calls[0][0]).not.toContain('Home gym equipment:')
  })

  it('tells the coach how much caffeine is still active', async () => {
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([
      { kind: 'caffeine', value: 250, loggedAt: new Date('2026-09-02T13:00:00Z') },
    ] as never)
    vi.mocked(caffeineStatus).mockReturnValue({
      totalMg: 250,
      currentMg: 120,
      hoursUntilEffectsFade: 6.3,
      hoursUntilNegligible: 11.3,
    })
    vi.mocked(generate).mockResolvedValue('noted')

    await coachReply('u1', 'should I nap?')

    const prompt = vi.mocked(generate).mock.calls.at(-1)![0]
    expect(prompt).toContain('120 mg still active')
    expect(prompt).toContain('250 mg today')
    expect(prompt).toContain('6.3 more hours')
  })

  it('says nothing about caffeine when none was logged today', async () => {
    vi.mocked(caffeineStatus).mockReturnValue({
      totalMg: 0,
      currentMg: 0,
      hoursUntilEffectsFade: 0,
      hoursUntilNegligible: 0,
    })
    vi.mocked(generate).mockResolvedValue('noted')

    await coachReply('u1', 'hello')

    const prompt = vi.mocked(generate).mock.calls.at(-1)![0]
    expect(prompt).not.toContain('Caffeine:')
  })

  it('returns the limit message without calling the model or writing a row', async () => {
    // The cap exists to stop spending. Persisting the exchange would let an
    // abusive client keep growing the table for free.
    const { isOverLimit, todaySuccesses } = await import('@/lib/limits')
    vi.mocked(isOverLimit).mockResolvedValue(true)
    vi.mocked(todaySuccesses).mockResolvedValue('3 meals and a lift')

    const result = await coachReply('u1', 'hello again')

    expect(result.assistantReply).toBe('limit reached')
    expect(generate).not.toHaveBeenCalled()
    expect(prisma.chatMessage.create).not.toHaveBeenCalled()
    expect(extractHealthFacts).not.toHaveBeenCalled()
  })
})
