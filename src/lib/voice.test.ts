import { describe, it, expect } from 'vitest'
import { COACH_PERSONA, PLAIN_TEXT_RULE } from './voice'

describe('COACH_PERSONA', () => {
  it('establishes the brisk, dry register', () => {
    expect(COACH_PERSONA).toMatch(/boston/i)
    expect(COACH_PERSONA).toMatch(/short sentences/i)
  })

  it('forbids aiming the sarcasm at the user rather than the industry', () => {
    // The whole positioning is anti-shame. A rude coach that mocks the user's
    // body is the shaming app this product exists to reject — so the guardrail
    // lives in the prompt, not in a code comment.
    expect(COACH_PERSONA).toMatch(/never/i)
    expect(COACH_PERSONA.toLowerCase()).toContain('body')
    expect(COACH_PERSONA.toLowerCase()).toContain('guilt')
  })

  it('names what the sarcasm may target instead', () => {
    expect(COACH_PERSONA.toLowerCase()).toMatch(/diet culture|labels|calorie/)
  })

  it('does not ask the coach to count anything', () => {
    expect(COACH_PERSONA).not.toMatch(/how many calories|count their|track their intake/i)
  })
})

describe('PLAIN_TEXT_RULE', () => {
  it('bans markdown, which both the web client and Telegram render raw', () => {
    expect(PLAIN_TEXT_RULE).toMatch(/no markdown/i)
  })
})
