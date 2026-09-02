import { prisma } from '@/lib/db'
import { generate } from '@/lib/llm'
import { startOfWeek } from '@/lib/time'

// The weekly review. Four questions, answered in the user's own words.
//
// Deliberately no numbers: the product's premise is that label calories are
// legally imprecise and absorption is individual, so a computed verdict would
// reintroduce the false precision it rejects. The person judges; the coach asks
// why.

export const CHECKIN_FIELDS = ['body', 'strength', 'sleep', 'mood'] as const
export type CheckInField = (typeof CHECKIN_FIELDS)[number]

export const QUESTIONS: Record<CheckInField, string> = {
  body: 'Looking back on the week — do you feel fatter, thinner, or about the same?',
  strength: 'And stronger, weaker, or about the same?',
  sleep: 'How have you been sleeping?',
  mood: 'How are you feeling in yourself?',
}

// Long enough for a real answer, short enough that a runaway paste cannot
// bloat the row. Matches the 200-char receipts habit, with more headroom
// because this IS the content rather than a provenance note.
const MAX_SOURCE_TEXT = 2000

type CheckInRow = {
  [K in CheckInField as `${K}Answer`]: string | null
} & {
  [K in CheckInField as `${K}SourceText`]: string | null
} & { weekOf: Date; completedAt: Date | null }

export function nextUnansweredField(checkIn: Pick<CheckInRow, `${CheckInField}Answer`>) {
  return CHECKIN_FIELDS.find((field) => !checkIn[`${field}Answer`]) ?? null
}

export function buildAnswerPrompt(field: CheckInField, userText: string): string {
  return (
    `The user was asked: "${QUESTIONS[field]}"\n` +
    `They replied: "${userText}"\n\n` +
    'Summarise their answer as a short phrase in their own terms — a few words, ' +
    'lower case, no punctuation at the end. Examples: "about the same", ' +
    '"a bit leaner", "sleeping worse", "flat but steady".\n' +
    'Never invent a direction they did not express: if the reply is ambiguous, ' +
    'say "unclear". Reply with the phrase only.'
  )
}

/**
 * Prompt for the coach's reply after an answer lands.
 *
 * The product asks *why*, not just what — a direction with no reason behind it
 * is the same empty datum as a calorie count. The reply acknowledges, probes
 * once, and then moves the review along.
 */
export function buildProbePrompt(
  field: CheckInField,
  userText: string,
  nextField: CheckInField | null
): string {
  const closing = nextField
    ? `Then ask, in the same message: "${QUESTIONS[nextField]}"`
    : 'Then tell them that is the whole check-in and you will ask again next week.'

  return (
    'You are a friendly weekly check-in coach. ' +
    `The user was asked: "${QUESTIONS[field]}" and replied: "${userText}".\n\n` +
    'Briefly acknowledge what they said, then ask ONE short question about why ' +
    'they think that is — you are curious about the cause, not collecting numbers. ' +
    'Never ask them to count or weigh anything.\n' +
    closing +
    '\nPlain conversational text only — no markdown, no bullet lists. Two or three ' +
    'sentences total. Reply with the message only.'
  )
}

export async function getOrCreateCheckIn(userId: string, now: Date = new Date()) {
  const weekOf = startOfWeek(now)

  // An empty update makes this a find-or-create: a second call in the same
  // week must never clobber answers already recorded.
  return prisma.weeklyCheckIn.upsert({
    where: { userId_weekOf: { userId, weekOf } },
    create: { userId, weekOf },
    update: {},
  })
}

export async function recordAnswer(
  userId: string,
  field: CheckInField,
  userText: string,
  now: Date = new Date()
) {
  const checkIn = await getOrCreateCheckIn(userId, now)
  const sourceText = userText.slice(0, MAX_SOURCE_TEXT)

  // The verbatim words are the honest part of this record. If the summariser
  // fails, keep them and use them as the answer rather than losing the row.
  let answer = sourceText
  try {
    const summary = await generate(buildAnswerPrompt(field, sourceText))
    const trimmed = summary.trim()
    if (trimmed) answer = trimmed
  } catch (error) {
    console.error(
      'checkin summary failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
  }

  const answered = { ...checkIn, [`${field}Answer`]: answer }
  const isComplete = nextUnansweredField(answered) === null

  return prisma.weeklyCheckIn.update({
    where: { userId_weekOf: { userId, weekOf: checkIn.weekOf } },
    data: {
      [`${field}Answer`]: answer,
      [`${field}SourceText`]: sourceText,
      ...(isComplete ? { completedAt: now } : {}),
    },
  })
}

export async function listCheckIns(userId: string, take = 12) {
  return prisma.weeklyCheckIn.findMany({
    where: { userId },
    orderBy: { weekOf: 'desc' },
    take,
  })
}
