import { generate } from '@/lib/llm'
import { prisma } from '@/lib/db'

async function sendTelegramMessage(text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    throw new Error('Telegram not configured')
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content\u0000Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
    }),
  })

  if (!res.ok) {
    throw new Error('Telegram send failed: ' + res.statusText)
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!secret || authHeader !== 'Bearer ' + secret) {
    return Response.json({ ok: false }, { status: 401 })
  }

  const users = await prisma.user.findMany()
  let sent = 0
  let failed = 0

  for (const user of users) {
    try {
      const prompt = 'Write a short, friendly daily nutrition check-in message for ' + (user.name ?? 'the user') + '. Ask how they plan to eat today. Reply with the message only.'
      const reply = await generate(prompt)
      await sendTelegramMessage(reply)
      sent++
    } catch (err) {
      failed++
      console.error(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return Response.json({ ok: failed === 0, sent, failed })
}