import { describe, it, expect } from 'vitest'
import { fatColour, FAT_WHOLE, FAT_REFINED } from './fatColour'

describe('fatColour', () => {
  it('is the whole-food hue when every gram came from real food', () => {
    expect(fatColour(1)).toBe(FAT_WHOLE)
  })

  it('is the refined hue when none did', () => {
    expect(fatColour(0)).toBe(FAT_REFINED)
  })

  it('walks between the two rather than switching at a threshold', () => {
    // A gradient, not a traffic light. A day that is a little worse should
    // look a little worse, not flip to a warning colour at some invented line.
    const quarter = fatColour(0.25)
    const half = fatColour(0.5)
    const threeQuarters = fatColour(0.75)

    expect(new Set([quarter, half, threeQuarters]).size).toBe(3)
    expect(quarter).not.toBe(FAT_REFINED)
    expect(threeQuarters).not.toBe(FAT_WHOLE)
  })

  it('is the track colour when there is no fat to describe', () => {
    // Null is "nothing to say", not "the worst". A day of dry toast must not
    // render as the same yellow as a day of crisps.
    expect(fatColour(null)).toBe('#f0f0f1')
  })

  it('returns a hex colour both platforms can read', () => {
    for (const share of [0, 0.3, 0.61, 1]) {
      expect(fatColour(share)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('clamps rather than extrapolating past the ends', () => {
    // Share is a ratio and should never leave 0..1, but a rounding error must
    // not produce a colour outside the scale.
    expect(fatColour(1.2)).toBe(FAT_WHOLE)
    expect(fatColour(-0.1)).toBe(FAT_REFINED)
  })
})
