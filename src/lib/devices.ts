import { prisma } from '@/lib/db'

/**
 * Registers (or rebinds) an APNs device token.
 *
 * Upsert by token rather than create: iOS reissues the same token on every
 * launch, and a device signed into a different account must move to that
 * account rather than collide on the unique — the same "phone wins" rule
 * consumeLinkToken applies in src/lib/telegramLink.ts.
 */
export async function registerDeviceToken(userId: string, token: string, platform = 'ios') {
  return prisma.deviceToken.upsert({
    where: { token },
    create: { token, userId, platform },
    update: { userId, platform },
  })
}

export async function unregisterDeviceToken(token: string) {
  const { count } = await prisma.deviceToken.deleteMany({ where: { token } })
  return count
}

export async function listDeviceTokens(userId: string) {
  return prisma.deviceToken.findMany({ where: { userId } })
}
