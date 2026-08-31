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
