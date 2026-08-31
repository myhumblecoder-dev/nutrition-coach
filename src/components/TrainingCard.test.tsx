import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TrainingCard from './TrainingCard'

describe('TrainingCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the weekly cadences against the infographic targets: mount with `{ resistance: 2, hiit: 1, core: 0, stepsToday: 4500 }`, assert that the text `Resistance: 2 / 3\u20135 this week` (i.e. `Resistance: 2 / 3–5 this week`) appears in the document, and that `Steps today: 4,500 / 10,000` appears in the document', async () => {
    const trainingData = {
      resistance: 2,
      hiit: 1,
      core: 0,
      stepsToday: 4500,
    }

    render(<TrainingCard training={trainingData} />)

    expect(screen.getByText('Resistance: 2 / 3\u20135 this week')).toBeInTheDocument()
    expect(screen.getByText('Steps today: 4,500 / 10,000')).toBeInTheDocument()
  })
})
