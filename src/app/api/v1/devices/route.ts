import { z } from 'zod'
import { authenticateBearer } from '@/lib/apiAuth'
import { registerDeviceToken, unregisterDeviceToken } from '@/lib/devices'

// APNs device tokens are 64 hex chars today. The shape is checked but the
// length is not pinned: Apple has changed it before, and rejecting a valid
// token would silently disable notifications for that device.
const bodySchema = z.object({
  token: z.string().regex(/^[0-9a-fA-F]{32,200}$/),
  platform: z.string().max(32).optional(),
})

export async function POST(request: Request) {
  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let parsed
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  await registerDeviceToken(user.id, parsed.token, parsed.platform ?? 'ios')

  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let parsed
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Idempotent: turning the toggle off twice, or after the token already
  // rotated, must not surface an error the app has to handle.
  await unregisterDeviceToken(parsed.token)

  return Response.json({ ok: true })
}
