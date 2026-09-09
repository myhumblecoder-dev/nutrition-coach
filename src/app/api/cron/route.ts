import { generate } from '@/lib/llm'
import { tierOf, subscriptionsEnforced, type SubscriptionFacts } from '@/lib/entitlement';
import { prisma } from '@/lib/db'
import { nowLine, startOfWeek } from '@/lib/time'
import { COACH_PREAMBLE } from '@/lib/voice'
import { deliverToChannels, hasChannel, pruneTokens, type Delivery, logDeliverySummary } from '@/lib/deliver'
import { nextUnansweredField } from '@/lib/checkin'

// One LLM call per user: batches of 5 keep hundreds of users inside the
// window where a sequential loop would die at a dozen.
export const maxDuration = 300

const BATCH_SIZE = 5

type DailyUser = Parameters<typeof deliverToChannels>[0] & {
  name: string | null
  weeklyCheckIns?: Parameters<typeof nextUnansweredField>[0][]
  subscription?: SubscriptionFacts | null
}

async function deliverToUser(user: DailyUser): Promise<Delivery[]> {
  if (!hasChannel(user)) return []

  // The weekly review outranks the daily nudge. Both crons fire on the same
  // morning, and asking about breakfast while still waiting on the review is
  // two notifications from one bot — this product asks one thing at a time.
  // The nudge is a model call per user per day. Before subscriptions this ran
  // for anyone who had ever installed the app, so a churned account kept
  // costing money indefinitely — a floor that scaled with total signups
  // rather than with subscribers.
  if (subscriptionsEnforced() && tierOf(user.subscription ?? null) === 'lapsed') return []

  const pending = user.weeklyCheckIns?.[0]
  if (pending && nextUnansweredField(pending)) return []

  // Generated once per user, not once per channel: two calls would pay twice
  // to say the same thing, and could say two different things.
  const prompt =
    nowLine() +
    ' ' +
    COACH_PREAMBLE +
    ' Write a short daily check-in message for ' +
    (user.name ?? 'the user') +
    '. Ask how they plan to eat today. One or two sentences.' +
    ' Reply with the message only.'
  const message = await generate(prompt)

  // Telegram only. iOS schedules its own nudges on the device now, so pushing
  // one from a fixed UTC cron would arrive at the wrong hour for everyone
  // outside APP_TIMEZONE — and as a second notification for everyone inside
  // it. Telegram has no local scheduling, so it keeps this one.
  return deliverToChannels(user, message, undefined, { push: false })
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!secret || authHeader !== 'Bearer ' + secret) {
    return Response.json({ ok: false }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    // Only linked Telegram chats: an iOS-only account gets nothing from this
    // cron now, so loading it would be a model call spent on a message with
    // nowhere to go.
    where: { telegramChat: { isNot: null } },
    include: {
      telegramChat: true,
      deviceTokens: true,
      // Joined rather than queried per user: `tierOf` is the same rule
      // `entitlementFor` applies, without a round trip for each of them.
      subscription: true,
      weeklyCheckIns: { where: { weekOf: startOfWeek(new Date()) }, take: 1 },
    },
  })

  let sent = 0
  let failed = 0
  const reasons: string[] = []
  const prunable: string[] = []

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(deliverToUser))

    for (const result of results) {
      if (result.status === 'rejected') {
        // The LLM call threw: this user gets nothing, but the batch continues.
        failed++
        const why = result.reason instanceof Error ? result.reason.message : 'Unknown error'
        reasons.push(why)
        console.error(why)
        continue
      }

      for (const delivery of result.value) {
        if (delivery.ok) sent++
        else {
          failed++
          if (delivery.reason) reasons.push(delivery.reason)
        }
        if (delivery.prune) prunable.push(delivery.prune)
      }
    }
  }

  await pruneTokens(prunable)

  // One greppable line. The counts already existed, in an HTTP response to a
  // scheduled invocation that nothing reads — which is how total push failure
  // went unnoticed for a fortnight.
  logDeliverySummary('daily nudge', { sent, failed, reasons })

  return Response.json({ ok: failed === 0, sent, failed, reasons: [...new Set(reasons)] })
}
