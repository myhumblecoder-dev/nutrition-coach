import { describe, it, expect, vi, beforeEach } from 'vitest'
import { subscriptionFieldsFrom, syncSubscription } from './subscriptionSync'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: { subscription: { findUnique: vi.fn(), upsert: vi.fn() } },
}))

const EXPIRES = Date.UTC(2026, 9, 9, 12, 0, 0)

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    originalTransactionId: 'ot-1',
    productId: 'dev.myhumblecoder.nutritioncoach.monthly',
    expiresDate: EXPIRES,
    environment: 'Production',
    type: 'Auto-Renewable Subscription',
    ...overrides,
  }
}

describe('subscriptionFieldsFrom', () => {
  it('carries across the fields entitlement is decided from', () => {
    const fields = subscriptionFieldsFrom(transaction())

    expect(fields.originalTransactionId).toBe('ot-1')
    expect(fields.productId).toBe('dev.myhumblecoder.nutritioncoach.monthly')
    expect(fields.expiresAt).toEqual(new Date(EXPIRES))
    expect(fields.environment).toBe('Production')
    expect(fields.status).toBe('active')
    expect(fields.isTrial).toBe(false)
  })

  it('recognises the introductory offer as a trial', () => {
    // offerType 1 is Apple's introductory offer — the free week.
    const fields = subscriptionFieldsFrom(transaction({ offerType: 1 }))

    expect(fields.isTrial).toBe(true)
  })

  it('treats a revoked transaction as revoked whatever its dates say', () => {
    // revocationDate is set when Apple refunds or family sharing is removed.
    // The paid-through date is no longer a promise at that point.
    const fields = subscriptionFieldsFrom(
      transaction({ revocationDate: Date.UTC(2026, 8, 1) })
    )

    expect(fields.status).toBe('revoked')
  })

  it('refuses a transaction with no expiry rather than inventing one', () => {
    // A consumable or a non-renewing purchase has no expiresDate. Defaulting
    // it to anything would either entitle forever or refuse a real purchase.
    expect(() => subscriptionFieldsFrom(transaction({ expiresDate: undefined }))).toThrow()
  })
})

describe('syncSubscription', () => {
  const mockUpsert = vi.mocked(prisma.subscription.upsert)
  const mockFind = vi.mocked(prisma.subscription.findUnique)

  beforeEach(() => {
    vi.resetAllMocks()
    mockFind.mockResolvedValue(null as never)
  })

  it('is idempotent — the same transaction posted twice writes one row', async () => {
    await syncSubscription('u1', transaction())

    const arg = mockUpsert.mock.calls[0][0]
    // Keyed on the user, because a user has at most one subscription and a
    // re-post of the same receipt must update rather than duplicate.
    expect(arg.where).toEqual({ userId: 'u1' })
    expect(arg.create.originalTransactionId).toBe('ot-1')
    expect(arg.update.originalTransactionId).toBe('ot-1')
  })

  it('refuses to move a live subscription onto a second account', async () => {
    // One Apple ID funding two accounts. The newer claim has to lose, or a
    // shared receipt would entitle everyone it is pasted into.
    mockFind.mockResolvedValue({ userId: 'someone-else', expiresAt: new Date(EXPIRES) } as never)

    await expect(syncSubscription('u1', transaction())).rejects.toThrow(/already/i)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('allows the same account to re-post its own transaction', async () => {
    mockFind.mockResolvedValue({ userId: 'u1', expiresAt: new Date(EXPIRES) } as never)

    await syncSubscription('u1', transaction())

    expect(mockUpsert).toHaveBeenCalled()
  })
})
