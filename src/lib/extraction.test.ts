import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildExtractionPrompt,
  parseHealthFacts,
  recordHealthFacts,
  extractHealthFacts,
} from './extraction'
import { prisma } from '@/lib/db'
import { generate } from '@/lib/llm'

vi.mock('@/lib/db', () => ({
  prisma: {
    mealEntry: { create: vi.fn(), findMany: vi.fn() },
    trainingEntry: { create: vi.fn(), findMany: vi.fn() },
    recoveryEntry: { create: vi.fn(), findMany: vi.fn() },
    moodEntry: { create: vi.fn() },
    measurement: { create: vi.fn() },
  },
}))
vi.mock('@/lib/llm', () => ({ generate: vi.fn() }))

describe('extraction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('the prompt embeds seeds and the user message', () => {
    const prompt = buildExtractionPrompt(
      { meals: ['Salad'], training: [], recovery: [] },
      'I ran sprints'
    )

    expect(prompt).toContain('Already logged today')
    expect(prompt).toContain('Salad')
    expect(prompt).toContain('Message: I ran sprints')
  })

  it('a fenced response still parses', () => {
    const fenced =
      '```json\n' +
      JSON.stringify({
        meals: [],
        training: [{ kind: 'hiit', minutes: 20 }],
        recovery: [],
        mood: [],
        measurement: [],
      })
      + '\n```'

    const facts = parseHealthFacts(fenced)

    expect(facts.training).toHaveLength(1)
    expect(facts.training[0].kind).toBe('hiit')
  })

  it('garbage input returns empty facts', () => {
    const facts = parseHealthFacts('no json here')

    expect(facts).toEqual({
      meals: [],
      training: [],
      recovery: [],
      mood: [],
      measurement: [],
    })
  })

  it('creates carry the source text', async () => {
    const facts = {
      meals: [{ name: 'Baozi', portion: '5 pieces', calories: 600, protein: 25 }],
      training: [{ kind: 'resistance' as const, minutes: 30 }],
      recovery: [],
      mood: [],
      measurement: [],
    }

    // Passing sourceText as the third argument
    const counts = await recordHealthFacts('u1', facts, 'had baozi')

    const arg = vi.mocked(prisma.mealEntry.create).mock.calls[0][0]
    expect(arg.data.userId).toBe('u1')
    expect(arg.data.source).toBe('extracted')
    expect(arg.data.sourceText).toBe('had baozi')
    expect(arg.data.totalCalories).toBe(600)
    expect(counts).toEqual({ meals: 1, training: 1, recovery: 0, mood: 0, measurement: 0 })
  })

  it('empty facts touch nothing', async () => {
    const counts = await recordHealthFacts('u1', {
      meals: [], training: [], recovery: [], mood: [], measurement: [],
    })

    expect(prisma.mealEntry.create).not.toHaveBeenCalled()
    expect(prisma.trainingEntry.create).not.toHaveBeenCalled()
    expect(counts).toEqual({ meals: 0, training: 0, recovery: 0, mood: 0, measurement: 0 })
  })

  it('the orchestrator passes the user text through', async () => {
    const userText = 'I ate a burger and slept 8 hours'
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.trainingEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(generate).mockResolvedValue(
      JSON.stringify({
        meals: [], training: [], recovery: [{ kind: 'sleep', value: 8 }], mood: [], measurement: [],
      })
    )

    const counts = await extractHealthFacts('u1', userText)

    // Verify that the recovery entry creation received the sourceText
    const recoveryArg = vi.mocked(prisma.recoveryEntry.create).mock.calls[0][0]
    expect(recoveryArg.data.sourceText).toBe(userText)
    expect(counts).toEqual({ meals: 0, training: 0, recovery: 1, mood: 0, measurement: 0 })
  })

  it('an llm failure resolves to zero counts', async () => {
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.trainingEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.recoveryEntry.findMany).mockResolvedValue([] as never)
    vi.mocked(generate).mockRejectedValue(new Error('down'))

    await expect(extractHealthFacts('u1', 'hello')).resolves.toEqual({
      meals: 0, training: 0, recovery: 0, mood: 0, measurement: 0,
    })
  })
})
