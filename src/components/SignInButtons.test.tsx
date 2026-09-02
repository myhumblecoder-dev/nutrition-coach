import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SignInButtons from './SignInButtons'

vi.mock('@/auth', () => ({
  signIn: vi.fn(),
}))

describe('SignInButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Google and Apple buttons by name', async () => {
    const Component = await SignInButtons()
    render(Component)

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with Apple' })).toBeInTheDocument()
  })

  it('renders GitHub fallback under a divider', async () => {
    const Component = await SignInButtons()
    render(Component)

    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeInTheDocument()
    expect(screen.getByText('or')).toBeInTheDocument()
  })
})