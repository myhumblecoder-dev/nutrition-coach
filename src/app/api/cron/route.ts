import { generate } from '@/lib/llm'
import { prisma } from '@/lib/db'
import { nowLine } from '@/lib/time'
import { sendTelegramMessage } from '@/lib/telegram'

// One LLM call per linked user: batches of 5 keep hundreds of users inside
// the window where a sequential loop would die at a dozen.
export const maxDuration = 300

const BATCH_SIZE = 5

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!secret || authHeader !== 'Bearer ' + secret) {
    return Response.json({ ok: false }, { status: 401 })
  }

  const chats = await prisma.telegramChat.findMany({ include: { user: true } })
  let sent = 0
  let failed = 0

  for (let i = 0; i < chats.length; i += BATCH_SIZE) {
    const batch = chats.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (chat) => {
        const prompt =
          nowLine() +
          ' Write a short, friendly daily nutrition check-in message for ' +
          (chat.user.name ?? 'the user') +
          '. Ask how they plan to eat today. Reply with the message only.'
        const reply = await generate(prompt)
        await sendTelegramMessage(chat.chatId, reply)
      })
    )
    for (const result of results) {
      if (result.status === 'fulfilled') {
        sent++
      } else {
        failed++
        console.error(result.reason instanceof Error ? result.reason.message : 'Unknown error')
      }
    }
  }

  return Response.json({ ok: failed === 0, sent, failed })
}
