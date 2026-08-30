import { generate } from '@/lib/llm'
import { prisma } from '@/lib/db'

async function sendTelegramMessage(text: string): Promise<void> {
  const url = 'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendMessage'
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: text,
    }),
  })
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!secret || authHeader !== 'Bearer ' + secret) {
    return Response.json({ ok: false }, { status: 401 })
  }

  const users = await prisma.user.findMany()
  let userCount = 0

  for (const user of users) {
    const prompt = 'Daily nutrition coaching check-in: ' + user.name + ', how do you plan to eat today?'
    const reply = await generate(prompt)
    await sendTelegramMessage(reply)
    userCount++
  }

  return Response.json({ ok: true, sent: userCount })
}