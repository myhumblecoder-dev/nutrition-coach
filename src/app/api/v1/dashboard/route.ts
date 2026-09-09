import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import {
  getTodayForUser,
  getWeekForUser,
  getActivityForUser,
  getCoachMessageForUser,
  parseFoodItems,
} from '@/lib/dashboard'
import { ensureOpeningMessage } from '@/lib/onboarding'
import { zoneFor } from '@/lib/userZone'

// Everything the Today screen renders, in one request.
//
// The web assembles this from four server actions in a Promise.all, which is
// free in a server component. A phone paying four round trips over a mobile
// network is not the same thing, and a dashboard that arrives in pieces shows
// four separate loading states.
export async function GET(request: Request) {
  const { blocked } = await requireAttestation(request)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Seeded here as well as on the chat read: a new user lands on Today, not
  // Chat, so the coach's opening question has to exist before Today asks for
  // it. Idempotent — it fires once per account, whichever screen gets there
  // first.
  await ensureOpeningMessage(user.id)

  // Resolved once for the whole screen: three lookups of the same value on the
  // main screen load would be pure waste, and the sections must agree about
  // when today started anyway.
  const timeZone = await zoneFor(user.id)

  const [today, week, activity, coachMessage] = await Promise.all([
    getTodayForUser(user.id, timeZone),
    getWeekForUser(user.id, timeZone),
    getActivityForUser(user.id, timeZone),
    getCoachMessageForUser(user.id),
  ])

  return Response.json({
    today: {
      // Structured for a native client rather than the JSON string the web
      // dashboard decodes itself.
      meals: today.meals.map((m) => ({
        id: m.id,
        foodItems: parseFoodItems(m.foodItems),
        totalCalories: m.totalCalories,
        totalProtein: m.totalProtein,
        photoUrl: m.photoUrl || null,
        loggedAt: m.loggedAt.toISOString(),
        source: m.source,
      })),
      target: today.target,
      consumed: today.consumed,
    },
    week: {
      training: week.training,
      recovery: week.recovery,
      streak: week.streak,
      weights: week.weights.map((w) => ({ at: w.at.toISOString(), weightLb: w.weightLb })),
      mood: week.mood,
      measurement: week.measurement,
    },
    // sourceText is the receipt — the words that produced the row. It is the
    // evidence for the claim that every number came from the conversation, so
    // it travels even when empty rather than being dropped.
    activity: activity.map((a) => ({
      id: a.id,
      at: a.at.toISOString(),
      sourceText: a.sourceText,
      source: a.source,
      kind: a.kind,
      label: a.label,
      photoUrl: a.photoUrl,
    })),
    coachMessage,
  })
}
