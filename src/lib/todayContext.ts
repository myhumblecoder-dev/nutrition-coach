/**
 * The day-shaped lines in the coach's prompt.
 *
 * Only what changes turn to turn belongs here. Long-run patterns — weight
 * direction, week-over-week, sleep averages — are computed weekly and carried
 * separately, because re-deriving them from raw rows on every message would
 * cost tokens *and* ask the model to do arithmetic, which is how a health app
 * ends up stating a confidently wrong trend.
 *
 * Every function returns '' rather than a placeholder when it has nothing to
 * say. An empty string drops out of the prompt; "no mood logged" would be a
 * line of noise in every conversation of every user who never logs mood.
 */

/** How many food items ride in the prompt before the rest are summarised. */
const MAX_ITEMS = 8
/** Longest a single check-in answer may be. */
const MAX_ANSWER = 60

type MealRow = { foodItems: string; loggedAt: Date }

/**
 * What was eaten and when.
 *
 * The names were already being fetched and then discarded, so a meal logged by
 * photo with no caption was invisible as content: the coach could see the
 * total had moved and had no idea what the food was. It answered questions
 * about "the meals I have logged" from the conversation instead, which looked
 * like database access and was not.
 *
 * The time comes along because it is free here and answers "should I eat now",
 * which totals alone cannot.
 */
export function eatenTodayLine(meals: MealRow[], timeZone: string): string {
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })

  const entries = meals.flatMap((meal) =>
    namesIn(meal.foodItems).map((name) => `${name} (${time.format(meal.loggedAt)})`)
  )

  if (entries.length === 0) return ''

  // Capped because this rides in every turn: a day of twenty logged items must
  // not quietly triple the prompt.
  const shown = entries.slice(0, MAX_ITEMS)
  const hidden = entries.length - shown.length
  const tail = hidden > 0 ? `, and ${hidden} more` : ''

  return `\nEaten today: ${shown.join(', ')}${tail}.\n`
}

/**
 * Sleep and water.
 *
 * Caffeine is deliberately excluded — it is reported elsewhere as a live
 * decaying level, and repeating the raw dose here would have the prompt saying
 * two different things about the same coffee.
 */
export function recoveryLine(rows: Array<{ kind: string; value: number }>): string {
  const units: Record<string, string> = { sleep: 'h sleep', water: 'L water' }

  const bits = rows.flatMap((row) => {
    const unit = units[row.kind]
    return unit ? [`${row.value}${unit}`] : []
  })

  return bits.length > 0 ? `\nLogged today: ${bits.join(', ')}.\n` : ''
}

type CheckInRow = {
  weekOf: Date
  bodyAnswer: string | null
  strengthAnswer: string | null
  sleepAnswer: string | null
  moodAnswer: string | null
}

/**
 * The most recent weekly check-in, in the user's own words.
 *
 * The coach conducted the interview and could not see the answers afterwards,
 * so it asked how the week had gone with no memory of having been told. Its
 * own questions, its own record, and it was blind to it.
 */
export function checkInLine(checkIn: CheckInRow | null): string {
  if (!checkIn) return ''

  const parts: Array<[string, string | null]> = [
    ['body', checkIn.bodyAnswer],
    ['strength', checkIn.strengthAnswer],
    ['sleep', checkIn.sleepAnswer],
    ['mood', checkIn.moodAnswer],
  ]

  const answered = parts.flatMap(([label, answer]) =>
    answer ? [`${label} — "${truncate(answer)}"`] : []
  )

  // A created-but-unanswered check-in says nothing worth a line.
  if (answered.length === 0) return ''

  const week = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(checkIn.weekOf)

  return `\nLast check-in (week of ${week}): ${answered.join('; ')}.\n`
}

export function moodLine(mood: { score: number; note: string | null } | null): string {
  if (!mood) return ''

  const note = mood.note ? ` ("${truncate(mood.note)}")` : ''
  return `\nMood today: ${mood.score}/5${note}.\n`
}

function truncate(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > MAX_ANSWER ? `${trimmed.slice(0, MAX_ANSWER)}…` : trimmed
}

/** Tolerant, like every other reader of this column: several generations of
 * prompt have written it, and a bad row must cost its own name rather than
 * the whole line. */
function namesIn(foodItems: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(foodItems)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []
    const { name } = item as { name?: unknown }
    return typeof name === 'string' && name.trim() !== '' ? [name.trim()] : []
  })
}
