import { describe, it, expect, vi, beforeEach } from 'vitest'
import { coachReply } from './chat'
import { prisma } from '@/lib/db'
import { generate } from '@/lib/llm'
import { extractHealthFacts } from '@/lib/extraction'
import { caffeineStatus } from '@/lib/caffeine'

// The cap has its own tests; here it is stubbed off so the existing cases
// exercise the reply path rather than the limit.
vi.mock('@/lib/limits', () => ({
  denialFor: vi.fn().mockResolvedValue(null),
  recordUsage: vi.fn().mockResolvedValue(undefined),
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
    moodEntry: {
      findFirst: vi.fn(),
    },
    weeklyCheckIn: {
      findFirst: vi.fn(),
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
    vi.mocked(prisma.moodEntry.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.weeklyCheckIn.findFirst).mockResolvedValue(null)
    vi.mocked(extractHealthFacts).mockResolvedValue({
      meals: 0, training: 0, recovery: 0, mood: 0, measurement: 0,
    })
  })

  it('extraction runs on every user turn', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('Nice!')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)

    await coachReply('u1', 'how did I do?')

    expect(extractHealthFacts).toHaveBeenCalledWith(
      'u1',
      'how did I do?',
      expect.anything()
    )
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
    expect(promptCall).toContain('Today so far: 485 of 2000 cal, 37g of 150g protein, 0g fat.')
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

  it('returns the refusal without calling the model or writing a row', async () => {
    // The gate exists to stop spending. Persisting the exchange would let an
    // abusive client keep growing the table for free.
    const { denialFor } = await import('@/lib/limits')
    vi.mocked(denialFor).mockResolvedValue({
      reason: 'capped',
      userMessage: 'limit reached',
    })

    const result = await coachReply('u1', 'hello again')

    expect(result.assistantReply).toBe('limit reached')
    expect(generate).not.toHaveBeenCalled()
    expect(prisma.chatMessage.create).not.toHaveBeenCalled()
    expect(extractHealthFacts).not.toHaveBeenCalled()

    const { recordUsage } = await import('@/lib/limits')
    expect(recordUsage).not.toHaveBeenCalled()
  })

  it('says the subscription is the problem when it is', async () => {
    // Same shape of refusal, different remedy — a lapsed user is not someone
    // who should be told to come back tomorrow.
    const { denialFor } = await import('@/lib/limits')
    vi.mocked(denialFor).mockResolvedValue({
      reason: 'subscription_required',
      userMessage: 'that needs a subscription',
    })

    const result = await coachReply('u1', 'hello again')

    expect(result.assistantReply).toBe('that needs a subscription')
    expect(generate).not.toHaveBeenCalled()
  })

  it("sends the model redacted text but keeps the user's own words as the receipt", async () => {
    // The receipts feed quotes what you said back at you. Storing the redacted
    // string there would show "[redacted]" as the source of a meal, telling
    // the person who typed it nothing.
    // An earlier test leaves denialFor returning a denial: clearAllMocks
    // resets calls, not implementations, so this has to be put back or the
    // turn short-circuits before extraction.
    const { denialFor } = await import('@/lib/limits')
    vi.mocked(denialFor).mockResolvedValue(null)
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)
    vi.mocked(generate).mockResolvedValue('Right.')

    await coachReply('u1', 'burrito bowl, text me on 555-123-4567')

    const [, modelText, options] = vi.mocked(extractHealthFacts).mock.calls.at(-1)!
    expect(modelText).toBe('burrito bowl, text me on [redacted]')
    expect(options?.sourceText).toBe('burrito bowl, text me on 555-123-4567')
  })

  it('surfaces WHY it refused, not just the words', async () => {
    // The prose is for the user; the reason is for the route, which has to
    // choose between 402 and a plain reply. Without it, a lapsed user's
    // refusal arrives as an ordinary coach message and the app never learns
    // it should raise a paywall — on the most-used gated action there is.
    const { denialFor } = await import('@/lib/limits')
    vi.mocked(denialFor).mockResolvedValue({
      reason: 'subscription_required',
      userMessage: 'that needs a subscription',
    })

    const result = await coachReply('u1', 'hello again')

    expect(result.assistantReply).toBe('that needs a subscription')
    expect(result.denialReason).toBe('subscription_required')
  })

  it('marks a spent cap as capped, which is answered differently', async () => {
    const { denialFor } = await import('@/lib/limits')
    vi.mocked(denialFor).mockResolvedValue({ reason: 'capped', userMessage: 'enough' })

    expect((await coachReply('u1', 'hi')).denialReason).toBe('capped')
  })

  it('reports no reason at all when nothing was refused', async () => {
    const { denialFor } = await import('@/lib/limits')
    vi.mocked(denialFor).mockResolvedValue(null)
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)
    vi.mocked(generate).mockResolvedValue('Right.')

    expect((await coachReply('u1', 'had eggs')).denialReason).toBeUndefined()
  })
})

