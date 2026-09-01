import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import TrainingCard from './TrainingCard'

const training = {
  resistance: 2,
  hiit: 0,
  core: 0,
  stepsToday: 6540,
  days: {
    resistance: [true, false, true, false, false, false, false],
    hiit: [false, false, false, false, false, false, false],
    core: [false, false, false, false, false, false, false],
  },
}

describe('TrainingCard', () => {
  it('renders filled day dots and the cadence count', () => {
    render(<TrainingCard training={training} />)

    const counts = Array.from(document.querySelectorAll('div')).filter(
      (el) => el.textContent === '2 / 3–5' && el.querySelector('span')
    )
    expect(counts.length).toBeGreaterThan(0)
    const filled = document.querySelectorAll('[data-filled="true"]')
    expect(filled).toHaveLength(2)
  })

  it('renders the steps progress figure', () => {
    render(<TrainingCard training={training} />)

    const steps = Array.from(document.querySelectorAll('div')).filter(
      (el) => el.textContent === '6,540 / 10,000' && el.querySelector('span')
    )
    expect(steps.length).toBeGreaterThan(0)
  })
})
