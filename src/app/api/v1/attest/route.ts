import { z } from 'zod'
import { registerAttestation } from '@/lib/attest'
import { authenticateBearer } from '@/lib/apiAuth'

const bodySchema = z.object({
  keyId: z.string().min(1).max(200),
  attestation: z.string().min(1),
  challenge: z.string().min(1).max(200),
})

export async function POST(request: Request) {
  let parsed
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Signing in first is optional: a device may attest before the user has an
  // account. When a session is present the device is linked to it, which is
  // what lets us see one account spread across many devices, or the reverse.
  const user = await authenticateBearer(request)

  try {
    await registerAttestation({ ...parsed, userId: user?.id })
  } catch (error) {
    console.error(
      'attestation rejected: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
    return Response.json({ error: 'Attestation failed' }, { status: 401 })
  }

  return Response.json({ ok: true })
}
