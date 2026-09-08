import { prisma } from '@/lib/db'
import { deliverToChannels, hasChannel, pruneTokens, logDeliverySummary } from '@/lib/deliver'
import { getOrCreateCheckIn, nextUnansweredField, QUESTIONS } from '@/lib/checkin'

// Opens the weekly review and asks the next question. This is what makes the
// product work without the user remembering to open the app — the coach comes
// to them.
export const maxDuration = 300

const BATCH_SIZE = 5
const PUSH_TITLE = 'This week'

type Outcome = {
  sent: number
  failed: number
  skipped: number
  prune: string[]
  reasons: string[]
}

const EMPTY: Outcome = { sent: 0, failed: 0, skipped: 0, prune: [], reasons: [] }

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
  let skipped = 0
  const prunable: string[] = []
  const reasons: string[] = []

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (user): Promise<Outcome> => {
        if (!hasChannel(user)) return { ...EMPTY, skipped: 1 }

        const checkIn = await getOrCreateCheckIn(user.id)
        const field = nextUnansweredField(checkIn)

        // Already done for this week. Asking again would be the nagging this
        // product is supposed to be the opposite of.
        if (!field) return { ...EMPTY, skipped: 1 }

        // No LLM call here on purpose: the questions are fixed, and a
        // generated opener would risk rewording the thing the whole record is
        // keyed on. The coach's voice comes in on the reply.
        const question = QUESTIONS[field]

        // Written into the conversation, not only pushed. A notification is a
        // reminder that disappears; the chat is where the user answers, and
        // `awaitingCheckInAnswer` matches on the coach having asked there.
        // Without this row the question is unanswerable — the push leads to an
        // app with no question in it.
        await prisma.chatMessage.create({
          data: { userId: user.id, role: 'assistant', content: question },
        })

        const deliveries = await deliverToChannels(user, question, PUSH_TITLE)

        return {
          sent: deliveries.filter((d) => d.ok).length,
          failed: deliveries.filter((d) => !d.ok).length,
          skipped: 0,
          prune: deliveries.flatMap((d) => (d.prune ? [d.prune] : [])),
          reasons: deliveries.flatMap((d) => (d.reason ? [d.reason] : [])),
        }
      })
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        failed++
        const why = result.reason instanceof Error ? result.reason.message : 'Unknown error'
        reasons.push(why)
        console.error(why)
        continue
      }
      sent += result.value.sent
      failed += result.value.failed
      skipped += result.value.skipped
      prunable.push(...result.value.prune)
      reasons.push(...result.value.reasons)
    }
  }

  await pruneTokens(prunable)

  logDeliverySummary('weekly check-in', { sent, failed, reasons })

  return Response.json({ ok: failed === 0, sent, failed, skipped, reasons: [...new Set(reasons)] })
}
