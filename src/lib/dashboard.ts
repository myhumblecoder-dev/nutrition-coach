import { prisma } from '@/lib/db'
import { startOfToday, startOfWeek } from '@/lib/time'
import { caffeineStatus } from '@/lib/caffeine'
import { ensureOpeningMessage } from '@/lib/onboarding'

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
  // A new account opens to an empty conversation and no targets, so there is
  // nothing to mirror on Today and nothing to read here. The coach starts,
  // rather than the app opening a form. Seeded on the read path so both
  // clients get it without either knowing about onboarding.
  await ensureOpeningMessage(userId)

  const messages = await prisma.chatMessage.findMany({
    where: { userId },
    // id as a tiebreak: rows written before exchanges carried explicit
    // timestamps can still share a millisecond, and cuid is time-prefixed, so
    // it orders those consistently instead of arbitrarily.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

/**
 * The week's training, recovery, mood, measurements and logging streak.
 *
 * Lifted out of `getWeek()` unchanged so the native client reads exactly what
 * the web dashboard reads. Two implementations of "what did this week look
 * like" would drift, and the whole point of the iOS Today screen is that it
 * mirrors the web one.
 */
export async function getWeekForUser(userId: string) {
  const now = new Date()
  const weekStart = startOfWeek(now)
  const today = startOfToday(now)
  const streakStart = new Date(today.getTime() - 6 * 86400000)

  const [trainingEntries, recoveryEntries, moodEntry, measurementRow, streakMeals, weightRows] =
    await Promise.all([
      prisma.trainingEntry.findMany({ where: { userId, loggedAt: { gte: weekStart } } }),
      prisma.recoveryEntry.findMany({ where: { userId, loggedAt: { gte: today } } }),
      prisma.moodEntry.findFirst({
        where: { userId, loggedAt: { gte: today } },
        orderBy: { loggedAt: 'desc' },
      }),
      prisma.measurement.findFirst({ where: { userId }, orderBy: { measuredAt: 'desc' } }),
      prisma.mealEntry.findMany({
        where: { userId, confirmed: true, loggedAt: { gte: streakStart } },
      }),
      prisma.measurement.findMany({
        where: { userId, weightLb: { not: null } },
        orderBy: { measuredAt: 'desc' },
        take: 30,
      }),
    ])

  // Bucket by whole local days since an anchor midnight (0–6, clamped).
  const dayIndex = (at: Date, anchor: Date) =>
    Math.min(6, Math.max(0, Math.floor((at.getTime() - anchor.getTime()) / 86400000)))

  const daysFor = (kind: string) => {
    const days = [false, false, false, false, false, false, false]
    for (const e of trainingEntries.filter((t) => t.kind === kind)) {
      days[dayIndex(e.loggedAt, weekStart)] = true
    }
    return days
  }

  const streak = [false, false, false, false, false, false, false]
  for (const m of streakMeals) {
    streak[dayIndex(m.loggedAt, streakStart)] = true
  }

  const training = {
    resistance: trainingEntries.filter((e) => e.kind === 'resistance').length,
    hiit: trainingEntries.filter((e) => e.kind === 'hiit').length,
    core: trainingEntries.filter((e) => e.kind === 'core').length,
    stepsToday: trainingEntries
      .filter((e) => e.kind === 'neat' && e.loggedAt >= today)
      .reduce((sum, e) => sum + (e.steps ?? 0), 0),
    days: { resistance: daysFor('resistance'), hiit: daysFor('hiit'), core: daysFor('core') },
  }

  // Each caffeine row is a dose with its own timestamp: the level still in the
  // user's system depends on WHEN it was drunk, not just how much.
  const caffeineDoses = recoveryEntries
    .filter((e) => e.kind === 'caffeine')
    .map((e) => ({ mg: e.value, at: e.loggedAt }))

  const recovery = {
    sleepHours: recoveryEntries.find((e) => e.kind === 'sleep')?.value ?? null,
    waterLiters: recoveryEntries.find((e) => e.kind === 'water')?.value ?? null,
    caffeine: caffeineDoses.length > 0 ? caffeineStatus(caffeineDoses, new Date()) : null,
  }

  return {
    training,
    recovery,
    streak,
    weights: weightRows
      .slice()
      .reverse()
      .map((w) => ({ at: w.measuredAt, weightLb: w.weightLb as number })),
    mood: moodEntry ? { score: moodEntry.score, note: moodEntry.note ?? null } : null,
    measurement: measurementRow
      ? { weightLb: measurementRow.weightLb ?? null, waistIn: measurementRow.waistIn ?? null }
      : null,
  }
}

type ActivityRow = {
  id: string
  at: Date
  sourceText: string
  source: string
  kind: string
  label: string
  photoUrl: string | null
}

/**
 * Today's receipts: what the user said, and what the coach logged from it.
 *
 * This is the evidence for the product's central claim — that every number on
 * the dashboard traces back to something you told the coach — so `sourceText`
 * travels with every row rather than only the derived label.
 *
 * Lifted out of `getActivity()` unchanged, for the same reason as the week.
 */
export async function getActivityForUser(userId: string): Promise<ActivityRow[]> {
  const since = startOfToday(new Date())
  const window = { userId, loggedAt: { gte: since } }

  const [meals, trainings, recoveries, moods, measurements] = await Promise.all([
    prisma.mealEntry.findMany({
      where: { userId, confirmed: true, loggedAt: { gte: since } },
      orderBy: { loggedAt: 'desc' },
      take: 5,
    }),
    prisma.trainingEntry.findMany({ where: window, orderBy: { loggedAt: 'desc' }, take: 5 }),
    prisma.recoveryEntry.findMany({ where: window, orderBy: { loggedAt: 'desc' }, take: 5 }),
    prisma.moodEntry.findMany({ where: window, orderBy: { loggedAt: 'desc' }, take: 5 }),
    prisma.measurement.findMany({
      where: { userId, measuredAt: { gte: since } },
      orderBy: { measuredAt: 'desc' },
      take: 5,
    }),
  ])

  const mappedMeals = meals.map((row) => {
    const items = parseFoodItems(row.foodItems)
    const names = items.length > 0 ? items.map((i) => i.name).join(', ') : 'Meal'
    return {
      id: row.id,
      at: row.loggedAt,
      sourceText: row.sourceText || '',
      source: row.source,
      kind: 'meal',
      label: `${names} · ${row.totalCalories} kcal · ${row.totalProtein}g`,
      photoUrl: row.photoUrl && row.photoUrl.length > 0 ? row.photoUrl : null,
    }
  })

  const mappedTrainings = trainings.map((row) => {
    let label = row.kind
    if (row.minutes) label += ` · ${row.minutes} min`
    if (row.steps) label += ` · ${row.steps} steps`
    return {
      id: row.id,
      at: row.loggedAt,
      sourceText: row.sourceText || '',
      source: row.source,
      kind: 'training',
      label,
      photoUrl: null,
    }
  })

  const mappedRecoveries = recoveries.map((row) => ({
    id: row.id,
    at: row.loggedAt,
    sourceText: row.sourceText || '',
    source: row.source,
    kind: 'recovery',
    label: `${row.kind} ${row.value}`,
    photoUrl: null,
  }))

  const mappedMoods = moods.map((row) => ({
    id: row.id,
    at: row.loggedAt,
    sourceText: row.sourceText || '',
    source: row.source,
    kind: 'mood',
    label: `mood ${row.score}/5`,
    photoUrl: null,
  }))

  const mappedMeasurements = measurements.map((row) => {
    const parts: string[] = []
    if (row.weightLb) parts.push(`${row.weightLb} lb`)
    if (row.waistIn) parts.push(`${row.waistIn} in waist`)
    return {
      id: row.id,
      at: row.measuredAt,
      sourceText: row.sourceText || '',
      source: row.source,
      kind: 'measurement',
      label: parts.join(' · '),
      photoUrl: null,
    }
  })

  return [
    ...mappedMeals,
    ...mappedTrainings,
    ...mappedRecoveries,
    ...mappedMoods,
    ...mappedMeasurements,
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8)
}

/** The coach's most recent line, for the strip above the receipts feed. */
export async function getCoachMessageForUser(userId: string): Promise<string | null> {
  const last = await prisma.chatMessage.findFirst({
    where: { userId, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
  })
  return last?.content ?? null
}
