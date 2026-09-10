import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { getChatDaysForUser } from '@/lib/dashboard'

/**
 * The days this account has a conversation on, newest first.
 *
 * Feeds the history screen. The chat itself opens on today only, so this is
 * how anything older is reachable at all.
 */
export async function GET(request: Request) {
  const { blocked } = await requireAttestation(request)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  return Response.json({ days: await getChatDaysForUser(user.id) })
}
