import { prisma } from '@/lib/db'
import { startOfToday } from '@/lib/time'

// Every coach reply costs two model calls — the reply and the extraction pass
// — so an unbounded chat is an unbounded bill. The cap is per user per day,
// generous enough that ordinary use never sees it.

const DEFAULT_DAILY_MESSAGE_LIMIT = 40

export function dailyMessageLimit(): number {
  const raw = Number(process.env.DAILY_MESSAGE_LIMIT)
  // A malformed value must not read as "unlimited" — that is precisely the
  // failure this limit exists to prevent.
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_MESSAGE_LIMIT
}

export async function isOverLimit(userId: string, now: Date = new Date()): Promise<boolean> {
  const count = await prisma.chatMessage.count({
    where: { userId, role: 'user', createdAt: { gte: startOfToday(now) } },
  })
  return count >= dailyMessageLimit()
}

const TRAINING_WORDS: Record<string, string> = {
  resistance: 'a lift',
  hiit: 'some conditioning',
  core: 'core work',
  neat: 'a walk',
}

/**
 * What the user actually got down today, in plain language.
 *
 * Built by hand rather than generated: spending a model call to explain that
 * you have run out of model calls would be absurd. Returns null when there is
 * nothing to report, so the caller can stay quiet instead of saying "nothing".
 */
export async function todaySuccesses(userId: string, now: Date = new Date()): Promise<string | null> {
  const since = startOfToday(now)
  const scope = { userId, loggedAt: { gte: since } }

  const [meals, training, recovery, mood, measurement] = await Promise.all([
    prisma.mealEntry.count({ where: { ...scope, confirmed: true } }),
    prisma.trainingEntry.findMany({ where: scope }),
    prisma.recoveryEntry.findMany({ where: scope }),
    prisma.moodEntry.count({ where: scope }),
    prisma.measurement.count({ where: { userId, measuredAt: { gte: since } } }),
  ])

  const parts: string[] = []

  if (meals > 0) parts.push(`${meals} meal${meals === 1 ? '' : 's'}`)

  const kinds = [...new Set(training.map((t) => t.kind))]
    .map((kind) => TRAINING_WORDS[kind])
    .filter(Boolean)
  parts.push(...kinds)

  const sleep = recovery.find((r) => r.kind === 'sleep')
  if (sleep) parts.push(`${sleep.value} hours of sleep`)

  const water = recovery.find((r) => r.kind === 'water')
  if (water) parts.push(`${water.value}L of water`)

  if (mood > 0) parts.push('how you were feeling')
  if (measurement > 0) parts.push('your weigh-in')

  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]

  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function limitMessage(successes: string | null): string {
  const opening = "This isn't a therapy app, hon. That's your lot for today — we can talk more tomorrow."
  // No successes means say nothing about it. Tacking "you logged nothing" onto
  // a refusal is the shaming this product exists to avoid.
  return successes ? `${opening} For what it's worth, you got down ${successes}.` : opening
}
