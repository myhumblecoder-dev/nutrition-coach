import { describe, it, expect } from 'vitest'
import { spokenResult } from './spoken'

const NOTHING = {
  meals: 0, training: 0, recovery: 0, mood: 0, measurement: 0, targets: 0, failed: false,
}

describe('spokenResult', () => {
  it('names one thing plainly', () => {
    expect(spokenResult({ ...NOTHING, meals: 1 })).toBe('Logged 1 meal.')
  })

  it('pluralises, because a model reads this aloud verbatim', () => {
    expect(spokenResult({ ...NOTHING, meals: 3 })).toBe('Logged 3 meals.')
  })

  it('joins several with a conjunction rather than commas alone', () => {
    // Spoken, not read. "one meal, one session" trails off in the ear.
    const spoken = spokenResult({ ...NOTHING, meals: 1, training: 1, mood: 1 })

    expect(spoken).toBe('Logged 1 meal, 1 session and 1 mood note.')
  })

  it('claims nothing when nothing was written', () => {
    // The rule the coach follows in chat, and it matters more here: there is
    // no screen to check the claim against.
    const spoken = spokenResult(NOTHING)

    expect(spoken).not.toMatch(/logged/i)
    expect(spoken).toMatch(/tell me what you ate/i)
  })

  it('stays short enough to be said', () => {
    const everything = {
      meals: 2, training: 1, recovery: 2, mood: 1, measurement: 1, targets: 0, failed: false,
    }

    expect(spokenResult(everything).length).toBeLessThan(120)
  })
})
