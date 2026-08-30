import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Page from './page'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

// next/font's loader only exists inside the Next build; under vitest
// `Geist(...)` is not a function and the suite dies at module load.
vi.mock('next/font/google', () => new Proxy({}, {
  get: () => () => ({ variable: 'mock-font-variable', className: 'mock-font' }),
}))

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    dailyTarget: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/components/DailyTargetForm', () => ({
  default: vi.fn(() => <div data-testid="daily-target-form" />),
}))

// `auth` is overloaded in Auth.js, so vi.mocked(auth) resolves
// the middleware overload and rejects a session. Drive it via:
//   mockAuth.mockResolvedValue({ user: { id: 'u1' } })
const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>)
const mockFindUnique = vi.mocked(prisma.dailyTarget.findUnique)

describe('Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Page renders', async () => {
    // Test signed-out visitor
    mockAuth.mockResolvedValue(null)
    const UnauthenticatedPage = await Page()
    render(UnauthenticatedPage)
    expect(screen.getByText('Sign in to set targets')).toBeInTheDocument()
    expect(mockFindUnique).not.toHaveBeenCalled()

    // Test renders form with saved target
    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as any)
    mockFindUnique.mockResolvedValue({
      calories: 2000,
      protein: 150,
    } as any)
    
    const AuthenticatedPage = await Page()
    render(AuthenticatedPage)
    expect(screen.getByTestId('daily-target-form')).toBeInTheDocument()
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId: 'u\u0031' },
    })
  })
})
