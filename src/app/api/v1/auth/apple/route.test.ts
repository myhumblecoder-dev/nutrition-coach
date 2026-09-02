import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { verifyAppleIdentityToken } from '@/lib/appleToken'
import { createBearerSession } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'

vi.mock('@/lib/appleToken', () => ({ verifyAppleIdentityToken: vi.fn() }))
vi.mock('@/lib/apiAuth', () => ({ createBearerSession: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    account: { findUnique: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
  },
}))

const mockPrisma = vi.mocked(prisma, true)
const mockVerify = vi.mocked(verifyAppleIdentityToken)
const mockCreateSession = vi.mocked(createBearerSession)

function makeRequest(body: unknown) {
  return new Request('http://test/api/v1/auth/apple', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const EXPIRES = new Date('2027-01-01T00:00:00.000Z')

describe('POST /api/v1/auth/apple', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...originalEnv, AUTH_APPLE_BUNDLE_ID: 'dev.myhumblecoder.nutritioncoach' }
    mockCreateSession.mockResolvedValue({ sessionToken: 'a'.repeat(64), expires: EXPIRES })
  })

  it('returns 500 when the bundle id is not configured', async () => {
    process.env = { ...originalEnv, AUTH_APPLE_BUNDLE_ID: undefined }
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeRequest({ identityToken: 'tok' }))

    expect(res.status).toBe(500)
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it('returns 400 when the body has no identity token', async () => {
    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it('returns 401 and no detail when verification fails', async () => {
    mockVerify.mockRejectedValue(new Error('signature verification failed'))

    const res = await POST(makeRequest({ identityToken: 'forged' }))

    expect(res.status).toBe(401)
    // The reason must not leak — it distinguishes forged from expired from
    // wrong-audience, which only helps an attacker.
    await expect(res.json()).resolves.toEqual({ error: 'Invalid token' })
  })

  it('verifies against the bundle id, not the services id', async () => {
    mockVerify.mockResolvedValue({ sub: 's', email: 'a@b.c', emailVerified: true })
    mockPrisma.account.findUnique.mockResolvedValue({ user: { id: 'u1' } } as never)

    await POST(makeRequest({ identityToken: 'tok' }))

    expect(mockVerify).toHaveBeenCalledWith('tok', 'dev.myhumblecoder.nutritioncoach')
  })

  it('signs in a returning user by sub, without needing an email', async () => {
    // Apple omits email after the first authorization; a returning user must
    // still be able to sign in.
    mockVerify.mockResolvedValue({ sub: 'apple-sub', email: null, emailVerified: false })
    mockPrisma.account.findUnique.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c', name: 'Thomas' },
    } as never)

    const res = await POST(makeRequest({ identityToken: 'tok' }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      token: 'a'.repeat(64),
      expires: EXPIRES.toISOString(),
      user: { id: 'u1', email: 'a@b.c', name: 'Thomas' },
    })
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
    expect(mockPrisma.account.create).not.toHaveBeenCalled()
  })

  it('links a first-time iOS sign-in to the existing web account', async () => {
    // The Apple grouping assumption in the plan: the same person signing in on
    // the phone must land on the row they created in the browser.
    mockVerify.mockResolvedValue({ sub: 'apple-sub', email: 'a@b.c', emailVerified: true })
    mockPrisma.account.findUnique.mockResolvedValue(null as never)
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'web-user', email: 'a@b.c', name: null } as never)

    const res = await POST(makeRequest({ identityToken: 'tok' }))

    expect(res.status).toBe(200)
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
    expect(mockPrisma.account.create).toHaveBeenCalledWith({
      data: {
        userId: 'web-user',
        type: 'oidc',
        provider: 'apple',
        providerAccountId: 'apple-sub',
      },
    })
    expect(mockCreateSession).toHaveBeenCalledWith('web-user')
  })

  it('creates a new user when no account and no email match exist', async () => {
    mockVerify.mockResolvedValue({ sub: 'apple-sub', email: 'new@b.c', emailVerified: true })
    mockPrisma.account.findUnique.mockResolvedValue(null as never)
    mockPrisma.user.findUnique.mockResolvedValue(null as never)
    mockPrisma.user.create.mockResolvedValue({ id: 'new-user', email: 'new@b.c', name: null } as never)

    const res = await POST(makeRequest({ identityToken: 'tok' }))

    expect(res.status).toBe(200)
    expect(mockPrisma.user.create).toHaveBeenCalled()
    expect(mockCreateSession).toHaveBeenCalledWith('new-user')
  })

  it('refuses to create an account from an unverified email', async () => {
    mockVerify.mockResolvedValue({ sub: 'apple-sub', email: 'a@b.c', emailVerified: false })
    mockPrisma.account.findUnique.mockResolvedValue(null as never)

    const res = await POST(makeRequest({ identityToken: 'tok' }))

    expect(res.status).toBe(403)
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
    expect(mockCreateSession).not.toHaveBeenCalled()
  })
})
