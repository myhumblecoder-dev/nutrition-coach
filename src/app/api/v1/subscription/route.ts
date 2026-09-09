import { z } from 'zod'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { verifyTransaction } from '@/lib/appleReceipt'
import { syncSubscription, UnusableTransactionError } from '@/lib/subscriptionSync'
import { entitlementFor } from '@/lib/entitlement'

const bodySchema = z.object({ signedTransaction: z.string().min(1) })

function entitlementBody(tier: string, expiresAt: Date | null) {
  return { tier, expiresAt: expiresAt ? expiresAt.toISOString() : null }
}

/**
 * Records a purchase the app has just made.
 *
 * The app posts the transaction's own signed representation rather than a
 * receipt or a product id, because the signature is the proof. Nothing the
 * client says about what it bought is trusted — only what Apple signed.
 *
 * Idempotent by way of `syncSubscription`: StoreKit replays unfinished
 * transactions on every launch, so this will be called with the same JWS more
 * than once and must not mind.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  const { blocked } = await requireAttestation(request, raw)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let signedTransaction: string
  try {
    signedTransaction = bodySchema.parse(JSON.parse(raw)).signedTransaction
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  let transaction
  try {
    transaction = await verifyTransaction(signedTransaction)
  } catch (error) {
    console.error(error)
    // Deliberately vague. A caller probing this endpoint learns only that it
    // did not work, not which part of the chain it failed.
    return Response.json({ error: 'That purchase could not be verified.' }, { status: 400 })
  }

  try {
    await syncSubscription(user.id, transaction)
  } catch (error) {
    if (error instanceof UnusableTransactionError) {
      return Response.json({ error: error.message }, { status: 409 })
    }
    throw error
  }

  const { tier, expiresAt } = await entitlementFor(user.id)

  return Response.json(entitlementBody(tier, expiresAt))
}

/** What this account's subscription looks like right now. */
export async function GET(request: Request) {
  const { blocked } = await requireAttestation(request)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { tier, expiresAt } = await entitlementFor(user.id)

  return Response.json(entitlementBody(tier, expiresAt))
}
