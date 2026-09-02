import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import RecoveryCard from './RecoveryCard'

describe('RecoveryCard', () => {
  it('renders bars mood and the weight sparkline', () => {
    render(
      <RecoveryCard
        recovery={{ sleepHours: 7.5, waterLiters: 2.5, caffeine: null }}
        mood={{ score: 4, note: 'good energy' }}
        measurement={{ weightLb: 172, waistIn: null }}
        weights={[
          { at: '2026-08-01T12:00:00Z', weightLb: 174 },
          { at: '2026-08-15T12:00:00Z', weightLb: 173 },
          { at: '2026-08-31T12:00:00Z', weightLb: 172 },
        ]}
      />
    )

    const sleep = Array.from(document.querySelectorAll('div')).filter(
      (el) => el.textContent === '7.5h · target 7–9h' && el.querySelector('span')
    )
    expect(sleep.length).toBeGreaterThan(0)
    expect(screen.getByText(/4\/5/)).toBeInTheDocument()
    expect(screen.getByText('172')).toBeInTheDocument()
    expect(document.querySelector('svg polyline')).not.toBeNull()
  })

  it('renders fallbacks without data', () => {
    render(
      <RecoveryCard
        recovery={{ sleepHours: null, waterLiters: null, caffeine: null }}
        mood={null}
        measurement={null}
        weights={[]}
      />
    )

    expect(screen.getByText('Sleep: not logged')).toBeInTheDocument()
    expect(screen.getByText('Measurement: not logged')).toBeInTheDocument()
    expect(document.querySelector('svg polyline')).toBeNull()
  })

  it('shows the active caffeine load and how long it lasts', () => {
    render(
      <RecoveryCard
        recovery={{
          sleepHours: 7,
          waterLiters: 2,
          caffeine: { totalMg: 250, currentMg: 120, hoursUntilEffectsFade: 6.3, hoursUntilNegligible: 11.3 },
        }}
        mood={null}
        measurement={null}
        weights={[]}
      />
    )

    expect(screen.getByText('Caffeine')).toBeInTheDocument()
    expect(screen.getByText(/120 mg/)).toBeInTheDocument()
    // The user asked how long it LASTS — lead with effects, not the trace tail.
    expect(screen.getByText(/effects ~6.3h/)).toBeInTheDocument()
    expect(screen.queryByText(/11.3/)).not.toBeInTheDocument()
    expect(screen.queryByText('Alcohol')).not.toBeInTheDocument()
  })

  it('says worn off once the load is negligible', () => {
    render(
      <RecoveryCard
        recovery={{
          sleepHours: 7,
          waterLiters: 2,
          caffeine: { totalMg: 95, currentMg: 12, hoursUntilEffectsFade: 0, hoursUntilNegligible: 0 },
        }}
        mood={null}
        measurement={null}
        weights={[]}
      />
    )

    expect(screen.getByText(/worn off/)).toBeInTheDocument()
  })
})
