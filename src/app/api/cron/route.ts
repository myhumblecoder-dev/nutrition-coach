import { generate } from '@/lib/llm'
import { prisma } from '@/lib/db'
import { nowLine, startOfWeek } from '@/lib/time'
import { COACH_PREAMBLE } from '@/lib/voice'
import { deliverToChannels, hasChannel, pruneTokens, type Delivery } from '@/lib/deliver'
import { nextUnansweredField } from '@/lib/checkin'

// One LLM call per user: batches of 5 keep hundreds of users inside the
// window where a sequential loop would die at a dozen.
export const maxDuration = 300

const BATCH_SIZE = 5

type DailyUser = Parameters<typeof deliverToChannels>[0] & {
  name: string | null
  weeklyCheckIns?: Parameters<typeof nextUnansweredField>[0][]
}

async function deliverToUser(user: DailyUser): Promise<Delivery[]> {
  if (!hasChannel(user)) return []

  // The weekly review outranks the daily nudge. Both crons fire on the same
  // morning, and asking about breakfast while still waiting on the review is
  // two notifications from one bot — this product asks one thing at a time.
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

  return deliverToChannels(user, message)
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!secret || authHeader !== 'Bearer ' + secret) {
    return Response.json({ ok: false }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    where: { OR: [{ telegramChat: { isNot: null } }, { deviceTokens: { some: {} } }] },
    include: {
      telegramChat: true,
      deviceTokens: true,
      weeklyCheckIns: { where: { weekOf: startOfWeek(new Date()) }, take: 1 },
    },
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

  await pruneTokens(prunable)

  return Response.json({ ok: failed === 0, sent, failed })
}
