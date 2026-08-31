import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { analyzeMeal } from './analyzeMeal'
import { analyzePhoto } from '@/lib/llm'

vi.mock('@/lib/llm', () => ({
  analyzePhoto: vi.fn()
}))

describe('analyzeMeal', () => {
  it('the module source begins with the use server directive', () => {
    const firstLine = readFileSync(
      join(process.cwd(), 'src/app/actions/analyzeMeal.ts'),
      'utf8'
    ).split('\n')[0]
    expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)
  })

  it('parses a response wrapped in markdown code fences', async () => {
    const fenced =
      '```json\n' +
      JSON.stringify({
        foodItems: [{ name: 'Salad', portion: '1 bowl', calories: 320, protein: 12 }],
        totalCalories: 320,
        totalProtein: 12,
      }) +
      '\n```'
    vi.mocked(analyzePhoto).mockResolvedValue(fenced)

    const result = await analyzeMeal('https://example.com/photo.jpg')

    expect(result.totalCalories).toBe(320)
    expect(result.foodItems[0].name).toBe('Salad')
  })

  it('rounds fractional calorie and protein values', async () => {
    vi.mocked(analyzePhoto).mockResolvedValue(
      JSON.stringify({
        foodItems: [{ name: 'Yogurt', portion: '1 cup', calories: 149.5, protein: 8.2 }],
        totalCalories: 149.5,
        totalProtein: 8.2,
      })
    )

    const result = await analyzeMeal('https://example.com/photo.jpg')

    expect(result.totalCalories).toBe(150)
    expect(result.foodItems[0].protein).toBe(8)
  })

  it('returns parsed food items for valid vision JSON response', async () => {
    const mockResponse = JSON.stringify({
      foodItems: [
        { name: 'Egg', portion: '1 large', calories: 70, protein: 6 }
      ],
      totalCalories: 70,
      totalProtein: 6
    })

    vi.mocked(analyzePhoto).mockResolvedValue(mockResponse)

    const result = await analyzeMeal('https://example.com/photo.jpg')

    expect(result.foodItems).toHaveLength(1)
    expect(result.foodItems[0].name).toBe('Egg')
    expect(result.totalCalories).toBe(70)
    expect(analyzePhoto).toHaveBeenCalledWith(
      'https://example.com/photo.jpg',
      expect.stringContaining('Return ONLY valid JSON')
    )
  })

  it('throws containing invalid JSON structure message for non-JSON response', async () => {
    vi.mocked(analyzePhoto).mockResolvedValue('Not a JSON string')

    await expect(analyzeMeal('https://example/bad.jpg')).rejects.toThrow(
      'Vision API returned invalid JSON structure'
    )
  })

  it('throws for JSON that fails the Zod schema', async () => {
    // Missing totalCalories
    const invalidSchemaResponse = JSON.stringify({
      foodItems: [
        { name: 'Egg', portion: '1 large', calories: 70, protein: 6 }
      ],
      totalProtein: 6
    })

    vi.mocked(analyzePhoto).mockResolvedValue(invalidSchemaResponse)

    await expect(analyzeMeal('https://example/bad-schema.jpg')).rejects.toThrow(
      'Vision API returned invalid JSON structure'
    )
  })
})
