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

  it('renders at the size it was given', () => {
    // The size prop set only the viewBox, so the svg collapsed to its default
    // replaced-element size and every label shrank with it into illegibility.
    const { container } = render(
      <RingGauge value={1} max={2} centerText="1" subText="of 2" label="Test" size={148} />
    )

    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('148')
    expect(svg.getAttribute('height')).toBe('148')
  })

  it('keeps label text legible independent of the ring geometry', () => {
    const { container } = render(
      <RingGauge value={1} max={2} centerText="920" subText="of 2,000 kcal" label="Calories" size={148} />
    )

    const texts = Array.from(container.querySelectorAll('text'))
    const center = texts.find((n) => n.textContent === '920')!
    const sub = texts.find((n) => n.textContent === 'of 2,000 kcal')!
    // Sub-label must stay above ~11px on screen at this ring size.
    expect(parseFloat(center.getAttribute('font-size')!)).toBeGreaterThanOrEqual(28)
    expect(parseFloat(sub.getAttribute('font-size')!)).toBeGreaterThanOrEqual(12)
  })
})
