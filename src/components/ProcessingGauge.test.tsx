import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProcessingGauge from './ProcessingGauge'

describe('ProcessingGauge', () => {
  it('puts processed on the left and natural on the right', () => {
    render(<ProcessingGauge naturalShare={0.5} label="a bit of both" />)

    const text = document.body.textContent ?? ''
    expect(text.indexOf('Processed')).toBeLessThan(text.indexOf('Natural'))
  })

  it('places the marker towards natural for a whole-food day', () => {
    render(<ProcessingGauge naturalShare={0.9} label="real food" />)

    const marker = screen.getByTestId('processing-marker')
    expect(marker.style.left).toBe('90%')
  })

  it('places the marker towards processed for a packaged day', () => {
    render(<ProcessingGauge naturalShare={0.1} label="mostly packaged" />)

    expect(screen.getByTestId('processing-marker').style.left).toBe('10%')
  })

  it('shows no marker at all when there is nothing to place', () => {
    // A marker parked at one end would be a claim about the day that is not
    // true. Every meal already in the database names no group.
    render(<ProcessingGauge naturalShare={null} label={null} />)

    expect(screen.queryByTestId('processing-marker')).toBeNull()
    expect(screen.getByText('nothing logged yet')).toBeInTheDocument()
  })

  it('never shows a percentage', () => {
    // A marker on a labelled spectrum is a glance. A number is arithmetic, and
    // makes the gauge a score out of a hundred.
    render(<ProcessingGauge naturalShare={0.68} label="mostly real food" />)

    expect(document.body.textContent).not.toMatch(/\d/)
  })
})
