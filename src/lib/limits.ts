import { prisma } from '@/lib/db'
import { startOfToday } from '@/lib/time'

// Model calls are the app's only real marginal cost, so they are counted
// directly rather than inferred from whatever rows they happen to leave
// behind. A chat reply costs two calls and the vision path costs one, but
// photo analysis writes no row at all unless the user confirms the meal — so
// counting MealEntry would have missed the abuse that matters: analyse
// repeatedly, never save.

export type UsageKind = 'chat' | 'vision'

// Sized against real use, then costed. On Haiku 4.5 ($1/$5 per MTok) a chat
// exchange is ~$0.0029 (it is two calls — the reply and the extraction pass)
// and a photo ~$0.0038 (~2.5k image tokens after Anthropic's downsize). A
// heavy real day is maybe 25 messages and 10 photos, so these sit at roughly
// 2-4x genuine use and cap one saturated account near $10/month.
//
// The cap is not the cost control of last resort — it is there so a runaway
// client or a curious stranger cannot run up a bill unnoticed. Someone using
// the app hard should never meet it.
const DEFAULTS: Record<UsageKind, number> = {
  chat: 60,
  // Vision is the pricier call per unit, but a day of eating is a handful of
  // photos, so the ceiling can still sit well above honest use.
  vision: 40,
}

const ENV_VARS: Record<UsageKind, string> = {
  chat: 'DAILY_MESSAGE_LIMIT',
  vision: 'DAILY_PHOTO_LIMIT',
}

/** Thrown by a gated path. Carries copy the caller can show the user as-is. */
export class UsageLimitError extends Error {
  readonly userMessage: string

  constructor(userMessage: string) {
    super('Usage limit reached')
    this.name = 'UsageLimitError'
    this.userMessage = userMessage
  }
}

export function dailyLimit(kind: UsageKind): number {
  const raw = Number(process.env[ENV_VARS[kind]])
  // A malformed value must not read as "unlimited" — that is precisely the
  // failure this limit exists to prevent.
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULTS[kind]
}

/** Kept for the message cap's original name. */
export function dailyMessageLimit(): number {
  return dailyLimit('chat')
}

export async function isOverLimit(
  userId: string,
  kind: UsageKind = 'chat',
  now: Date = new Date()
): Promise<boolean> {
  const count = await prisma.usageEvent.count({
    where: { userId, kind, createdAt: { gte: startOfToday(now) } },
  })
  return count >= dailyLimit(kind)
}

/**
 * Records one billable call.
 *
 * Never throws: a failed bookkeeping write must not fail the request the user
 * is actually making. The worst case is undercounting, which is the safe
 * direction for the person and the visible one for us in the logs.
 */
export async function recordUsage(userId: string, kind: UsageKind): Promise<void> {
  try {
    await prisma.usageEvent.create({ data: { userId, kind } })
  } catch (error) {
    console.error(
      'usage record failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
  }
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

export function photoLimitMessage(successes: string | null): string {
  const opening = "Easy with the camera, hon. That's enough photos for today — bring me more tomorrow."
  return successes ? `${opening} You got down ${successes}.` : opening
}
