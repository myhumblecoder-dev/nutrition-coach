import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { verifyTransaction } from '@/lib/appleReceipt'
import { syncSubscription, UnusableTransactionError } from '@/lib/subscriptionSync'
import { entitlementFor } from '@/lib/entitlement'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/appleReceipt', () => ({ verifyTransaction: vi.fn() }))
vi.mock('@/lib/subscriptionSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/subscriptionSync')>()),
  syncSubscription: vi.fn(),
}))
vi.mock('@/lib/entitlement', () => ({ entitlementFor: vi.fn() }))

const mockAuth = vi.mocked(authenticateBearer)
const mockVerify = vi.mocked(verifyTransaction)
const mockSync = vi.mocked(syncSubscription)
const mockEntitlement = vi.mocked(entitlementFor)

const EXPIRES = new Date('2026-10-09T12:00:00.000Z')

function request(body: unknown) {
  return new Request('http://test/api/v1/subscription', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/v1/subscription', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerify.mockResolvedValue({ originalTransactionId: 'ot-1' } as never)
    mockSync.mockResolvedValue({} as never)
    mockEntitlement.mockResolvedValue({ tier: 'trialing', expiresAt: EXPIRES })
  })

  it('returns 401 without a bearer and never verifies anything', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST(request({ signedTransaction: 'jws' }))

    expect(res.status).toBe(401)
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it('verifies the transaction and reports the entitlement it produced', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(request({ signedTransaction: 'jws' }))

    expect(res.status).toBe(200)
    expect(mockVerify).toHaveBeenCalledWith('jws')
    expect(mockSync).toHaveBeenCalledWith('user-1', { originalTransactionId: 'ot-1' })
    expect(await res.json()).toEqual({
      tier: 'trialing',
      expiresAt: EXPIRES.toISOString(),
    })
  })

  it('refuses a transaction whose signature does not verify', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    // The signature is the only thing standing between this endpoint and
    // anyone granting themselves a subscription with a POST.
    mockVerify.mockRejectedValue(new Error('VerificationException'))

    const res = await POST(request({ signedTransaction: 'forged' }))

    expect(res.status).toBe(400)
    expect(mockSync).not.toHaveBeenCalled()
  })

  it('says plainly when the subscription belongs to someone else', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockSync.mockRejectedValue(
      new UnusableTransactionError('That subscription is already attached to another account')
    )

    const res = await POST(request({ signedTransaction: 'jws' }))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/another account/i)
  })

  it('rejects a body with no transaction in it', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(request({}))

    expect(res.status).toBe(400)
    expect(mockVerify).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/subscription', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without a bearer', async () => {
    mockAuth.mockResolvedValue(null)

    expect((await GET(new Request('http://test/api/v1/subscription'))).status).toBe(401)
  })

  it('reports a lapsed account honestly', async () => {
    // The gate is switchable; the status is not. Settings has to be able to
    // show what Apple actually thinks even while enforcement is off.
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockEntitlement.mockResolvedValue({ tier: 'lapsed', expiresAt: null })

    const res = await GET(new Request('http://test/api/v1/subscription'))

    expect(await res.json()).toEqual({ tier: 'lapsed', expiresAt: null })
  })
})
