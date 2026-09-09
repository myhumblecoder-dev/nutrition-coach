import { prisma } from '@/lib/db'
import { appTimeZone, resolveTimeZone } from '@/lib/time'

/**
 * Which timezone this user's day is measured in.
 *
 * Their day boundary decides when the daily caps reset and what the rings on
 * Today are counting — both of which belong to the person, not the server.
 * Before this, everyone's day began at midnight in `APP_TIMEZONE`, so a user
 * in London had their caps reset at five in the morning.
 *
 * Falls back to the app zone for anyone whose client has not reported one,
 * which is every account created before the phone started sending it.
 */
export async function zoneFor(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    })

    return resolveTimeZone(user?.timezone)
  } catch (error) {
    // On the path to every chat and photo. A database blip should cost the
    // right day boundary, not the request the user actually made.
    console.error(
      'timezone lookup failed: ' + (error instanceof Error ? error.message : 'unknown')
    )
    return appTimeZone()
  }
}
