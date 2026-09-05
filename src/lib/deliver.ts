import { prisma } from '@/lib/db'
import { sendTelegramMessage } from '@/lib/telegram'
import { sendPushNotification } from '@/lib/push'

// Delivery shared by the daily nudge and the weekly check-in, so the two crons
// cannot drift on how a dead token or a failed send is handled.

export const PUSH_TITLE = 'Roughly'

export type Delivery = { ok: boolean; prune?: string }

export type Deliverable = {
  telegramChat: { chatId: string } | null
  deviceTokens: { token: string }[]
}

export function hasChannel(user: Deliverable): boolean {
  return Boolean(user.telegramChat) || user.deviceTokens.length > 0
}

function logged(error: unknown): Delivery {
  console.error(error instanceof Error ? error.message : 'Unknown error')
  return { ok: false, prune: undefined }
}

export async function deliverToChannels(
  user: Deliverable,
  message: string,
  title: string = PUSH_TITLE
): Promise<Delivery[]> {
  const deliveries: Promise<Delivery>[] = []

  if (user.telegramChat) {
    deliveries.push(
      sendTelegramMessage(user.telegramChat.chatId, message).then(() => ({ ok: true }), logged)
    )
  }

  for (const device of user.deviceTokens) {
    deliveries.push(
      sendPushNotification(device.token, { title, body: message }).then(
        (result) => ({
          ok: result.ok,
          // 410 means the app was deleted. Anything else may be transient, and
          // deleting on a 503 would silently unsubscribe a live device.
          prune: result.unregistered ? device.token : undefined,
        }),
        logged
      )
    )
  }

  return Promise.all(deliveries)
}

export async function pruneTokens(tokens: string[]): Promise<void> {
  for (const token of tokens) {
    await prisma.deviceToken.deleteMany({ where: { token } })
  }
}
