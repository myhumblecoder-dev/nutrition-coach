import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import NavBar from './NavBar'
import { auth } from '@/auth'

vi.mock('@/auth', () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }))

describe('NavBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(null as never)
  })

  it('renders the three nav links', async () => {
    render(await NavBar())

    // Desktop links and mobile tabs both point at the same three routes.
    const todayLinks = screen.getAllByRole('link', { name: /Today/ })
    const chatLinks = screen.getAllByRole('link', { name: /Chat/ })
    const settingsLinks = screen.getAllByRole('link', { name: /Settings/ })

    expect(todayLinks[0]).toHaveAttribute('href', '/')
    expect(chatLinks[0]).toHaveAttribute('href', '/chat')
    expect(settingsLinks[0]).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('link', { name: /Targets/ })).not.toBeInTheDocument()
  })

  it('orders the nav as Today, Chat, Settings', async () => {
    render(await NavBar())

    const labels = screen
      .getAllByRole('link')
      .map((l) => l.textContent?.trim())
      .filter((text): text is string => ['Today', 'Chat', 'Settings'].includes(text ?? ''))

    expect(labels.slice(0, 3)).toEqual(['Today', 'Chat', 'Settings'])
  })

  it('renders the wordmark', async () => {
    render(await NavBar())
    expect(screen.getByText('Nutrition Coach')).toBeInTheDocument()
  })

  it('signed out shows a sign-in icon link to /sign-in', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    render(await NavBar())

    const link = screen.getByRole('link', { name: 'Sign in' })
    expect(link).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByText('Sign in')).not.toBeInTheDocument()
  })

  it('signed in shows the sign-out icon button', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)

    render(await NavBar())

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument()
  })

  it('renders the mobile tab bar', async () => {
    render(await NavBar())

    expect(screen.getByTestId('mobile-tabs')).toBeInTheDocument()
  })
})
