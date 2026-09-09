import { describe, it, expect } from 'vitest'
import { redactIdentifiers } from './redact'

describe('redactIdentifiers', () => {
  it('leaves the product alone', () => {
    // Weight, sleep, mood and meals are the entire input. This is health data
    // and it is not filtered — filtering it would leave nothing to send.
    const text = 'slept about 5 hours, 172 on the scale, feeling low. Had eggs.'

    expect(redactIdentifiers(text)).toBe(text)
  })

  it('removes an email address', () => {
    expect(redactIdentifiers('email me at bob.smith+x@example.co.uk')).toBe(
      'email me at [redacted]'
    )
  })

  it('removes phone numbers in the shapes people actually type', () => {
    for (const phone of ['555-123-4567', '(555) 123 4567', '+44 7700 900123', '+1-555-123-4567']) {
      expect(redactIdentifiers(`call me on ${phone}`)).toBe('call me on [redacted]')
    }
  })

  it('removes a card number even when spaced or hyphenated', () => {
    expect(redactIdentifiers('4111 1111 1111 1111')).toBe('[redacted]')
    expect(redactIdentifiers('4111-1111-1111-1111')).toBe('[redacted]')
  })

  it('removes a US social security number', () => {
    expect(redactIdentifiers('ssn 123-45-6789')).toBe('ssn [redacted]')
  })

  it('does not eat a list of numbers, which is what a set log looks like', () => {
    // The rule that caught this was mine and it was wrong: any 13-16 digits
    // separated by single spaces matched, so a week of weigh-ins or a set log
    // became "[redacted]" with no error anywhere. The coach then answers about
    // nothing and extraction logs nothing.
    for (const text of [
      'squats 10 10 10 8 8 8 6 6 6 5 5 5 5',
      'weights this week 171 172 170 173 172 171 174',
      'ate 500 600 700 400 300 200 100 calories',
      '5 5 5 5 5 5 5 5 5 5 5 5 5 5',
    ]) {
      expect(redactIdentifiers(text)).toBe(text)
    }
  })

  it('still catches the card shapes people actually paste', () => {
    for (const card of [
      '4111111111111111',
      '4111 1111 1111 1111',
      '4111-1111-1111-1111',
      '3782 822463 10005',
    ]) {
      expect(redactIdentifiers(card)).toBe('[redacted]')
    }
  })

  it('does not eat the numbers this app exists to read', () => {
    // The risk of a greedy digit rule: a redactor that ate these would break
    // logging silently and look like the model getting worse.
    for (const text of [
      'weighed 172.4 today',
      'ran 5k in 24:30',
      '2000 calories and 150g protein',
      'slept 7.5 hours',
      'benched 3x5 at 185',
      'had 500ml of water at 8am',
    ]) {
      expect(redactIdentifiers(text)).toBe(text)
    }
  })

  it('handles several identifiers in one message', () => {
    expect(redactIdentifiers('a@b.com or 555-123-4567')).toBe('[redacted] or [redacted]')
  })

  it('passes empty and ordinary text through untouched', () => {
    expect(redactIdentifiers('')).toBe('')
    expect(redactIdentifiers('chicken burrito bowl, no rice')).toBe(
      'chicken burrito bowl, no rice'
    )
  })
})
