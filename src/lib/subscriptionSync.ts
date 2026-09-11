import { prisma } from '@/lib/db'

/**
 * The parts of a verified App Store transaction this app reads.
 *
 * Deliberately structural rather than the library's own type: both the
 * transaction the app posts and the one inside a notification decode to the
 * same shape, and typing against the fields actually used keeps the two paths
 * on one function.
 */
export type AppleTransaction = {
  originalTransactionId?: string
  productId?: string
  /** Milliseconds since the epoch, Apple's convention for every date it sends. */
  expiresDate?: number
  revocationDate?: number
  environment?: string
  /** 1 is the introductory offer — the free week. */
  offerType?: number
  /**
   * 'PURCHASED' | 'FAMILY_SHARED'. Apple signs this along with everything
   * else, so it is the one trustworthy way to tell a family member apart from
   * someone replaying a receipt they were given.
   */
  inAppOwnershipType?: string
}

export type SubscriptionFields = {
  originalTransactionId: string
  productId: string
  status: string
  expiresAt: Date
  isTrial: boolean
  ownershipType: string
  environment: string
}

/** Thrown when a verified transaction is not something we can entitle from. */
export class UnusableTransactionError extends Error {}

/**
 * Reduces a verified transaction to the six fields entitlement is decided from.
 *
 * Everything else Apple sends is either duplicated elsewhere or irrelevant to
 * the only question this app asks: may this account spend money on the model,
 * and until when.
 */
export function subscriptionFieldsFrom(transaction: AppleTransaction): SubscriptionFields {
  const { originalTransactionId, productId, expiresDate, environment } = transaction

  if (!originalTransactionId || !productId || !environment) {
    throw new UnusableTransactionError('Transaction is missing its identifying fields')
  }

  // A consumable or non-renewing purchase has no expiry. Defaulting it would
  // either entitle someone forever or refuse a genuine purchase, and both are
  // worse than refusing to guess.
  if (!expiresDate) {
    throw new UnusableTransactionError('Transaction has no expiry date')
  }

  return {
    originalTransactionId,
    productId,
    // Set when Apple refunds, or when family sharing is withdrawn. The
    // paid-through date stops being a promise at that point, which is why
    // `entitlementFor` treats this status as lapsed regardless of the date.
    status: transaction.revocationDate ? 'revoked' : 'active',
    expiresAt: new Date(expiresDate),
    isTrial: transaction.offerType === 1,
    // Defaulted to a purchase, never to a share: an absent field must fail
    // towards the stricter rule, because the other direction hands out access
    // on the strength of a value that was not there.
    ownershipType: transaction.inAppOwnershipType === 'FAMILY_SHARED' ? 'FAMILY_SHARED' : 'PURCHASED',
    environment,
  }
}

/**
 * Writes what Apple says about a subscription onto an account.
 *
 * Called from both directions — the app posting a fresh purchase, and Apple's
 * notifications afterwards — so it has to be idempotent. Keyed on `userId`
 * because an account has at most one subscription; the transaction id is
 * unique separately, which is what makes the check below possible.
 */
export async function syncSubscription(userId: string, transaction: AppleTransaction) {
  const fields = subscriptionFieldsFrom(transaction)

  // One Apple ID cannot fund two accounts — but Family Sharing is Apple
  // deliberately doing exactly that, and up to five family members legitimately
  // carry the buyer's `originalTransactionId`. So the collision rule applies
  // between *purchases* only.
  //
  // That is safe because Apple signs `inAppOwnershipType`: a receipt moved to
  // another account arrives as PURCHASED and still collides. Only a transaction
  // Apple itself marked FAMILY_SHARED gets past, and Apple only marks one that
  // way for someone actually in the buyer's family.
  if (fields.ownershipType === 'PURCHASED') {
    const existing = await prisma.subscription.findFirst({
      where: {
        originalTransactionId: fields.originalTransactionId,
        ownershipType: 'PURCHASED',
      },
      select: { userId: true },
    })
    if (existing && existing.userId !== userId) {
      throw new UnusableTransactionError(
        'That subscription is already attached to another account'
      )
    }
  }

  return prisma.subscription.upsert({
    where: { userId },
    create: { userId, ...fields, lastVerifiedAt: new Date() },
    update: { ...fields, lastVerifiedAt: new Date() },
  })
}
