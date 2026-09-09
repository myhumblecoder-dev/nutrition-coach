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
