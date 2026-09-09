import { prisma } from '@/lib/db'

/**
 * Who is allowed to spend money on the model, and until when.
 *
 * One place decides this. Every gate — the daily caps, the v1 routes, the
 * Telegram webhook, the cron — asks here rather than reading the subscription
 * row itself, because the interesting cases are not what Apple's status string
 * says: a renewal notification that never arrives, a refund that revokes
 * access mid-month, a sandbox receipt pointed at production.
 */
export type Tier = 'trialing' | 'active' | 'lapsed'

export type Entitlement = {
  tier: Tier
  /** When access ends if nothing renews. Null when there is no subscription. */
  expiresAt: Date | null
}

/**
 * Statuses where Apple has taken the money back or the user has been cut off.
 * Everything else — active, billing retry, grace period — is someone whose
 * card is being retried and who has done nothing wrong; they keep the app
 * until the date they actually paid through.
 */
const REVOKED = new Set(['revoked', 'refunded'])

/**
 * Which App Store environment this deployment honours.
 *
 * Sandbox transactions are free and unlimited, so one accepted by production
 * would be a subscription anybody could mint. Defaults to Production because
 * the failure is one-directional: refusing a real purchase is a support
 * ticket, accepting a fake one is free access for everyone who notices.
 */
function expectedEnvironment(): string {
  return process.env.APPLE_IAP_ENVIRONMENT === 'Sandbox' ? 'Sandbox' : 'Production'
}

/** The fields the rule actually reads, so a caller can pass a joined row. */
export type SubscriptionFacts = {
  status: string
  expiresAt: Date
  isTrial: boolean
  environment: string
}

/**
 * The rule itself, over a row someone already has.
 *
 * Separate from the lookup so a caller that has joined the subscription
 * already — the daily cron walks every user — can apply the same rule without
 * a query per user, and without a second copy of the rule drifting from this
 * one.
 */
export function tierOf(subscription: SubscriptionFacts | null, now: Date = new Date()): Tier {
  if (!subscription) return 'lapsed'
  if (subscription.environment !== expectedEnvironment()) return 'lapsed'
  if (REVOKED.has(subscription.status)) return 'lapsed'
  // The clock, not the status. Trusting the string alone would entitle a user
  // forever the first time a renewal notification went missing.
  if (subscription.expiresAt <= now) return 'lapsed'

  return subscription.isTrial ? 'trialing' : 'active'
}

export async function entitlementFor(userId: string, now: Date = new Date()): Promise<Entitlement> {
  const subscription = await prisma.subscription.findUnique({ where: { userId } })

  return {
    tier: tierOf(subscription, now),
    expiresAt: subscription?.expiresAt ?? null,
  }
}

/**
 * Whether a missing subscription actually refuses anything yet.
 *
 * Opt-in for the same reason `attestRequired()` is: the server has to be able
 * to ship before the client can buy. Turning this on before StoreKit exists —
 * or before a price is live in App Store Connect — locks out every existing
 * user at once, with no way for any of them to fix it.
 *
 * Only the gates consult this. Status reporting stays honest either way, so
 * Settings and the paywall can show what Apple actually thinks while the gate
 * is still open.
 */
export function subscriptionsEnforced(): boolean {
  return process.env.SUBSCRIPTIONS_ENFORCED === 'true'
}

/** The yes-or-no question every gate actually asks. */
export async function isEntitled(userId: string, now: Date = new Date()): Promise<boolean> {
  if (!subscriptionsEnforced()) return true

  return (await entitlementFor(userId, now)).tier !== 'lapsed'
}
