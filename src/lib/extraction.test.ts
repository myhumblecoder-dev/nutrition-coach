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
    expect(prompt).toContain('ESTIMATE its calories and protein')
  })

  it('a meal without a portion still parses', () => {
    const facts = parseHealthFacts(
      JSON.stringify({
        meals: [{ name: 'Eggs and tortillas', calories: 540, protein: 24 }],
        training: [], recovery: [], mood: [], measurement: [],
      })
    )

    expect(facts.meals).toHaveLength(1)
    expect(facts.meals[0].portion).toBe('1 serving')
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

  it('keeps meals when the model lists more than the cap', () => {
    // The real regression: "two eggs and a piece of toast this morning, with
    // coffee, tea, and 32oz of water" yields four consumables, and the whole
    // meals array used to be discarded.
    const facts = parseHealthFacts(
      JSON.stringify({
        meals: [
          { name: 'eggs', portion: '2', calories: 140, protein: 12 },
          { name: 'toast', portion: '1 slice', calories: 90, protein: 3 },
          { name: 'coffee', portion: '1 cup', calories: 5, protein: 0 },
          { name: 'tea', portion: '1 cup', calories: 2, protein: 0 },
        ],
        training: [],
        recovery: [{ kind: 'sleep', value: 7.5 }, { kind: 'water', value: 0.95 }],
        mood: [],
        measurement: [],
      })
    )

    expect(facts.meals).toHaveLength(4)
    expect(facts.meals.map((m) => m.name)).toEqual(['eggs', 'toast', 'coffee', 'tea'])
    expect(facts.recovery).toHaveLength(2)
  })

  it('drops only the malformed item, not its siblings', () => {
    const facts = parseHealthFacts(
      JSON.stringify({
        meals: [
          { name: 'eggs', portion: '2', calories: 140, protein: 12 },
          { name: 'toast', portion: '1 slice', calories: 'ninety', protein: 3 },
          { name: 'banana', portion: '1', calories: 105, protein: 1 },
        ],
        training: [],
        recovery: [],
        mood: [],
        measurement: [],
      })
    )

    expect(facts.meals.map((m) => m.name)).toEqual(['eggs', 'banana'])
  })

  it('still bounds a runaway model response', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      name: `item ${i}`, portion: '1', calories: 10, protein: 1,
    }))
    const facts = parseHealthFacts(
      JSON.stringify({ meals: many, training: [], recovery: [], mood: [], measurement: [] })
    )

    expect(facts.meals.length).toBeGreaterThan(3)
    expect(facts.meals.length).toBeLessThanOrEqual(8)
  })

  it('warns when the schema discards items so drops are not silent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    parseHealthFacts(
      JSON.stringify({
        meals: [{ name: 'ok', portion: '1', calories: 10, protein: 1 }, { name: '', portion: '', calories: -5, protein: 0 }],
        training: [], recovery: [], mood: [], measurement: [],
      })
    )

    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0][0])).toMatch(/extraction/i)
    warn.mockRestore()
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