describe('quality readings in the coach prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)
    vi.mocked(generate).mockResolvedValue('Logged.')
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue({
      id: 't1',
      userId: 'u1',
      calories: 2000,
      protein: 150,
      createdAt: new Date(Date.UTC(2024, 0, 1)),
      updatedAt: new Date(Date.UTC(2024, 0, 1)),
    } as never)
  })

  it('tells the coach not to treat ultra-processed as a verdict', async () => {
    // The gauge can only show a position. It cannot say that a protein shake
    // is ultra-processed *and* fine — which is the case where a bare marker
    // would contradict the coach's own advice to hit a protein target. So the
    // nuance is the coach's job, and it has to be told that.
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([
      {
        totalCalories: 400,
        totalProtein: 40,
        totalFat: 10,
        foodItems: JSON.stringify([
          { name: 'protein shake', calories: 200, processingGroup: 4, fat: 3, fatSource: 'refined' },
          { name: 'eggs', calories: 200, processingGroup: 1, fat: 7, fatSource: 'whole' },
        ]),
      },
    ] as never)
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(
      { calories: 2000, protein: 150 } as never
    )
    vi.mocked(generate).mockResolvedValue('Logged.')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)

    await coachReply('u1', 'shake and eggs')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).toContain('How processed today was:')
    expect(prompt).toContain('Ultra-processed is not a verdict')
    expect(prompt).toContain('Never imply they should feel bad about it')
  })

  it('describes fat quality as source rather than saturation', async () => {
    // The distinction the whole feature rests on. A coach told "saturated"
    // would talk about butter being the problem, which is the opposite of
    // what the numbers mean.
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([
      {
        totalCalories: 300,
        totalProtein: 5,
        totalFat: 20,
        foodItems: JSON.stringify([
          { name: 'avocado', calories: 300, processingGroup: 1, fat: 20, fatSource: 'whole' },
        ]),
      },
    ] as never)
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(
      { calories: 2000, protein: 150 } as never
    )
    vi.mocked(generate).mockResolvedValue('Logged.')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)

    await coachReply('u1', 'avocado')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).toContain('not saturated versus unsaturated')
  })

  it('says nothing about quality on a day with nothing classified', async () => {
    // Every meal already in the database. Silence beats a claim.
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([
      {
        totalCalories: 300,
        totalProtein: 20,
        totalFat: 0,
        foodItems: JSON.stringify([{ name: 'chicken', calories: 300, protein: 20 }]),
      },
    ] as never)
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(
      { calories: 2000, protein: 150 } as never
    )
    vi.mocked(generate).mockResolvedValue('Logged.')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)

    await coachReply('u1', 'chicken')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).not.toContain('How processed today was:')
    expect(prompt).not.toContain('Fat quality:')
  })
})

describe('the coach only claims what was actually written', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('Logged.')
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue({
      id: 't1',
      userId: 'u1',
      calories: 2000,
      protein: 150,
      createdAt: new Date(Date.UTC(2024, 0, 1)),
      updatedAt: new Date(Date.UTC(2024, 0, 1)),
    } as never)
  })

  it('extracts before replying, so the reply can know', async () => {
    // The ordering IS the fix. Replying first meant "Logged." was said with no
    // knowledge of whether a row existed.
    const order: string[] = []
    vi.mocked(extractHealthFacts).mockImplementation(async () => {
      order.push('extract')
      return { meals: 1, training: 0, recovery: 0, mood: 0, measurement: 0 }
    })
    vi.mocked(generate).mockImplementation(async () => {
      order.push('generate')
      return 'Logged.'
    })

    await coachReply('u1', 'two eggs')

    expect(order).toEqual(['extract', 'generate'])
  })

  it('forbids saying "logged" when nothing was stored', async () => {
    // "Log 40g healthy fats" — the case that exposed this. Fat hangs off a
    // meal, there was no meal in the sentence, nothing was written, and the
    // coach answered "Logged." anyway.
    vi.mocked(extractHealthFacts).mockResolvedValue({
      meals: 0,
      training: 0,
      recovery: 0,
      mood: 0,
      measurement: 0,
    })

    await coachReply('u1', 'log 40g healthy fats')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).toContain('Nothing in this message was recorded')
    expect(prompt).toContain('Do NOT say "logged"')
    expect(prompt).toContain('no way to log fat on its own')
  })

  it('tells the coach what it may claim when something was stored', async () => {
    vi.mocked(extractHealthFacts).mockResolvedValue({
      meals: 1,
      training: 1,
      recovery: 0,
      mood: 0,
      measurement: 0,
    })

    await coachReply('u1', 'steak and sweet potato, and I lifted')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    // Singular labels, not "1 meals": a model repeats what it is given.
    expect(prompt).toContain('Recorded from this message: 1 meal, 1 training session')
    expect(prompt).toContain('You may say it is logged')
  })

  it('treats a failed extraction as nothing stored', async () => {
    // Failing open would be the worst of both: the coach free to claim a save
    // that did not happen, and no error anywhere.
    vi.mocked(extractHealthFacts).mockRejectedValue(new Error('model down'))

    await coachReply('u1', 'two eggs')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).toContain('Nothing in this message was recorded')
  })
})

