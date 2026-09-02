import { describe, it, expect, vi } from 'vitest'
import { analyzeMeal } from './analyzeMeal'
import { analyzePhoto } from '@/lib/llm'

vi.mock('@/lib/llm', () => ({
  analyzePhoto: vi.fn()
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

    const result = await analyzeMeal('https://example.com/p.jpg', 'two fried eggs')

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

    const result = await analyzeMeal('https://example.com/photo.jpg')

    expect(result.totalCalories).toBe(150)
    expect(result.foodItems[0].protein).toBe(8)
  })

  it('rejects non-JSON and schema-invalid responses', async () => {
    vi.mocked(analyzePhoto).mockResolvedValue('Not a JSON string')
    await expect(analyzeMeal('https://example/bad.jpg')).rejects.toThrow(
      'Vision API returned invalid JSON structure'
    )

    vi.mocked(analyzePhoto).mockResolvedValue(
      JSON.stringify({ foodItems: [{ name: 'Egg', portion: '1', calories: 70, protein: 6 }], totalProtein: 6 })
    )
    await expect(analyzeMeal('https://example/bad-schema.jpg')).rejects.toThrow(
      'Vision API returned invalid JSON structure'
    )
  })
})
