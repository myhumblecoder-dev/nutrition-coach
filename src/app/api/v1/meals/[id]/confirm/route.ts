import { z } from 'zod'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { confirmPendingMeal } from '@/lib/meals'

type Context = { params: Promise<{ id: string }> }

// Both optional: a user who agrees with the estimate sends an empty body, and
// one who corrects only the calories should not have to restate the protein.
// Bounded because these numbers become the denominator under Today's rings,
// and an unchecked one would sit there looking like a measurement.
const bodySchema = z.object({
  totalCalories: z.number().int().nonnegative().max(20000).optional(),
  totalProtein: z.number().int().nonnegative().max(2000).optional(),
})

/**
 * Logs a pending meal for real, optionally with totals the user corrected.
 *
 * The edit is the one thing the web's confirm card offers that Telegram's two
 * buttons do not, and it is why this is a route of its own rather than a flag
 * on the photo endpoint: the numbers are not known until someone has looked
 * at what the model said.
 */
export async function POST(request: Request, { params }: Context) {
  const raw = await request.text()
  const { blocked } = await requireAttestation(request, raw)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let overrides
  try {
    overrides = bodySchema.parse(raw ? JSON.parse(raw) : {})
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { id } = await params

  if (!(await confirmPendingMeal(user.id, id, overrides))) {
    return Response.json({ error: "That meal's no longer pending." }, { status: 404 })
  }

  return Response.json({ ok: true })
}
