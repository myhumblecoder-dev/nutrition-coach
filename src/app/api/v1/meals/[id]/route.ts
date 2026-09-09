import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { discardPendingMeal } from '@/lib/meals'

type Context = { params: Promise<{ id: string }> }

/**
 * Throws away a meal the vision model read but the user did not want.
 *
 * Only a pending meal can be deleted — see `discardPendingMeal`. Nothing here
 * can remove something the user already logged, which is what keeps a stale
 * Discard button harmless.
 */
export async function DELETE(request: Request, { params }: Context) {
  const { blocked } = await requireAttestation(request)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  if (!(await discardPendingMeal(user.id, id))) {
    return Response.json({ error: "That meal's no longer pending." }, { status: 404 })
  }

  return Response.json({ ok: true })
}
