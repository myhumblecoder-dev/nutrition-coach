import { prisma } from '@/lib/db'
import { fatQualityLabel, wholeFoodFatShare, type FatBearing } from '@/lib/fat'
import { startOfToday, startOfWeek, toCalendarDate } from '@/lib/time'

const DAY_MS = 24 * 60 * 60 * 1000
import { caffeineStatus } from '@/lib/caffeine'
import { ensureOpeningMessage, OPENING_MESSAGE } from '@/lib/onboarding'
import { zoneFor } from '@/lib/userZone'

// Sessionless cores for the read paths, following the phase-1d pattern: the
// server action supplies the session, the route handler supplies a bearer,
// and both call the same query with an explicit userId.

export async function getTodayForUser(userId: string, timeZone?: string) {
  const startOfDay = startOfToday(new Date(), timeZone ?? (await zoneFor(userId)))

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
      // Coalesced: the column is non-null with a default, but a caller that
      // selected columns without it would otherwise turn the whole day's fat
      // into NaN and render an empty ring with no error anywhere.
      fat: acc.fat + (meal.totalFat ?? 0),
    }),
    { calories: 0, protein: 0, fat: 0 }
  )

  // Per item, not per meal: a meal's fat can come from both sides at once —
  // salad with olive oil and croutons — and only the items know which.
  const share = wholeFoodFatShare(meals.flatMap((meal) => fatBearingItems(meal.foodItems)))

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
    // No fat target, by decision: fat guidance is a range, and this app is for
    // logging rather than auditing. The ring draws full and says its quality
    // through colour, with the label carrying the same reading for anyone who
    // cannot separate green from yellow.
    fatQuality: { wholeFoodShare: share, label: fatQualityLabel(share) },
  }
}

/**
 * One day's conversation.
 *
 * The chat opens fresh each morning rather than as an endless scroll: a day's
 * talking is a day's log, which is the premise the whole product rests on, and
 * yesterday's breakfast on screen above today's is noise. Past days are read
 * by passing `date` — the history screen asks for them one at a time.
 *
 * Scoped to the user's own day, so a London account turns over at London
 * midnight rather than the server's.
 */
export async function getChatHistoryForUser(
  userId: string,
  options: {
    date?: string
    take?: number
    /**
     * Ignore the day boundary and just return the most recent messages.
     *
     * The web chat has no history screen yet, so day-scoping it would silently
     * take past conversations away on a surface that has no way to get back to
     * them. It opts out until it grows one.
     */
    recent?: boolean
  } = {}
) {
  // A new account opens to an empty conversation and no targets, so there is
  // nothing to mirror on Today and nothing to read here. The coach starts,
  // rather than the app opening a form. Seeded on the read path so both
  // clients get it without either knowing about onboarding.
  await ensureOpeningMessage(userId)

  const timeZone = await zoneFor(userId)
  const { gte, lt } = options.recent ? {} as { gte?: Date; lt?: Date } : dayBounds(options.date, timeZone)

  const messages = await prisma.chatMessage.findMany({
    where: {
      userId,
      // Bounded at both ends when a specific day is asked for: without the
      // upper bound, "the 8th" would return the 8th and everything since.
      ...(gte ? { createdAt: lt ? { gte, lt } : { gte } } : {}),
    },
    // id as a tiebreak: rows written before exchanges carried explicit
    // timestamps can still share a millisecond, and cuid is time-prefixed, so
    // it orders those consistently instead of arbitrarily.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.take ?? 200,
  })

  return messages.reverse()
}

/**
 * Which days this account has a conversation on, newest first.
 *
 * Grouped in the user's own zone, not by raw timestamp. 23:30 UTC on the 8th
 * is already the 9th in London, and filing it under the 8th would make the
 * history list disagree with the chat page it links to.
 */
