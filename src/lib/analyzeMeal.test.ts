import { describe, it, expect, vi } from 'vitest'
import { analyzeMeal } from './analyzeMeal'
import { analyzePhoto } from '@/lib/llm'

vi.mock('@/lib/llm', () => ({
  analyzePhoto: vi.fn()
}))

// The cap has its own tests; stubbed off here so these exercise parsing.
vi.mock('@/lib/limits', () => ({
  // One gate now, answering entitlement and cap together. Null means proceed.
  denialFor: vi.fn().mockResolvedValue(null),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  UsageLimitError: class UsageLimitError extends Error {
    userMessage: string
    reason: string
    constructor(m: string, reason = 'capped') {
      super(m)
      this.userMessage = m
      this.reason = reason
    }
  },
}))

describe('analyzeMeal (lib)', () => {
  it('returns parsed food items and threads the caption hint', async () => {
    vi.mocked(analyzePhoto).mockResolvedValue(
      JSON.stringify({
        foodItems: [{ name: 'Egg', portion: '1 large', calories: 70, protein: 6 }],
        totalCalories: 70,
        totalProtein: 6,
      })
    )

    const result = await analyzeMeal('u1', 'https://example.com/p.jpg', 'two fried eggs')

    expect(result.foodItems[0].name).toBe('Egg')
    expect(result.totalCalories).toBe(70)
    const prompt = vi.mocked(analyzePhoto).mock.calls.at(-1)![1]
    expect(prompt).toContain('The user says this meal is: "two fried eggs"')
    expect(prompt).toContain('Trust their description')
  })

  it('parses a response wrapped in markdown fences and rounds fractions', async () => {
    const fenced =
      '```json\n' +
      JSON.stringify({
        foodItems: [{ name: 'Yogurt', portion: '1 cup', calories: 149.5, protein: 8.2 }],
        totalCalories: 149.5,
        totalProtein: 8.2,
      }) +
      '\n```'
    vi.mocked(analyzePhoto).mockResolvedValue(fenced)

    const result = await analyzeMeal('u1', 'https://example.com/photo.jpg')

    expect(result.totalCalories).toBe(150)
    expect(result.foodItems[0].protein).toBe(8)
  })

  it('rejects non-JSON and schema-invalid responses', async () => {
    vi.mocked(analyzePhoto).mockResolvedValue('Not a JSON string')
    await expect(analyzeMeal('u1', 'https://example/bad.jpg')).rejects.toThrow(
      'Vision API returned invalid JSON structure'
    )

    vi.mocked(analyzePhoto).mockResolvedValue(
      JSON.stringify({ foodItems: [{ name: 'Egg', portion: '1', calories: 70, protein: 6 }], totalProtein: 6 })
    )
    await expect(analyzeMeal('u1', 'https://example/bad-schema.jpg')).rejects.toThrow(
      'Vision API returned invalid JSON structure'
    )
  })
})

describe('fat', () => {
  it('carries fat and its source through', async () => {
    vi.mocked(analyzePhoto).mockResolvedValue(
      JSON.stringify({
        foodItems: [
          { name: 'avocado', portion: 'half', calories: 160, protein: 2, fat: 15, fatSource: 'whole' },
          { name: 'crisps', portion: 'small bag', calories: 150, protein: 2, fat: 10, fatSource: 'refined' },
        ],
        totalCalories: 310,
        totalProtein: 4,
        totalFat: 25,
      })
    )

    const result = await analyzeMeal('u1', 'https://example.com/p.jpg')

    expect(result.totalFat).toBe(25)
    expect(result.foodItems.map((f) => f.fatSource)).toEqual(['whole', 'refined'])
  })

  it('survives a model that omits fat entirely', async () => {
    // Every meal already stored predates this, and an older prompt cached
    // somewhere must not start failing meals. Calories are the thing worth
    // keeping; fat degrades to nothing rather than losing the log.
    vi.mocked(analyzePhoto).mockResolvedValue(
      JSON.stringify({
        foodItems: [{ name: 'toast', portion: '1 slice', calories: 80, protein: 3 }],
        totalCalories: 80,
        totalProtein: 3,
      })
    )

    const result = await analyzeMeal('u1', 'https://example.com/p.jpg')

    expect(result.totalFat).toBe(0)
    expect(result.foodItems[0].fatSource).toBeNull()
  })

  it('treats an unrecognised fatSource as unclassified rather than failing', async () => {
    vi.mocked(analyzePhoto).mockResolvedValue(
      JSON.stringify({
        foodItems: [
          { name: 'butter', portion: '1 tbsp', calories: 100, protein: 0, fat: 11, fatSource: 'saturated' },
        ],
        totalCalories: 100,
        totalProtein: 0,
        totalFat: 11,
      })
    )

    const result = await analyzeMeal('u1', 'https://example.com/p.jpg')

    expect(result.foodItems[0].fatSource).toBeNull()
    expect(result.foodItems[0].fat).toBe(11)
  })
})
