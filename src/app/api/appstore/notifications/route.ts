import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyNotification } from '@/lib/appleReceipt'
import { subscriptionFieldsFrom, UnusableTransactionError } from '@/lib/subscriptionSync'

const bodySchema = z.object({ signedPayload: z.string().min(1) })

/**
 * App Store Server Notifications V2 — what keeps an entitlement true after the
 * purchase.
 *
 * Without this a subscription would be frozen at whatever the app last posted:
 * renewals would never extend it, refunds would never revoke it, and a
 * cancellation would only be noticed when the date finally passed.
 *
 * There is no bearer token because Apple calls this. **The signature is the
 * authentication** — an unverified payload is refused before anything is read
 * out of it, which is the same shape as the Telegram webhook's shared secret.
 *
 * Answers 200 to anything it has understood, including notifications about
 * subscriptions it has never seen. Apple retries anything that is not a 200,
 * and a row we do not have is not a failure retrying can fix.
 */
export async function POST(request: Request) {
  let signedPayload: string
  try {
    signedPayload = bodySchema.parse(await request.json()).signedPayload
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  let notification
  try {
    notification = await verifyNotification(signedPayload)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const transaction = notification.data?.signedTransactionInfo
  if (!transaction) {
    // TEST notifications, and the notification types that carry no
    // transaction, are acknowledged and ignored.
    return Response.json({ ok: true, applied: false })
  }

  let fields
  try {
    fields = subscriptionFieldsFrom(
      transaction as unknown as Parameters<typeof subscriptionFieldsFrom>[0]
    )
  } catch (error) {
    if (error instanceof UnusableTransactionError) {
      console.error(`${notification.notificationType}: ${error.message}`)
      return Response.json({ ok: true, applied: false })
    }
    throw error
  }

  // Scoped by the transaction id, never by anything a caller chose: the
  // notification itself says which subscription it is about. `updateMany`
  // rather than `update` so an unknown subscription is a count of zero instead
  // of a thrown record-not-found.
  const { count } = await prisma.subscription.updateMany({
    where: { originalTransactionId: fields.originalTransactionId },
    data: {
      productId: fields.productId,
      status: fields.status,
      expiresAt: fields.expiresAt,
      isTrial: fields.isTrial,
      environment: fields.environment,
      lastVerifiedAt: new Date(),
    },
  })

  return Response.json({ ok: true, applied: count > 0 })
}
