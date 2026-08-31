import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import NavBar from './NavBar'

describe('NavBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the home targets and chat links', async () => {
    render(<NavBar />)

    const homeLink = screen.getByRole('link', { name: 'Home' })
    const targetsLink = screen.getByRole('link', { name: 'Targets' })
    const chatLink = screen.getByRole('link', { name: 'Chat' })

    expect(homeLink).toHaveAttribute('href', '/')
    expect(targetsLink).toHaveAttribute('href', '/targets')
    expect(chatLink).toHaveAttribute('href', '/chat')
  })
})