import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import RemainingCard from './RemainingCard'

describe('RemainingCard', () => {
  it('renders the remaining figure and streak pips', () => {
    render(
      <RemainingCard remaining={915} streak={[true, true, false, true, true, true, false]} />
    )

    expect(screen.getByText('915')).toBeInTheDocument()
    expect(screen.getByText('5 of 7 days')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-pip="true"]')).toHaveLength(5)
  })

  it('renders the no-target fallback', () => {
    render(<RemainingCard remaining={null} streak={[]} />)

    expect(screen.getByText('Set your daily targets')).toBeInTheDocument()
  })
})
