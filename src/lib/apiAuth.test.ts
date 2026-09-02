import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBearerSession, authenticateBearer, revokeBearerSession } from './apiAuth'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

const mockPrisma = vi.mocked(prisma, true)

function bearer(token: string) {
  return new Request('http://test/api/v1/today', {
    headers: { authorization: `Bearer ${token}` },
  })
}

describe('createBearerSession', () => {
  beforeEach(() => vi.resetAllMocks())

  it('stores a 64-char token with a future expiry', async () => {
    mockPrisma.session.create.mockResolvedValue({} as never)

    const { sessionToken, expires } = await createBearerSession('user-1')

    expect(sessionToken).toMatch(/^[0-9a-f]{64}$/)
    expect(expires.getTime()).toBeGreaterThan(Date.now())
    expect(mockPrisma.session.create).toHaveBeenCalledWith({
      data: { sessionToken, userId: 'user-1', expires },
    })
  })

  it('never issues the same token twice', async () => {
    mockPrisma.session.create.mockResolvedValue({} as never)

    const a = await createBearerSession('user-1')
    const b = await createBearerSession('user-1')

    expect(a.sessionToken).not.toBe(b.sessionToken)
  })
})

describe('authenticateBearer', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns the user for a live session', async () => {
    const user = { id: 'user-1', email: 'a@b.c' }
    mockPrisma.session.findUnique.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      user,
    } as never)

    await expect(authenticateBearer(bearer('t'.repeat(64)))).resolves.toBe(user)
  })

  it('rejects an expired session even though the row still exists', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      expires: new Date(Date.now() - 1),
      user: { id: 'user-1' },
    } as never)

    await expect(authenticateBearer(bearer('t'.repeat(64)))).resolves.toBeNull()
  })

  it('rejects an unknown token', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null as never)

    await expect(authenticateBearer(bearer('nope'))).resolves.toBeNull()
  })

  it.each([
    ['no header', {}],
    ['wrong scheme', { authorization: 'Basic abc' }],
    ['empty token', { authorization: 'Bearer ' }],
  ])('rejects a request with %s without hitting the database', async (_label, headers) => {
    const result = await authenticateBearer(
      new Request('http://test/api/v1/today', { headers: headers as HeadersInit })
    )

    expect(result).toBeNull()
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled()
  })
})

describe('revokeBearerSession', () => {
  beforeEach(() => vi.resetAllMocks())

  it('deletes the row and reports the count', async () => {
    mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 } as never)

    await expect(revokeBearerSession(bearer('t'.repeat(64)))).resolves.toBe(1)
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: { sessionToken: 't'.repeat(64) },
    })
  })

  it('is a no-op without a bearer header', async () => {
    await expect(
      revokeBearerSession(new Request('http://test/api/v1/auth/signout'))
    ).resolves.toBe(0)
    expect(mockPrisma.session.deleteMany).not.toHaveBeenCalled()
  })
})