describe('what the coach is told was recorded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('Logged.')
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue({
      id: 't1',
      userId: 'u1',
      calories: 2000,
      protein: 150,
      createdAt: new Date(Date.UTC(2024, 0, 1)),
      updatedAt: new Date(Date.UTC(2024, 0, 1)),
    } as never)
  })

  it('names a changed target rather than saying "1 targets"', async () => {
    // `recordHealthFacts` returns a sixth key TypeScript erases at the
    // assignment. Iterating the object blindly picked it up at runtime and
    // told the coach "1 targets" had been recorded.
    vi.mocked(extractHealthFacts).mockResolvedValue({
      meals: 0,
      training: 0,
      recovery: 0,
      mood: 0,
      measurement: 0,
      targets: 1,
    } as never)

    await coachReply('u1', 'make my target 2200 calories')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).toContain('1 daily target')
    expect(prompt).not.toContain('1 targets')
  })

  it('pluralises properly', async () => {
    vi.mocked(extractHealthFacts).mockResolvedValue({
      meals: 2,
      training: 0,
      recovery: 3,
      mood: 0,
      measurement: 0,
    })

    await coachReply('u1', 'two meals and some water')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).toContain('2 meals, 3 recovery entries')
  })
})

describe('what the coach can see about today', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never)
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([])
    vi.mocked(prisma.trainingEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.moodEntry.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.weeklyCheckIn.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.measurement.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(null)
    vi.mocked(extractHealthFacts).mockResolvedValue({
      meals: 0, training: 0, recovery: 0, mood: 0, measurement: 0,
    })
    vi.mocked(generate).mockResolvedValue('Logged.')
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue({
      id: 't1', userId: 'u1', calories: 2000, protein: 150,
      createdAt: new Date(Date.UTC(2024, 0, 1)),
      updatedAt: new Date(Date.UTC(2024, 0, 1)),
    } as never)
  })

  it('names the food, not just the totals', async () => {
    // The gap that caused a real confusion: asked about "the meals I have
    // logged", the coach answered from the conversation because the item names
    // were fetched, summed, and discarded. A photo-logged meal was invisible
    // as content.
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([
      {
        totalCalories: 300,
        totalProtein: 5,
        totalFat: 20,
        foodItems: JSON.stringify([{ name: 'avocado' }]),
        loggedAt: new Date('2026-09-11T16:00:00Z'),
      },
    ] as never)

    await coachReply('u1', 'what have I eaten')

    expect(vi.mocked(generate).mock.calls[0][0]).toContain('avocado')
  })

  it('can see last night\'s sleep', async () => {
    // Caffeine had a decay model and a sentence of context. Sleep was not read
    // at all, despite being logged and being the bigger lever.
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([
      { kind: 'sleep', value: 6.5 },
    ] as never)

    await coachReply('u1', 'I feel rough')

    expect(vi.mocked(generate).mock.calls[0][0]).toContain('6.5h sleep')
  })

  it('remembers the answers it was given at the check-in', async () => {
    // It ran the interview and could not see the answers afterwards.
    vi.mocked(prisma.weeklyCheckIn.findFirst).mockResolvedValue({
      weekOf: new Date('2026-09-07T00:00:00Z'),
      bodyAnswer: 'waist down a bit',
      strengthAnswer: null,
      sleepAnswer: 'rough, travelling',
      moodAnswer: null,
    } as never)

    await coachReply('u1', 'how am I doing')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).toContain('waist down a bit')
    expect(prompt).toContain('rough, travelling')
  })

  it('can see today\'s mood', async () => {
    vi.mocked(prisma.moodEntry.findFirst).mockResolvedValue({
      score: 2,
      note: 'wiped out',
    } as never)

    await coachReply('u1', 'not great today')

    expect(vi.mocked(generate).mock.calls[0][0]).toContain('wiped out')
  })

  it('adds no noise on a day with nothing logged', async () => {
    // Empty means absent, not a placeholder. "No mood logged" in every turn of
    // every user who never logs mood is a line of pure cost.
    await coachReply('u1', 'hello')

    const prompt = vi.mocked(generate).mock.calls[0][0]
    expect(prompt).not.toContain('Eaten today')
    expect(prompt).not.toContain('Mood today')
    expect(prompt).not.toContain('Last check-in')
    expect(prompt).not.toContain('Logged today')
  })
})
