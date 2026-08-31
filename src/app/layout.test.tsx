import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Layout, { metadata } from './layout'

// next/font's loader only exists inside the Next build; under vitest
// `Geist(...)` is not a function and the suite dies at module load.
vi.mock('next/font/google', () => ({ Geist: () => ({ variable: 'v1', className: 'c1' }), Geist_Mono: () => ({ variable: 'v2', className: 'c2' }) }))

vi.mock('@/components/NavBar', () => ({ default: vi.fn(() => <nav data-testid="nav-bar" />) }))

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('metadata title equals Nutrition Coach', async () => {
    expect(metadata.title).toBe('Nutrition Coach')
  })

  it('metadata description equals the full tagline', async () => {
    expect(metadata.description).toBe('Photo-first meal logging with AI vision analysis, daily targets, and coach check-ins')
  })

  it('the layout renders the nav bar', async () => {
    render(<Layout><p>child</p></Layout>)
    expect(screen.getByTestId('nav-bar')).toBeInTheDocument()
  })

  it('the body carries the page background class', async () => {
    render(<Layout><p>child</p></Layout>)
    expect(document.body.className).toContain('bg-[#fafafa]')
  })
})