export async function getChatDaysForUser(
  userId: string
): Promise<{ date: string; messageCount: number }[]> {
  const timeZone = await zoneFor(userId)

  // Bounded to a year. Unbounded, this scanned every message the account had
  // ever written, on every open of the history screen, growing for as long as
  // someone kept using the app.
  const messages = await prisma.chatMessage.findMany({
    where: { userId, createdAt: { gte: new Date(Date.now() - 365 * DAY_MS) } },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  const counts = new Map<string, number>()
  for (const message of messages) {
    const day = toCalendarDate(message.createdAt, timeZone)
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }

  return [...counts.entries()].map(([date, messageCount]) => ({ date, messageCount }))
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
 * The instant a day begins and the instant the next one does.
 *
 * `lt` is undefined for today, so the query stays open-ended and a message
 * written while the screen is open still appears.
 */
function dayBounds(date: string | undefined, timeZone: string): { gte: Date; lt?: Date } {
  if (!date) return { gte: startOfToday(new Date(), timeZone) }

  // Noon UTC is only a starting guess. It lands on the right local date for
  // most of the world, but at UTC+12 and beyond — Auckland, Fiji, Kiritimati —
  // 12:00Z is already tomorrow, so asking for the 8th would return the 9th.
  // Nudge a day at a time until the local calendar date is the one asked for.
  let candidate = new Date(`${date}T12:00:00.000Z`)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = toCalendarDate(candidate, timeZone)
    if (local === date) break
    candidate = new Date(candidate.getTime() + (local < date ? 1 : -1) * DAY_MS)
  }

  const gte = startOfToday(candidate, timeZone)

  // The next local midnight, not gte + 24h. A fall-back day is 25 hours and
  // would lose its last hour; a spring-forward day is 23 and would bleed the
  // next day's first hour in — the exact bleed this bound exists to stop.
  // 36 hours always lands inside the following day, whichever way the clocks
  // went, and startOfToday walks it back to that day's midnight.
  return { gte, lt: startOfToday(new Date(gte.getTime() + 36 * 60 * 60 * 1000), timeZone) }
}

export async function getWeekForUser(userId: string, timeZone?: string) {
  const now = new Date()
  const weekStart = startOfWeek(now)
  const today = startOfToday(now, timeZone ?? (await zoneFor(userId)))
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
export async function getActivityForUser(
  userId: string,
  timeZone?: string
): Promise<ActivityRow[]> {
  const since = startOfToday(new Date(), timeZone ?? (await zoneFor(userId)))
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
    // The lifts, when they were named: "resistance · 45 min" says nothing a
    // week later, and the receipts feed exists to show what was actually said.
    const lifts = describeExercises(row.exercises)
    if (lifts) label += ` · ${lifts}`
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

/**
 * The coach's most recent line, for the strip above the receipts feed.
 *
 * Returns null when that line is still the onboarding question and the user
 * already has targets. Setting them in Settings writes no chat message, so the
 * opening question stayed the newest thing the coach had said — leaving Today
 * showing working rings above a strip still asking for the numbers they are
 * built from.
 */
export async function getCoachMessageForUser(userId: string): Promise<string | null> {
  const last = await prisma.chatMessage.findFirst({
    where: { userId, role: 'assistant' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  if (!last) return null

  if (last.content === OPENING_MESSAGE) {
    const target = await prisma.dailyTarget.findUnique({ where: { userId } })
    if (target) return null
  }

  return last.content
}

export type Exercise = { name: string; sets?: number; reps?: number; weightLb?: number }

/** Parses the JSON exercises column, tolerating a malformed row like parseFoodItems. */
export function parseExercises(raw: string | null): Exercise[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * "squat 3x8 @ 185, row 3x10" — how a person would write it down.
 *
 * Each part is omitted when it is unknown rather than shown as zero: a lift
 * logged without a weight was still done, and "@ 0" would be a claim.
 */
export function describeExercises(raw: string | null): string {
  return parseExercises(raw)
    .map((e) => {
      let text = e.name
      if (e.sets && e.reps) text += ` ${e.sets}x${e.reps}`
      else if (e.reps) text += ` x${e.reps}`
      if (e.weightLb) text += ` @ ${e.weightLb}`
      return text
    })
    .join(', ')
}


/**
 * Pulls the fat-bearing items out of a meal's stored `foodItems` JSON.
 *
 * Tolerant on purpose. That column is a JSON string written by several
 * generations of prompt, so rows predate fat entirely and a malformed one must
 * cost a ring its colour rather than fail the whole dashboard.
 */
function fatBearingItems(foodItems: string): FatBearing[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(foodItems)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []
    const { fat, fatSource } = item as { fat?: unknown; fatSource?: unknown }
    if (typeof fat !== 'number' || !Number.isFinite(fat) || fat <= 0) return []

    return [
      {
        fat,
        fatSource: fatSource === 'whole' || fatSource === 'refined' ? fatSource : null,
      },
    ]
  })
}
