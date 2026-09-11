import { describe, it, expect } from 'vitest'
import { naturalShare, processingLabel } from './processing'

describe('naturalShare', () => {
  it('is null when nothing was logged', () => {
    expect(naturalShare([])).toBeNull()
  })

  it('is 1 when everything was unprocessed', () => {
    expect(
      naturalShare([
        { calories: 300, processingGroup: 1 },
        { calories: 200, processingGroup: 1 },
      ])
    ).toBe(1)
  })

  it('is 0 when everything was ultra-processed', () => {
    expect(naturalShare([{ calories: 500, processingGroup: 4 }])).toBe(0)
  })

  it('weights by calories, not by how many things were eaten', () => {
    // A pinch of stock powder on a plate of vegetables must not read the same
    // as a family bag of crisps. Counting items would over-punish a condiment.
    const withCondiment = naturalShare([
      { calories: 400, processingGroup: 1 },
      { calories: 5, processingGroup: 4 },
    ])

    expect(withCondiment).toBeGreaterThan(0.95)
  })

  it('places a whole-food day with cooking oil near the natural end', () => {
    // Group 2 is oil, butter, salt — a normal part of cooking real food, and
    // a day of it must not read as processed.
    const share = naturalShare([
      { calories: 600, processingGroup: 1 },
      { calories: 200, processingGroup: 2 },
    ])

    expect(share).toBeGreaterThan(0.8)
  })

  it('ignores an item the model did not classify', () => {
    // Unclassified is not evidence either way, unlike fat where silence counts
    // against. Here a missing group would drag the marker somewhere arbitrary,
    // so it simply does not vote.
    const share = naturalShare([
      { calories: 400, processingGroup: 1 },
      { calories: 400, processingGroup: null },
    ])

    expect(share).toBe(1)
  })

  it('is null when nothing carried calories', () => {
    // Black coffee is not a reading about how processed a day was.
    expect(naturalShare([{ calories: 0, processingGroup: 1 }])).toBeNull()
  })
})

describe('processingLabel', () => {
  it('says nothing when there is nothing to say', () => {
    expect(processingLabel(null)).toBeNull()
  })

  it('describes the position without a number', () => {
    // No percentage. A marker on a labelled spectrum is a glance; "68%
    // natural" is arithmetic, and this app is for logging.
    expect(processingLabel(1)).toBe('real food')
    expect(processingLabel(0.7)).toBe('mostly real food')
    expect(processingLabel(0.5)).toBe('a bit of both')
    expect(processingLabel(0.2)).toBe('mostly packaged')
    expect(processingLabel(0)).toBe('packaged')
  })

  it('never says a number', () => {
    for (const share of [0, 0.25, 0.5, 0.75, 1]) {
      expect(processingLabel(share)).not.toMatch(/\d/)
    }
  })
})
