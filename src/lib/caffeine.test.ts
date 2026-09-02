import { describe, it, expect } from 'vitest'
import { caffeineStatus, CAFFEINE_HALF_LIFE_HOURS, NEGLIGIBLE_MG, EFFECT_THRESHOLD_MG } from './caffeine'

const NOW = new Date('2026-09-02T18:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000)

describe('caffeineStatus', () => {
  it('halves a dose over one half-life', () => {
    const status = caffeineStatus([{ mg: 100, at: hoursAgo(CAFFEINE_HALF_LIFE_HOURS) }], NOW)

    expect(status.totalMg).toBe(100)
    expect(status.currentMg).toBe(50)
    // 50mg decaying to the 25mg floor is exactly one more half-life.
    expect(status.hoursUntilNegligible).toBe(5)
  })

  it('accumulates multiple doses and decays each by its own age', () => {
    const status = caffeineStatus(
      [
        { mg: 95, at: hoursAgo(0) },
        { mg: 95, at: hoursAgo(5) },
        { mg: 60, at: hoursAgo(10) },
      ],
      NOW
    )

    // 95 + 47.5 + 15 = 157.5 -> 158
    expect(status.totalMg).toBe(250)
    expect(status.currentMg).toBe(158)
    expect(status.hoursUntilNegligible).toBeCloseTo(13.3, 1)
  })

  it('reports zero for an empty day and for a fully decayed one', () => {
    expect(caffeineStatus([], NOW)).toEqual({
      totalMg: 0,
      currentMg: 0,
      hoursUntilEffectsFade: 0,
      hoursUntilNegligible: 0,
    })

    // Long enough ago that the remaining load is under the negligible floor.
    const stale = caffeineStatus([{ mg: 100, at: hoursAgo(40) }], NOW)
    expect(stale.totalMg).toBe(100)
    expect(stale.hoursUntilNegligible).toBe(0)
    expect(stale.currentMg).toBeLessThan(NEGLIGIBLE_MG)
  })

  it('never amplifies a dose timestamped in the future', () => {
    const skewed = caffeineStatus([{ mg: 80, at: new Date(NOW.getTime() + 2 * 3600_000) }], NOW)

    expect(skewed.currentMg).toBe(80)
  })

  it('reports when effects fade, well before full clearance', () => {
    // 200mg still active: effects fade at the 50mg mark, but the trace tail
    // to 25mg runs a further half-life. Leading with clearance told the user
    // caffeine was active for 14 hours, which is not what they asked.
    const status = caffeineStatus([{ mg: 200, at: hoursAgo(0) }], NOW)

    expect(EFFECT_THRESHOLD_MG).toBe(50)
    expect(status.hoursUntilEffectsFade).toBe(10)
    expect(status.hoursUntilNegligible).toBe(15)
    expect(status.hoursUntilEffectsFade).toBeLessThan(status.hoursUntilNegligible)
  })

  it('reports faded effects once under the threshold', () => {
    const status = caffeineStatus([{ mg: 40, at: hoursAgo(0) }], NOW)

    expect(status.hoursUntilEffectsFade).toBe(0)
    expect(status.hoursUntilNegligible).toBeGreaterThan(0)
  })
})
