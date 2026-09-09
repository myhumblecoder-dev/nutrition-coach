import { describe, it, expect, vi, beforeEach } from 'vitest'
import { entitlementFor, isEntitled, subscriptionsEnforced } from './entitlement'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: { subscription: { findUnique: vi.fn() } },
}))

const mockFind = vi.mocked(prisma.subscription.findUnique)

const NOW = new Date('2026-09-09T12:00:00.000Z')
const LATER = new Date('2026-10-09T12:00:00.000Z')
const EARLIER = new Date('2026-09-08T12:00:00.000Z')

function row(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u1',
    originalTransactionId: 'ot-1',
    productId: 'dev.myhumblecoder.nutritioncoach.monthly',
    status: 'active',
    expiresAt: LATER,
    isTrial: false,
    environment: 'Production',
    ...overrides,
  }
}

describe('entitlement', () => {
  beforeEach(() => vi.resetAllMocks())

  it('treats an account with no subscription at all as lapsed', async () => {
    mockFind.mockResolvedValue(null as never)

    expect(await entitlementFor('u1', NOW)).toEqual({ tier: 'lapsed', expiresAt: null })
  })

  it('entitles a paid subscription that has not expired', async () => {
    mockFind.mockResolvedValue(row() as never)

    expect(await entitlementFor('u1', NOW)).toEqual({ tier: 'active', expiresAt: LATER })
  })

  it('distinguishes a trial from a paid month', async () => {
    // Same entitlement, different event — worth being able to tell apart when
    // someone is about to be charged for the first time.
    mockFind.mockResolvedValue(row({ isTrial: true }) as never)

    expect((await entitlementFor('u1', NOW)).tier).toBe('trialing')
  })

  it('lapses on the clock even while Apple still says active', async () => {
    // A renewal notification that never arrives must not entitle forever, and
    // a status string alone would do exactly that.
    mockFind.mockResolvedValue(row({ status: 'active', expiresAt: EARLIER }) as never)

    expect((await entitlementFor('u1', NOW)).tier).toBe('lapsed')
  })

  it('keeps a revoked subscription out even before its date passes', async () => {
    // A refund revokes access immediately; the paid-through date is no longer
    // a promise once Apple has given the money back.
    mockFind.mockResolvedValue(row({ status: 'revoked' }) as never)

    expect((await entitlementFor('u1', NOW)).tier).toBe('lapsed')
  })

  it('keeps a failed renewal alive until the date it was paid through', async () => {
    // Billing retry and grace are Apple still trying to charge the card. The
    // user has done nothing wrong and must not lose the app mid-month.
    mockFind.mockResolvedValue(row({ status: 'billing_retry' }) as never)

    expect((await entitlementFor('u1', NOW)).tier).toBe('active')
  })

  it('treats the expiry instant itself as over', async () => {
    mockFind.mockResolvedValue(row({ expiresAt: NOW }) as never)

    expect((await entitlementFor('u1', NOW)).tier).toBe('lapsed')
  })

  it('never lets a sandbox purchase entitle a production account', async () => {
    // Sandbox transactions are free and unlimited. In production they are
    // worth nothing, and telling them apart later is impossible.
    vi.stubEnv('APPLE_IAP_ENVIRONMENT', 'Production')
    mockFind.mockResolvedValue(row({ environment: 'Sandbox' }) as never)

    expect((await entitlementFor('u1', NOW)).tier).toBe('lapsed')
    vi.unstubAllEnvs()
  })

  it('accepts a sandbox purchase when the server is itself in sandbox', async () => {
    vi.stubEnv('APPLE_IAP_ENVIRONMENT', 'Sandbox')
    mockFind.mockResolvedValue(row({ environment: 'Sandbox' }) as never)

    expect((await entitlementFor('u1', NOW)).tier).toBe('active')
    vi.unstubAllEnvs()
  })

  it('answers the yes-or-no question every gate actually asks', async () => {
    // Enforcement on: this is the gate's real behaviour, and it ships off.
    vi.stubEnv('SUBSCRIPTIONS_ENFORCED', 'true')

    mockFind.mockResolvedValue(row({ isTrial: true }) as never)
    expect(await isEntitled('u1', NOW)).toBe(true)

    mockFind.mockResolvedValue(null as never)
    expect(await isEntitled('u1', NOW)).toBe(false)

    vi.unstubAllEnvs()
  })
})

describe('enforcement is opt-in', () => {
  // The same shape as APP_ATTEST_REQUIRED, for the same reason: the server has
  // to be able to ship before the client can buy anything. Turning this on
  // before StoreKit exists would lock out every existing user at once.
  beforeEach(() => {
    vi.resetAllMocks()
    vi.unstubAllEnvs()
  })

  it('is off unless explicitly turned on', () => {
    expect(subscriptionsEnforced()).toBe(false)

    vi.stubEnv('SUBSCRIPTIONS_ENFORCED', 'yes')
    expect(subscriptionsEnforced()).toBe(false)

    vi.stubEnv('SUBSCRIPTIONS_ENFORCED', 'true')
    expect(subscriptionsEnforced()).toBe(true)
  })

  it('entitles everyone while enforcement is off, without a query', async () => {
    mockFind.mockResolvedValue(null as never)

    expect(await isEntitled('u1', NOW)).toBe(true)
    expect(mockFind).not.toHaveBeenCalled()
  })

  it('still reports the truth while enforcement is off', async () => {
    // The gate is switchable; the status is not. Settings and the paywall have
    // to be able to show what Apple actually thinks.
    vi.stubEnv('SUBSCRIPTIONS_ENFORCED', 'false')
    mockFind.mockResolvedValue(null as never)

    expect((await entitlementFor('u1', NOW)).tier).toBe('lapsed')
  })
})
