import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { verifyNotification } from '@/lib/appleReceipt'
import { prisma } from '@/lib/db'

vi.mock('@/lib/appleReceipt', () => ({ verifyNotification: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: { subscription: { updateMany: vi.fn() } },
}))

const mockVerify = vi.mocked(verifyNotification)
const mockUpdate = vi.mocked(prisma.subscription.updateMany)

const RENEWED_TO = Date.UTC(2026, 10, 9, 12, 0, 0)

function notification(type: string, transaction: Record<string, unknown> = {}) {
  return {
    notificationType: type,
    data: {
      signedTransactionInfo: {
        originalTransactionId: 'ot-1',
        productId: 'monthly',
        expiresDate: RENEWED_TO,
        environment: 'Production',
        ...transaction,
      },
    },
  }
}

function request() {
  return new Request('http://test/api/appstore/notifications', {
    method: 'POST',
    body: JSON.stringify({ signedPayload: 'jws' }),
  })
}

describe('POST /api/appstore/notifications', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUpdate.mockResolvedValue({ count: 1 } as never)
  })

  it('refuses a payload that does not verify, and writes nothing', async () => {
    // There is no bearer token here — Apple calls this. The signature is the
    // authentication, so an unsigned POST must change nothing.
    mockVerify.mockRejectedValue(new Error('VerificationException'))

    const res = await POST(request())

    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('extends the paid-through date on a renewal', async () => {
    mockVerify.mockResolvedValue(notification('DID_RENEW') as never)

    const res = await POST(request())

    expect(res.status).toBe(200)
    const arg = mockUpdate.mock.calls[0][0]
    // Scoped by the transaction id, never by anything the caller chose — the
    // notification says which subscription it is about.
    expect(arg.where).toEqual({ originalTransactionId: 'ot-1' })
    expect(arg.data.expiresAt).toEqual(new Date(RENEWED_TO))
    expect(arg.data.status).toBe('active')
    // A renewal is the first paid month; the trial is over.
    expect(arg.data.isTrial).toBe(false)
  })

  it('revokes immediately on a refund, whatever the date says', async () => {
    mockVerify.mockResolvedValue(
      notification('REFUND', { revocationDate: Date.UTC(2026, 8, 20) }) as never
    )

    await POST(request())

    expect(mockUpdate.mock.calls[0][0].data.status).toBe('revoked')
  })

  it('leaves a failed renewal entitled until the date it was paid through', async () => {
    // Apple retrying a card. The user has done nothing wrong and must not lose
    // the app mid-month.
    mockVerify.mockResolvedValue(notification('DID_FAIL_TO_RENEW') as never)

    await POST(request())

    expect(mockUpdate.mock.calls[0][0].data.status).toBe('active')
  })

  it('acknowledges Apple test notifications without touching anything', async () => {
    // Sent from App Store Connect to check the endpoint answers. It carries no
    // transaction at all.
    mockVerify.mockResolvedValue({ notificationType: 'TEST', data: {} } as never)

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('acknowledges a notification for a subscription it has never seen', async () => {
    // Apple retries anything it does not get a 200 for. A row we do not have
    // is not a failure we can fix by making Apple try again.
    mockUpdate.mockResolvedValue({ count: 0 } as never)
    mockVerify.mockResolvedValue(notification('DID_RENEW') as never)

    expect((await POST(request())).status).toBe(200)
  })

  it('rejects a body with no signed payload', async () => {
    const res = await POST(
      new Request('http://test/api/appstore/notifications', { method: 'POST', body: '{}' })
    )

    expect(res.status).toBe(400)
    expect(mockVerify).not.toHaveBeenCalled()
  })
})

describe('family-shared notifications', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUpdate.mockResolvedValue({ count: 1 } as never)
  })

  it('applies a renewal to the whole household', async () => {
    // The buyer renewed, so everyone Apple gave access to keeps it. Scoping
    // this to the purchaser's own row would quietly expire the family a month
    // after they were let in.
    mockVerify.mockResolvedValue(notification('DID_RENEW') as never)

    await POST(request())

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { originalTransactionId: 'ot-1' } })
    )
  })

  it('keeps a withdrawn family share off the purchaser', async () => {
    // REVOKE arrives with the buyer's originalTransactionId even when it is
    // only a family member losing access. Without narrowing by ownership the
    // person who is actually paying would be cut off by someone else leaving
    // their family.
    mockVerify.mockResolvedValue(
      notification('REVOKE', {
        inAppOwnershipType: 'FAMILY_SHARED',
        revocationDate: Date.UTC(2026, 9, 1),
      }) as never
    )

    await POST(request())

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { originalTransactionId: 'ot-1', ownershipType: 'FAMILY_SHARED' },
      })
    )
  })
})
