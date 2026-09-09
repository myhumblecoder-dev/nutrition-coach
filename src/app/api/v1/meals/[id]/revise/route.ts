import { z } from 'zod'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { analyzeMeal } from '@/lib/analyzeMeal'
import { getPendingMeal, updatePendingMealAnalysis } from '@/lib/meals'
import { UsageLimitError } from '@/lib/limits'

// Another vision call, so the same budget as the photo route it corrects.
export const maxDuration = 60

const bodySchema = z.object({ correction: z.string().trim().min(1).max(1000) })

type Context = { params: Promise<{ id: string }> }

/**
 * Re-reads a pending meal's photo in light of something the user said about it.
 *
 * "That's chicken, not turkey" is a better correction than nudging a number,
 * because it fixes the reason the estimate was wrong rather than the symptom —
 * and this app's whole premise is that the conversation is the input.
 *
 * The words accumulate rather than replace: a correction on its own loses what
 * the food is, and the model needs both halves.
 */
export async function POST(request: Request, { params }: Context) {
  const raw = await request.text()
  const { blocked } = await requireAttestation(request, raw)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let correction: string
  try {
    correction = bodySchema.parse(JSON.parse(raw)).correction
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { id } = await params

  // Read before spending anything: correcting a meal that was confirmed or
  // discarded on another device should cost nothing.
  const meal = await getPendingMeal(user.id, id)
  if (!meal) {
    return Response.json({ error: "That meal's no longer pending." }, { status: 404 })
  }

  const said = [meal.sourceText, correction].filter(Boolean).join('. ')

  let analysis
  try {
    analysis = await analyzeMeal(user.id, meal.photoUrl, said)
  } catch (error) {
    console.error(error)
    if (error instanceof UsageLimitError) {
      return Response.json({ error: error.userMessage }, { status: 429 })
    }
    return Response.json(
      { error: "I couldn't make sense of that one — try telling me another way." },
      { status: 422 }
    )
  }

  if (!(await updatePendingMealAnalysis(user.id, id, analysis, said))) {
    return Response.json({ error: "That meal's no longer pending." }, { status: 404 })
  }

  return Response.json({
    mealId: id,
    photoUrl: meal.photoUrl,
    foodItems: analysis.foodItems,
    totalCalories: analysis.totalCalories,
    totalProtein: analysis.totalProtein,
  })
}
