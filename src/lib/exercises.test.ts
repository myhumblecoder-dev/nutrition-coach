import { describe, it, expect } from 'vitest'
import { parseExercises, describeExercises } from '@/lib/dashboard'

describe('exercises', () => {
  it('reads back what was logged', () => {
    const raw = JSON.stringify([{ name: 'squat', sets: 3, reps: 8, weightLb: 185 }])

    expect(parseExercises(raw)).toEqual([
      { name: 'squat', sets: 3, reps: 8, weightLb: 185 },
    ])
  })

  it('writes a session the way a person would', () => {
    const raw = JSON.stringify([
      { name: 'squat', sets: 3, reps: 8, weightLb: 185 },
      { name: 'barbell row', sets: 3, reps: 10, weightLb: 135 },
    ])

    expect(describeExercises(raw)).toBe('squat 3x8 @ 185, barbell row 3x10 @ 135')
  })

  it('omits what was never said instead of showing a zero', () => {
    // A lift logged without a weight was still done. "@ 0" would be a claim
    // about the weight rather than an absence of one.
    const raw = JSON.stringify([
      { name: 'pull-up', sets: 4, reps: 6 },
      { name: 'plank' },
    ])

    expect(describeExercises(raw)).toBe('pull-up 4x6, plank')
  })

  it('handles reps without sets', () => {
    expect(describeExercises(JSON.stringify([{ name: 'burpee', reps: 20 }]))).toBe('burpee x20')
  })

  it('treats a null column as no exercises, not an error', () => {
    // Most training rows have none — a walk is not a list of lifts.
    expect(parseExercises(null)).toEqual([])
    expect(describeExercises(null)).toBe('')
  })

  it('survives a malformed row rather than failing the whole day', () => {
    // The same tolerance parseFoodItems applies: one bad row must not take
    // down the receipts feed.
    expect(parseExercises('not json')).toEqual([])
    expect(parseExercises('{"not":"an array"}')).toEqual([])
    expect(describeExercises('not json')).toBe('')
  })
})
