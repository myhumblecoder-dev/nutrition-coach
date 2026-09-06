import { z } from 'zod'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { getChatHistoryForUser } from '@/lib/dashboard'
import { coachReply } from '@/lib/chat'

// coachReply makes an LLM call and then runs extraction, so this needs more
// than the platform default. Matches the Telegram webhook's budget.
export const maxDuration = 60

const bodySchema = z.object({ message: z.string().trim().min(1).max(4000) })

export async function GET(request: Request) {
  const { blocked } = await requireAttestation(request)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const messages = await getChatHistoryForUser(user.id)

  return Response.json({
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  })
}

export async function POST(request: Request) {
  // Read the body once: the assertion is signed over exactly these bytes, and
  // a Request stream cannot be consumed twice.
  const raw = await request.text()
  const { blocked } = await requireAttestation(request, raw)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let message: string
  try {
    message = bodySchema.parse(JSON.parse(raw)).message
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  // coachReply persists both sides of the exchange and runs extraction, so
  // the whole conversational-logging path comes along for free.
  const { assistantReply } = await coachReply(user.id, message)

  return Response.json({ assistantReply })
}
