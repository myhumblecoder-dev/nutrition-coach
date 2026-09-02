import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { nextAuthMock, buildAuthConfigMock } = vi.hoisted(() => ({
  nextAuthMock: vi.fn((_config?: unknown) => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
  buildAuthConfigMock: vi.fn(() => ({
    providers: [],
    pages: { signIn: '/sign-in' },
  })),
}))

vi.mock('next-auth', () => ({ default: nextAuthMock }))
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: vi.fn(() => ({ adapter: 'prisma' })) }))
vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/auth.config', () => ({ buildAuthConfig: buildAuthConfigMock }))

describe('auth', () => {
  const originalVercel = process.env.VERCEL

  beforeEach(() => {
    vi.resetModules()
    nextAuthMock.mockClear()
    buildAuthConfigMock.mockClear()
  })

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = originalVercel
  })

  it('passes the factory config and adapter to NextAuth', async () => {
    delete process.env.VERCEL
    await import('./auth')

    expect(nextAuthMock).toHaveBeenCalledTimes(1)
    const arg = nextAuthMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.pages).toEqual({ signIn: '/sign-in' })
    expect(arg.adapter).toBeDefined()
    expect(arg).not.toHaveProperty('callbacks.authorized')
  })

  it('enables secure cookies only on Vercel', async () => {
    process.env.VERCEL = '1'
    await import('./auth')
    expect(buildAuthConfigMock).toHaveBeenCalledWith({ secureCookies: true })

    vi.resetModules()
    buildAuthConfigMock.mockClear()
    delete process.env.VERCEL
    await import('./auth')
    expect(buildAuthConfigMock).toHaveBeenCalledWith({ secureCookies: false })
  })
})
