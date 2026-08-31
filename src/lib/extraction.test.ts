import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildExtractionPrompt, parseHealthFacts, recordHealthFacts } from './extraction'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: {
    mealEntry: { create: vi.fn() },
    trainingEntry: { create: vi.fn() },
    recoveryEntry: { create: vi.fn() },
    moodEntry: { create: vi.fn() },
    measurement: { create: vi.fn() },
  },
}))

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
      }) +
      '\n```'

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

  it('records mixed facts with extracted provenance', async () => {
    const facts = {
      meals: [{ name: 'Baozi', portion: '5 pieces', calories: 600, protein: 25 }],
      training: [{ kind: 'resistance' as const, minutes: 30 }],
      recovery: [],
      mood: [],
      measurement: [],
    }

    const counts = await recordHealthFacts('u1', facts)

    const arg = vi.mocked(prisma.mealEntry.create).mock.calls[0][0]
    expect(arg.data.userId).toBe('u1')
    expect(arg.data.source).toBe('extracted')
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
})
