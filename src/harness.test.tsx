import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

// Proves the test harness itself works: vitest collects, jsdom renders, and
// the jest-dom matchers from vitest.setup.ts are registered. Delete it once
// the app has real tests — until then it is the only thing standing between a
// broken vitest config and a green CI run.
describe('test harness', () => {
  it('renders into jsdom and has jest-dom matchers', () => {
    render(<h1>ready</h1>)
    expect(screen.getByRole('heading', { name: 'ready' })).toBeInTheDocument()
  })
})
