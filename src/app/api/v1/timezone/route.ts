import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { appTimeZone, resolveTimeZone } from '@/lib/time'

const bodySchema = z.object({ timezone: z.string().trim().min(1).max(64) })

/**
 * Which timezone the user's day is measured in.
 *
 * Chosen in Settings rather than taken silently from the device: the day
 * boundary decides when the daily caps reset and what the rings on Today are
 * counting, and moving that under someone because they crossed a border is a
 * surprise. It defaults to America/New_York until they say otherwise.
 */
export async function GET(request: Request) {
  const { blocked } = await requireAttestation(request)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // The default rather than null: Settings has to show something, and what it
  // shows should be the zone their day is actually being measured in.
  return Response.json({ timezone: resolveTimeZone(user.timezone) })
}

export async function PUT(request: Request) {
  const raw = await request.text()
  const { blocked } = await requireAttestation(request, raw)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let timezone: string
  try {
    timezone = bodySchema.parse(JSON.parse(raw)).timezone
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Validated here rather than shrugged off at read time. `resolveTimeZone`
  // would quietly fall back to the app default, so a typo would move the
  // user's whole day boundary with nothing anywhere saying why.
  if (resolveTimeZone(timezone) !== timezone) {
    return Response.json({ error: 'Not a recognised timezone' }, { status: 400 })
  }

  await prisma.user.update({ where: { id: user.id }, data: { timezone } })

  return Response.json({ timezone })
}

/** Exported so the client and the tests agree on what "unset" means. */
export const DEFAULT_TIMEZONE = appTimeZone()
