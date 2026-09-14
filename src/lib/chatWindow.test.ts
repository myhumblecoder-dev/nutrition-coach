import { describe, it, expect } from 'vitest'
import { historyLinesFor, CHAT_WINDOW } from './chatWindow'

function turn(role: 'user' | 'assistant', content: string) {
  return { role, content }
}

describe('historyLinesFor', () => {
  it('keeps what the user said intact', () => {
    // The user's words carry the facts, and they are short — 11 tokens on
    // average in production. Nothing to gain by clipping them.
    const long = 'I had a bowl of oats with blueberries, a coffee, and half a banana'
    const lines = historyLinesFor([turn('user', long)])

    expect(lines[0]).toContain(long)
  })

  it('clips the coach, which is twelve times longer', () => {
    // Assistant messages average 138 tokens against the user's 11, so the
    // window was mostly spent replaying the coach's own prose to itself. It
    // needs to know roughly what it said, not verbatim.
    const lines = historyLinesFor([turn('assistant', 'x'.repeat(2000))])

    expect(lines[0].length).toBeLessThan(400)
    expect(lines[0]).toContain('…')
  })

  it('leaves a short coach reply alone', () => {
    // "Logged." is the house style and most replies are brief. Clipping should
    // be invisible until it is needed.
    const lines = historyLinesFor([turn('assistant', 'Logged.')])

    expect(lines[0]).toBe('assistant: Logged.')
    expect(lines[0]).not.toContain('…')
  })

  it('keeps the oldest first, because a conversation reads forwards', () => {
    const lines = historyLinesFor([
      turn('user', 'first'),
      turn('assistant', 'second'),
    ])

    expect(lines[0]).toContain('first')
    expect(lines[1]).toContain('second')
  })

  it('reaches most of a day', () => {
    // The daily cap is 30 chat turns, so a full day is at most 60 messages.
    // Ten meant a talkative afternoon lost its own morning.
    expect(CHAT_WINDOW).toBeGreaterThanOrEqual(30)
  })

  it('stays inside a budget even on a day of long messages', () => {
    // Clipping replies is not a bound: the chat route accepts 4,000 characters
    // a message, so fifteen of those would be fifteen thousand tokens in every
    // later prompt. The whole window has a ceiling.
    const heavy = Array.from({ length: CHAT_WINDOW }, (_, i) =>
      turn(i % 2 === 0 ? 'user' : 'assistant', 'x'.repeat(4000))
    )

    const chars = historyLinesFor(heavy).join('\n').length

    expect(chars / 4).toBeLessThan(1800)
  })

  it('drops the oldest turns when the budget runs out, not the newest', () => {
    // Losing the start of a long day is the right trade. Losing the last thing
    // said is not.
    const heavy = [
      turn('user', 'OLDEST'),
      ...Array.from({ length: 20 }, () => turn('user', 'x'.repeat(1000))),
      turn('user', 'NEWEST'),
    ]

    const joined = historyLinesFor(heavy).join('\n')

    expect(joined).toContain('NEWEST')
    expect(joined).not.toContain('OLDEST')
  })

  it('keeps the newest turn even if it alone blows the budget', () => {
    // A single enormous message must not produce an empty window.
    const lines = historyLinesFor([turn('user', 'x'.repeat(20_000))])

    expect(lines).toHaveLength(1)
  })
})
