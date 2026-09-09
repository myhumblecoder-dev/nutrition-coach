import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { prisma } from '@/lib/db'
import { deletePhotos } from '@/lib/photoStore'

// App Store Review Guideline 5.1.1(v): an app that lets a user create an
// account must let them delete it from inside the app. The web has a server
// action for this, which a native client cannot call, so the same delete is
// exposed here.

const CONFIRMATION = 'DELETE'

export async function DELETE(request: Request) {
  const raw = await request.text()
  const { blocked } = await requireAttestation(request, raw)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // An explicit confirmation in the body, matching the web action. The UI
  // already asks twice; this makes a stray DELETE from a retried or
  // mis-routed request incapable of destroying an account on its own.
  let confirm: unknown
  try {
    confirm = (JSON.parse(raw) as { confirm?: unknown }).confirm
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (typeof confirm !== 'string' || confirm.trim() !== CONFIRMATION) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  // One delete: every related table declares onDelete: Cascade, so this takes
  // meals, chat history, training, recovery, mood, measurements, targets,
  // profile, the Telegram link, device tokens, attested devices, and the
  // OAuth accounts and sessions with it. Deleting the sessions is what signs
  // the phone out — no separate revocation needed.
  // Photos live in blob storage, which no cascade reaches. Collected before
  // the delete, because afterwards there is nothing left to say which blobs
  // were theirs — and a "deleted" account whose meal photos stay readable at
  // public URLs is not a deleted account.
  const meals = await prisma.mealEntry.findMany({
    where: { userId: user.id },
    select: { photoUrl: true },
  })

  await prisma.user.delete({ where: { id: user.id } })

  await deletePhotos(meals.map((meal) => meal.photoUrl))

  return Response.json({ ok: true })
}
