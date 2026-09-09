import { prisma } from '@/lib/db'
import { sendTelegramMessage } from '@/lib/telegram'
import { sendPushNotification } from '@/lib/push'

// Delivery shared by the daily nudge and the weekly check-in, so the two crons
// cannot drift on how a dead token or a failed send is handled.

export const PUSH_TITLE = 'Roughly'

/**
 * `reason` travels with a failure so a cron can say *why* nothing arrived.
 *
 * Without it every failure looked alike, and "push is not configured at all"
 * — which affects every user on every run — was indistinguishable from one
 * stale token. That is how a fortnight of silent, total push failure went
 * unnoticed: the counts were right, and nothing said what was wrong.
 */
export type Delivery = { ok: boolean; prune?: string; reason?: string }

export type Deliverable = {
  telegramChat: { chatId: string } | null
  deviceTokens: { token: string }[]
}

export function hasChannel(user: Deliverable): boolean {
  return Boolean(user.telegramChat) || user.deviceTokens.length > 0
}

function logged(error: unknown): Delivery {
  const reason = error instanceof Error ? error.message : 'Unknown error'
  console.error(reason)
  return { ok: false, prune: undefined, reason }
}

export type Channels = {
  /**
   * Whether to send an APNs push as well as Telegram.
   *
   * The daily nudge sets this false: the phone now schedules its own three
   * reminders locally, at the user's own nine, one and seven, so pushing a
   * fourth from a fixed UTC cron would be a duplicate arriving at the wrong
   * hour for everyone outside one timezone. The weekly check-in still pushes —
   * it has no local equivalent and it is the one notification worth
   * interrupting for.
   */
  push?: boolean
}

export async function deliverToChannels(
  user: Deliverable,
  message: string,
  title: string = PUSH_TITLE,
  channels: Channels = {}
): Promise<Delivery[]> {
  const { push = true } = channels
  const deliveries: Promise<Delivery>[] = []

  if (user.telegramChat) {
    deliveries.push(
      sendTelegramMessage(user.telegramChat.chatId, message).then(() => ({ ok: true }), logged)
    )
  }

  for (const device of push ? user.deviceTokens : []) {
    deliveries.push(
      sendPushNotification(device.token, { title, body: message }).then(
        (result) => ({
          ok: result.ok,
          // 410 means the app was deleted. Anything else may be transient, and
          // deleting on a 503 would silently unsubscribe a live device.
          prune: result.unregistered ? device.token : undefined,
          // PushResult carries a status, not a message: an HTTP code from
          // APNs is the whole story for a rejected send.
          reason: result.ok ? undefined : `APNs returned ${result.status}`,
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

/**
 * One line a person would actually notice, when a cron run failed anyone.
 *
 * The delivery counts already existed — in the HTTP response to a scheduled
 * invocation, which nothing reads. A distinct, greppable error line is the
 * difference between a number and a signal.
 */
export function logDeliverySummary(
  job: string,
  outcome: { sent: number; failed: number; reasons: string[] }
): void {
  if (outcome.failed === 0) {
    console.log(`${job}: sent ${outcome.sent}`)
    return
  }

  const distinct = [...new Set(outcome.reasons)]
  console.error(
    `${job} FAILED for ${outcome.failed} of ${outcome.sent + outcome.failed}: ` +
      (distinct.length > 0 ? distinct.join('; ') : 'no reason reported')
  )
}
