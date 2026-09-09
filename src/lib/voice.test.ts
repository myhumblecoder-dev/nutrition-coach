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

  it('tells the coach to answer a statement with a statement', () => {
    // The failure: every reply ending in a question. "I had a yogurt" is a
    // log, not an opening — answering it with "and what else?" turns logging
    // your day into an interrogation, and it is the fastest way to make
    // someone stop telling you things.
    expect(COACH_PERSONA).toMatch(/statement/i)
    expect(COACH_PERSONA).toMatch(/Logged\./)
  })

  it('still allows a question when it genuinely cannot act without one', () => {
    // Not "never ask". An unplaceable food or an ambiguous portion is worth
    // one question; the rule is against asking out of habit.
    expect(COACH_PERSONA).toMatch(/only ask/i)
  })

  it('yields to a later instruction that needs a question asked', () => {
    // The check-in probe and first-run setup both append "ask ..." after the
    // persona. Without this the two rules argue, and which one wins is left to
    // the model.
    expect(COACH_PERSONA).toMatch(/later in this prompt/i)
  })

  it('does not ask the coach to count anything', () => {
    expect(COACH_PERSONA).not.toMatch(/how many calories|count their|track their intake/i)
  })
})

describe('PLAIN_TEXT_RULE', () => {
  it('bans markdown, which both the web client and Telegram render raw', () => {
    expect(PLAIN_TEXT_RULE).toMatch(/no markdown/i)
  })

  it('says what the coach is before saying how it sounds', () => {
    // The register used to lead, and a model told "you are a diner waitress"
    // first will play one — deflecting a training question rather than
    // answering it. The job has to come first; the diner is the accent.
    const coach = COACH_PERSONA.indexOf('fitness and nutrition coach')
    const waitress = COACH_PERSONA.indexOf('diner waitress')

    expect(coach).toBeGreaterThanOrEqual(0)
    expect(waitress).toBeGreaterThan(coach)
  })

  it('claims the whole remit, not just food', () => {
    for (const domain of ['Diet', 'training', 'sleep', 'recovery', 'mood']) {
      expect(COACH_PERSONA).toContain(domain)
    }
  })

  it('is told to suggest workouts rather than only record them', () => {
    expect(COACH_PERSONA).toMatch(/suggest workouts/i)
    expect(COACH_PERSONA).toMatch(/sets, reps/i)
  })

  it('forbids hiding behind the character', () => {
    // The failure this guards against: "I just bring the food, hon" in answer
    // to a question about training.
    expect(COACH_PERSONA).toMatch(/never deflect/i)
    expect(COACH_PERSONA).toMatch(/only take orders/i)
  })
})

