import { z } from 'zod'
import { toCalendarDate } from '@/lib/time'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { generate } from '@/lib/llm'
import {
  QUESTIONS,
  buildProbePrompt,
  getOrCreateCheckIn,
  listCheckIns,
  nextUnansweredField,
  recordAnswer,
} from '@/lib/checkin'

// One LLM call to summarise the answer and one to compose the reply.
export const maxDuration = 60

const bodySchema = z.object({ message: z.string().trim().min(1).max(2000) })

export async function GET(request: Request) {
  const { blocked } = await requireAttestation(request)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [current, history] = await Promise.all([
    getOrCreateCheckIn(user.id),
    listCheckIns(user.id),
  ])

  const pending = nextUnansweredField(current)

  return Response.json({
    current: {
      weekOf: toCalendarDate(current.weekOf),
      complete: pending === null,
      nextField: pending,
      nextQuestion: pending ? QUESTIONS[pending] : null,
    },
    // History carries the verbatim words, not just the summaries: the review
    // screen shows the user what they actually said, week over week.
    history: history.map((row) => ({
      weekOf: toCalendarDate(row.weekOf),
      complete: row.completedAt !== null,
      body: { answer: row.bodyAnswer, said: row.bodySourceText },
      strength: { answer: row.strengthAnswer, said: row.strengthSourceText },
      sleep: { answer: row.sleepAnswer, said: row.sleepSourceText },
      mood: { answer: row.moodAnswer, said: row.moodSourceText },
    })),
  })
}

export async function POST(request: Request) {
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

  const current = await getOrCreateCheckIn(user.id)
  const field = nextUnansweredField(current)

  if (!field) {
    // Already done for this week. Say so rather than silently discarding what
    // they just typed.
    return Response.json({ complete: true, recorded: null, reply: null, nextQuestion: null })
  }

  const updated = await recordAnswer(user.id, field, message)
  const nextField = nextUnansweredField(updated)

  let reply: string | null = null
  try {
    reply = (await generate(buildProbePrompt(field, message, nextField))).trim()
  } catch (error) {
    // The answer is already saved. A failed reply degrades the conversation,
    // it must not lose the record.
    console.error(error instanceof Error ? error.message : 'Unknown error')
  }

  return Response.json({
    complete: nextField === null,
    recorded: { field, answer: updated[`${field}Answer`] },
    reply,
    nextQuestion: nextField ? QUESTIONS[nextField] : null,
  })
}
