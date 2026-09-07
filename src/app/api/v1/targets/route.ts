import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { getTargetForUser, setTargetForUser, targetSchema } from '@/lib/targets'

export async function GET(request: Request) {
  const { blocked } = await requireAttestation(request)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  return Response.json({ target: await getTargetForUser(user.id) })
}

export async function PUT(request: Request) {
  const raw = await request.text()
  const { blocked } = await requireAttestation(request, raw)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let parsed
  try {
    parsed = targetSchema.parse(JSON.parse(raw))
  } catch {
    // The bounds are part of the contract, so a rejected value says what the
    // limits are rather than only that something was wrong.
    return Response.json(
      { error: 'calories must be 500–10000 and protein 20–500' },
      { status: 400 }
    )
  }

  const saved = await setTargetForUser(user.id, parsed)

  return Response.json({ target: { calories: saved.calories, protein: saved.protein } })
}
