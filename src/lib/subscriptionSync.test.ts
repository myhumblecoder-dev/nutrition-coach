import { describe, it, expect, vi, beforeEach } from 'vitest'
import { subscriptionFieldsFrom, syncSubscription } from './subscriptionSync'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: {
    subscription: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(), upsert: vi.fn() },
  },
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
  // findFirst, not findUnique: originalTransactionId stopped being unique
  // when Family Sharing made several rows share one.
  const mockFind = vi.mocked(prisma.subscription.findFirst)

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
    // Null, not the caller's own row: the query excludes this user, so a hit
    // means somebody else holds it. Re-posting simply finds nothing.
    mockFind.mockResolvedValue(null)

    await syncSubscription('u1', transaction())

    expect(mockUpsert).toHaveBeenCalled()
  })
})


describe('family sharing', () => {
  beforeEach(() => {
    vi.mocked(prisma.subscription.findFirst).mockReset()
    vi.mocked(prisma.subscription.upsert).mockReset()
  })

  it('reads the ownership type Apple sends', () => {
    const shared = subscriptionFieldsFrom(transaction({ inAppOwnershipType: 'FAMILY_SHARED' }))

    expect(shared.ownershipType).toBe('FAMILY_SHARED')
  })

  it('treats a transaction with no ownership type as a purchase', () => {
    // Apple has always sent this field, but a missing one must not silently
    // become a family share — that is the direction that gives access away.
    expect(subscriptionFieldsFrom(transaction()).ownershipType).toBe('PURCHASED')
  })

  it('entitles a family member even though the purchaser holds the same transaction id', async () => {
    // The whole point of Family Sharing: one purchase, several Apple IDs, all
    // carrying the buyer's originalTransactionId. Refusing on the id alone
    // would deny everyone Apple has told they have access.
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null)

    await syncSubscription('family-member', transaction({ inAppOwnershipType: 'FAMILY_SHARED' }))

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'family-member' } })
    )
  })

  it('still refuses a second account claiming the same purchase', async () => {
    // Unchanged from before, and the reason the check exists: a receipt moved
    // to another account arrives as PURCHASED, not FAMILY_SHARED, because
    // Apple signs the ownership type along with everything else.
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue(
      { userId: 'the-buyer' } as never
    )

    await expect(syncSubscription('someone-else', transaction())).rejects.toThrow(
      /already attached to another account/
    )
  })

})

describe('family sharing limits', () => {
  beforeEach(() => {
    vi.mocked(prisma.subscription.findFirst).mockReset().mockResolvedValue(null)
    vi.mocked(prisma.subscription.count).mockReset().mockResolvedValue(0 as never)
    vi.mocked(prisma.subscription.upsert).mockReset()
  })

  it('asks only about other accounts when checking for a collision', async () => {
    // Scoped to someone else from the start, rather than fetched and compared.
    // findFirst on a non-unique column returns an arbitrary row, so a query
    // that can return the caller's own row could refuse the buyer access to
    // the account he bought it on.
    await syncSubscription('buyer', transaction())

    expect(prisma.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          originalTransactionId: 'ot-1',
          ownershipType: 'PURCHASED',
          userId: { not: 'buyer' },
        },
      })
    )
  })

  it('refuses a sixth family member', async () => {
    // Apple's family is the organiser plus five. Nothing in a signed
    // transaction says who it was issued to, so one shared JWS could otherwise
    // be posted to any number of accounts — each costing real model spend
    // against a single subscription.
    vi.mocked(prisma.subscription.count).mockResolvedValue(5 as never)

    await expect(
      syncSubscription('stranger', transaction({ inAppOwnershipType: 'FAMILY_SHARED' }))
    ).rejects.toThrow(/family/i)
  })

  it('admits a fifth family member', async () => {
    vi.mocked(prisma.subscription.count).mockResolvedValue(4 as never)

    await syncSubscription('cousin', transaction({ inAppOwnershipType: 'FAMILY_SHARED' }))

    expect(prisma.subscription.upsert).toHaveBeenCalled()
  })

  it('does not count the family when someone re-posts their own share', async () => {
    // A family member re-posting is idempotent, not a new seat.
    vi.mocked(prisma.subscription.count).mockResolvedValue(5 as never)

    await expect(
      syncSubscription('cousin', transaction({ inAppOwnershipType: 'FAMILY_SHARED' }))
    ).rejects.toThrow()

    expect(prisma.subscription.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: { not: 'cousin' } }),
      })
    )
  })
})
