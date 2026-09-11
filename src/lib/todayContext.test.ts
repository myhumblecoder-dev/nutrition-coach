import { describe, it, expect } from 'vitest'
import { eatenTodayLine, recoveryLine, checkInLine, moodLine } from './todayContext'

const ZONE = 'America/New_York'

describe('eatenTodayLine', () => {
  it('names the food and when it was eaten', () => {
    // The gap this closes: the names were fetched, summed, and thrown away, so
    // a photo-logged meal was invisible as content. The coach knew the total
    // had moved and not what the food was.
    const line = eatenTodayLine(
      [
        {
          foodItems: JSON.stringify([{ name: 'oats and berries' }]),
          loggedAt: new Date('2026-09-11T12:10:00Z'),
        },
        {
          foodItems: JSON.stringify([{ name: 'chicken burrito bowl' }]),
          loggedAt: new Date('2026-09-11T17:30:00Z'),
        },
      ],
      ZONE
    )

    expect(line).toContain('oats and berries')
    expect(line).toContain('chicken burrito bowl')
    // 12:10 UTC is 8:10 in New York — the user's own clock, not the server's.
    expect(line).toContain('8:10')
    expect(line).toContain('1:30')
  })

  it('is empty when nothing has been eaten', () => {
    expect(eatenTodayLine([], ZONE)).toBe('')
  })

  it('lists every item in a multi-item meal', () => {
    const line = eatenTodayLine(
      [
        {
          foodItems: JSON.stringify([{ name: 'steak' }, { name: 'sweet potato' }]),
          loggedAt: new Date('2026-09-11T23:00:00Z'),
        },
      ],
      ZONE
    )

    expect(line).toContain('steak')
    expect(line).toContain('sweet potato')
  })

  it('survives a meal whose foodItems is unparseable', () => {
    // Rows written by several generations of prompt. A bad one must cost its
    // own name, not the whole line.
    const line = eatenTodayLine(
      [
        { foodItems: 'not json', loggedAt: new Date('2026-09-11T12:00:00Z') },
        {
          foodItems: JSON.stringify([{ name: 'eggs' }]),
          loggedAt: new Date('2026-09-11T13:00:00Z'),
        },
      ],
      ZONE
    )

    expect(line).toContain('eggs')
  })

  it('caps the list rather than letting a heavy day run away', () => {
    // This rides in every turn. A day of twenty logged items must not quietly
    // triple the prompt.
    const meals = Array.from({ length: 20 }, (_, i) => ({
      foodItems: JSON.stringify([{ name: `food number ${i}` }]),
      loggedAt: new Date('2026-09-11T12:00:00Z'),
    }))

    const line = eatenTodayLine(meals, ZONE)

    expect(line).toContain('more')
    expect(line.length).toBeLessThan(600)
  })
})

describe('recoveryLine', () => {
  it('reports sleep, which was never surfaced at all', () => {
    // Caffeine got a decay model and a sentence of context; sleep was not read
    // despite being logged and being the bigger lever.
    const line = recoveryLine([{ kind: 'sleep', value: 6.5 }])

    expect(line).toContain('6.5')
    expect(line).toMatch(/sleep/i)
  })

  it('reports water', () => {
    expect(recoveryLine([{ kind: 'water', value: 1.8 }])).toContain('1.8')
  })

  it('leaves caffeine alone, which has its own line', () => {
    // Caffeine is reported as a live decaying level elsewhere. Repeating the
    // raw dose here would have the prompt saying two different things about it.
    expect(recoveryLine([{ kind: 'caffeine', value: 200 }])).toBe('')
  })

  it('is empty when nothing was logged', () => {
    expect(recoveryLine([])).toBe('')
  })
})

describe('checkInLine', () => {
  it('carries the answers the coach was given', () => {
    // The coach runs a weekly interview and could not see the answers
    // afterwards — it asked how the week went with no memory of being told.
    const line = checkInLine({
      weekOf: new Date('2026-09-07T00:00:00Z'),
      bodyAnswer: 'waist down a bit',
      strengthAnswer: 'bench went up',
      sleepAnswer: 'rough, travelling',
      moodAnswer: null,
    })

    expect(line).toContain('waist down a bit')
    expect(line).toContain('bench went up')
    expect(line).toContain('rough, travelling')
  })

  it('is empty when there is no check-in', () => {
    expect(checkInLine(null)).toBe('')
  })

  it('is empty when a check-in exists but was never answered', () => {
    expect(
      checkInLine({
        weekOf: new Date('2026-09-07T00:00:00Z'),
        bodyAnswer: null,
        strengthAnswer: null,
        sleepAnswer: null,
        moodAnswer: null,
      })
    ).toBe('')
  })

  it('truncates a long answer rather than carrying an essay every turn', () => {
    const line = checkInLine({
      weekOf: new Date('2026-09-07T00:00:00Z'),
      bodyAnswer: 'x'.repeat(500),
      strengthAnswer: null,
      sleepAnswer: null,
      moodAnswer: null,
    })

    expect(line.length).toBeLessThan(300)
  })
})

describe('moodLine', () => {
  it('reports the score and any note', () => {
    expect(moodLine({ score: 4, note: 'good session' })).toContain('4')
    expect(moodLine({ score: 4, note: 'good session' })).toContain('good session')
  })

  it('is empty when nothing was logged', () => {
    expect(moodLine(null)).toBe('')
  })
})
