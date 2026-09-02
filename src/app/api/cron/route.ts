import { generate } from '@/lib/llm'
import { prisma } from '@/lib/db'
import { nowLine } from '@/lib/time'
import { sendTelegramMessage } from '@/lib/telegram'
import { sendPushNotification } from '@/lib/push'

// One LLM call per user: batches of 5 keep hundreds of users inside the
// window where a sequential loop would die at a dozen.
export const maxDuration = 300

const BATCH_SIZE = 5
const PUSH_TITLE = 'Nutrition Coach'

type Delivery = { ok: boolean; prune?: string }

async function deliverToUser(user: {
  name: string | null
  telegramChat: { chatId: string } | null
  deviceTokens: { token: string }[]
}): Promise<Delivery[]> {
  const hasChannel = Boolean(user.telegramChat) || user.deviceTokens.length > 0
  if (!hasChannel) return []

  // Generated once per user, not once per channel: two calls would pay twice
  // to say the same thing, and could say two different things.
  const prompt =
    nowLine() +
    ' Write a short, friendly daily nutrition check-in message for ' +
    (user.name ?? 'the user') +
    '. Ask how they plan to eat today. Reply with the message only.'
  const message = await generate(prompt)

  const deliveries: Promise<Delivery>[] = []

  if (user.telegramChat) {
    const chatId = user.telegramChat.chatId
    deliveries.push(
      sendTelegramMessage(chatId, message).then(
        () => ({ ok: true }),
        (error: unknown) => {
          console.error(error instanceof Error ? error.message : 'Unknown error')
          return { ok: false }
        }
      )
    )
  }

  for (const device of user.deviceTokens) {
    deliveries.push(
      sendPushNotification(device.token, { title: PUSH_TITLE, body: message }).then(
        (result) => ({
          ok: result.ok,
          // 410 means the app was deleted. Anything else may be transient, and
          // deleting on a 503 would silently unsubscribe a live device.
          prune: result.unregistered ? device.token : undefined,
        }),
        (error: unknown) => {
          console.error(error instanceof Error ? error.message : 'Unknown error')
          return { ok: false }
        }
      )
    )
  }

  return Promise.all(deliveries)
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!secret || authHeader !== 'Bearer ' + secret) {
    return Response.json({ ok: false }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    where: { OR: [{ telegramChat: { isNot: null } }, { deviceTokens: { some: {} } }] },
    include: { telegramChat: true, deviceTokens: true },
  })

  let sent = 0
  let failed = 0
  const prunable: string[] = []

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(deliverToUser))

    for (const result of results) {
      if (result.status === 'rejected') {
        // The LLM call threw: this user gets nothing, but the batch continues.
        failed++
        console.error(
          result.reason instanceof Error ? result.reason.message : 'Unknown error'
        )
        continue
      }

      for (const delivery of result.value) {
        if (delivery.ok) sent++
        else failed++
        if (delivery.prune) prunable.push(delivery.prune)
      }
    }
  }

  for (const token of prunable) {
    await prisma.deviceToken.deleteMany({ where: { token } })
  }

  return Response.json({ ok: failed === 0, sent, failed })
}
