import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import RecoveryCard from './RecoveryCard'

describe('RecoveryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders logged recovery mood and measurement values', async () => {
    const recovery = { sleepHours: 7.5, waterLiters: 2, alcoholDrinks: 0 }
    const mood = { score: 4, note: 'good energy' }
    const measurement = { weightLb: 172, waistIn: 34 }

    render(<RecoveryCard recovery={recovery} mood={mood} measurement={measurement} />)

    expect(screen.getByText('Sleep: 7.5h / 7–9h')).toBeInTheDocument()
    expect(screen.getByText('Mood: 4/5')).toBeInTheDocument()
    expect(screen.getByText('Weight: 172 lb')).toBeInTheDocument()
  })

  it('renders the not-logged fallbacks', async () => {
    const recovery = { sleepHours: null, waterLiters: null, alcoholDrinks: null }
    const mood = null
    const measurement = null

    render(<RecoveryCard recovery={recovery} mood={mood} measurement={measurement} />)

    expect(screen.getByText('Sleep: not logged')).toBeInTheDocument()
    expect(screen.getByText('Measurement: not logged')).toBeInTheDocument()
  })
})
