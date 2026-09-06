import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { getTodayForUser, parseFoodItems } from '@/lib/dashboard'

export async function GET(request: Request) {
  const { blocked } = await requireAttestation(request)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const today = await getTodayForUser(user.id)

  return Response.json({
    // foodItems is parsed here rather than passed through as a JSON string:
    // a native client should receive structured fields, not a string it has
    // to decode a second time.
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
  })
}
