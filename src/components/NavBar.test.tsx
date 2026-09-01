import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import NavBar from './NavBar'

describe('NavBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the three nav links', async () => {
    render(<NavBar />)

    const todayLink = screen.getByRole('link', { name: 'Today' })
    const targetsLink = screen.getByRole('link', { name: 'Targets' })
    const chatLink = screen.getByRole('link', { name: 'Chat' })

    expect(todayLink).toHaveAttribute('href', '/')
    expect(targetsLink).toHaveAttribute('href', '/targets')
    expect(chatLink).toHaveAttribute('href', '/chat')
  })

  it('renders the wordmark', async () => {
    render(<NavBar />)
    expect(screen.getByText('Nutrition Coach')).toBeInTheDocument()
  })
})