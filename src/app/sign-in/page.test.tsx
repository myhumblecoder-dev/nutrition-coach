import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Page from './page'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected')
  }),
}))

vi.mock('@/components/SignInButtons', () => ({
  default: () => <div data-testid="sign-in-buttons">SignInButtons</div>,
}))

// next/font's loader only exists inside the Next build; under vitest
// `Geist(...)` is not a function and the suite dies at module load.
vi.mock('next/font/google', () => new Proxy({}, {
  get: () => () => ({ variable: 'mock-font-variable', className: 'mock-font' }),
}))

describe('Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects when authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as any)
    
    try {
      await Page({ searchParams: Promise.resolve({}) })
    } catch (err) {
      // ignore redirect error
    }

    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('renders sign-in buttons when signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    
    render(await Page({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Roughly')).toBeInTheDocument()
    expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument()
  })

  it('maps unknown error values to generic copy', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    
    render(await Page({ searchParams: Promise.resolve({ error: 'UnknownError' }) }))

    expect(screen.getByText('Something went wrong during sign-in — please try again.')).toBeInTheDocument()
  })
})
