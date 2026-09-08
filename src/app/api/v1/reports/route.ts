import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { recordReport, reportSchema } from '@/lib/reports'

export async function POST(request: Request) {
  const raw = await request.text()
  const { blocked } = await requireAttestation(request, raw)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let parsed
  try {
    parsed = reportSchema.parse(JSON.parse(raw))
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  await recordReport(user.id, parsed)

  return Response.json({ ok: true })
}
