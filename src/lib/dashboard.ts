import { prisma } from '@/lib/db'
import { startOfToday } from '@/lib/time'

// Sessionless cores for the read paths, following the phase-1d pattern: the
// server action supplies the session, the route handler supplies a bearer,
// and both call the same query with an explicit userId.

export async function getTodayForUser(userId: string) {
  const startOfDay = startOfToday(new Date())

  const [meals, target] = await Promise.all([
    prisma.mealEntry.findMany({
      where: { userId, confirmed: true, loggedAt: { gte: startOfDay } },
      orderBy: { loggedAt: 'desc' },
    }),
    prisma.dailyTarget.findUnique({ where: { userId } }),
  ])

  const consumed = meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + meal.totalCalories,
      protein: acc.protein + meal.totalProtein,
    }),
    { calories: 0, protein: 0 }
  )

  return {
    // foodItems stays a JSON string here because that is what the web
    // dashboard consumes today; the API route parses it for native clients.
    meals: meals.map((m) => ({
      id: m.id,
      foodItems: m.foodItems,
      totalCalories: m.totalCalories,
      totalProtein: m.totalProtein,
      photoUrl: m.photoUrl,
      loggedAt: m.loggedAt,
      source: m.source,
    })),
    target: target ? { calories: target.calories, protein: target.protein } : null,
    consumed,
  }
}

export async function getChatHistoryForUser(userId: string, take = 20) {
  const messages = await prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
  })

  // Newest-first from the database, reversed to chronological for display.
  return messages.reverse().map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
  }))
}

export type FoodItem = { name: string; portion: string; calories: number; protein: number }

/**
 * Parses the JSON-string foodItems column for API consumers.
 *
 * Returns [] rather than throwing on malformed rows: a single bad row must not
 * fail the whole day's response, the same tolerance `lenientArray` applies in
 * src/lib/extraction.ts.
 */
export function parseFoodItems(raw: string): FoodItem[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
