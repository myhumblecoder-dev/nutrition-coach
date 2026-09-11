import { describe, it, expect } from 'vitest'
import { wholeFoodFatShare, fatQualityLabel } from './fat'

describe('wholeFoodFatShare', () => {
  it('is null when nothing eaten carried fat', () => {
    // No fat is not the same as bad fat. A day of dry toast must not render as
    // the worst possible colour.
    expect(wholeFoodFatShare([{ fat: 0, fatSource: null }])).toBeNull()
    expect(wholeFoodFatShare([])).toBeNull()
  })

  it('weights by grams of fat, not by how many foods there were', () => {
    // Half a teaspoon of butter beside a bag of crisps is not a 50/50 day.
    const share = wholeFoodFatShare([
      { fat: 2, fatSource: 'whole' },
      { fat: 18, fatSource: 'refined' },
    ])

    expect(share).toBeCloseTo(0.1)
  })

  it('is 1 when every gram came from a whole food', () => {
    expect(
      wholeFoodFatShare([
        { fat: 15, fatSource: 'whole' },
        { fat: 5, fatSource: 'whole' },
      ])
    ).toBe(1)
  })

  it('counts an unclassified fat as refined', () => {
    // The model failing to say is not evidence that it was good. Guessing
    // 'whole' would let a miss flatter the day.
    expect(wholeFoodFatShare([{ fat: 10, fatSource: null }])).toBe(0)
  })

  it('ignores zero-fat items entirely', () => {
    const share = wholeFoodFatShare([
      { fat: 0, fatSource: null },
      { fat: 10, fatSource: 'whole' },
    ])

    expect(share).toBe(1)
  })
})

describe('fatQualityLabel', () => {
  it('says nothing when there is no fat to describe', () => {
    expect(fatQualityLabel(null)).toBeNull()
  })

  it('stays short enough to sit inside the ring', () => {
    // The inner diameter at three-up is about 90pt. The first version said
    // "mostly whole food" and clipped on a real device.
    for (const share of [0, 0.2, 0.5, 0.9, 1]) {
      expect(fatQualityLabel(share)!.length).toBeLessThanOrEqual(14)
    }
  })

  it('carries the reading without relying on colour', () => {
    // Green and yellow are among the hardest pairs for red-green colour
    // vision deficiency, so the ring cannot say this with hue alone.
    expect(fatQualityLabel(1)).toBe('whole food')
    expect(fatQualityLabel(0.9)).toBe('mostly whole')
    expect(fatQualityLabel(0.5)).toBe('mixed')
    expect(fatQualityLabel(0.2)).toBe('mostly refined')
    expect(fatQualityLabel(0)).toBe('refined')
  })
})
