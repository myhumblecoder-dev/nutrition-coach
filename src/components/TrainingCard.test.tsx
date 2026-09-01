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

    expect(screen.getByText('2 / 3–5')).toBeInTheDocument()
    const filled = document.querySelectorAll('[data-filled="true"]')
    expect(filled).toHaveLength(2)
  })

  it('renders the steps progress figure', () => {
    render(<TrainingCard training={training} />)

    expect(screen.getByText('6,540 / 10,000')).toBeInTheDocument()
  })
})
