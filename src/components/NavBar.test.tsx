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
    const targetsLinks = screen.getAllByRole('link', { name: /Targets/ })
    const chatLinks = screen.getAllByRole('link', { name: /Chat/ })

    expect(todayLinks[0]).toHaveAttribute('href', '/')
    expect(targetsLinks[0]).toHaveAttribute('href', '/targets')
    expect(chatLinks[0]).toHaveAttribute('href', '/chat')
  })

  it('renders the wordmark', async () => {
    render(await NavBar())
    expect(screen.getByText('Nutrition Coach')).toBeInTheDocument()
  })

  it('signed out shows the sign-in icon button', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    render(await NavBar())

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
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
