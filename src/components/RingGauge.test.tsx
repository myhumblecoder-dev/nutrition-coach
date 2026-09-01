import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import RingGauge from './RingGauge'

describe('RingGauge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders texts and the proportional arc', async () => {
    const props = {
      value: 500,
      max: 2000,
      centerText: '500',
      subText: 'of 2,000 kcal',
      label: 'Calories',
      size: 132,
    }
    render(<RingGauge {...props} />)

    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('of 2,000 kcal')).toBeInTheDocument()
    expect(screen.getByText('Calories')).toBeInTheDocument()

    const progress = screen.getByTestId('ring-gauge-progress')
    const dashArray = progress.getAttribute('stroke-dasharray')
    const firstVal = parseFloat(dashArray?.split(' ')[0] || '0')
    expect(firstVal).toBeCloseTo(87.96, 0)
  })

  it('clamps overflow at a full ring', async () => {
    const props = {
      value: 3000,
      max: 2000,
      centerText: '3000',
      subText: 'of 2,000 kcal',
      label: 'Calories',
      size: 132,
    }
    render(<RingGauge {...props} />)

    const progress = screen.getByTestId('ring-gauge-progress')
    const dashArray = progress.getAttribute('stroke-dasharray')
    const firstVal = parseFloat(dashArray?.split(' ')[0] || '0')
    const radius = 132 * 0.424
    const circumference = 2 * Math.PI * radius
    expect(firstVal).toBeCloseTo(circumference, 0)
  })
})
