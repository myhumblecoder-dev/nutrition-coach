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

  it('sets no step goal', () => {
    // Steps arrive only when someone tells the coach they walked, which nobody
    // does daily. A 10,000 denominator against that turned Today into a
    // standing failure for a number the app cannot actually see. The value is
    // still logged and still shows in the feed when it is mentioned — it just
    // is not a quota any more.
    render(<TrainingCard training={training} />)

    expect(document.body.textContent).not.toContain('10,000')
    expect(document.body.textContent).not.toContain('Steps today')
  })
})
