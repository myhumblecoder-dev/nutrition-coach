import { prisma } from '@/lib/db'
import { startOfToday } from '@/lib/time'
import { isEntitled } from '@/lib/entitlement'
import { zoneFor } from '@/lib/userZone'
import type { TokenUsage } from '@/lib/llm'

// Model calls are the app's only real marginal cost, so they are counted
// directly rather than inferred from whatever rows they happen to leave
// behind. A chat reply costs two calls and the vision path costs one, but
// photo analysis writes no row at all unless the user confirms the meal — so
// counting MealEntry would have missed the abuse that matters: analyse
// repeatedly, never save.

export type UsageKind = 'chat' | 'vision'

// Sized against real use, then costed against what a subscription actually
// earns. On Haiku 4.5 ($1/$5 per MTok) a chat exchange is ~$0.0029 (it is two
// calls — the reply and the extraction pass) and a photo ~$0.0038 (~2.5k image
// tokens after Anthropic's downsize). A heavy real day is maybe 25 messages
// and 10 photos.
//
// These were 60 and 40, which capped a saturated account near $10/month —
// more than the $6.79 that $7.99 nets after Apple's 15%. So one account
// sitting on the caps cost more than it paid. At 40 and 25 the worst case is
// ~$6.33/month, inside the revenue, and still 1.6x and 2.5x a heavy day.
// `limits.test.ts` asserts both halves of that, so this cannot silently drift
// away from the price again.
//
// The cap is not the cost control of last resort — it is there so a runaway
// client or a curious stranger cannot run up a bill unnoticed. Someone using
// the app hard should never meet it.
const DEFAULTS: Record<UsageKind, number> = {
  chat: 30,
  // Vision is the pricier call per unit, but a day of eating is a handful of
  // photos, so the ceiling can still sit well above honest use.
  vision: 15,
}

const ENV_VARS: Record<UsageKind, string> = {
  chat: 'DAILY_MESSAGE_LIMIT',
  vision: 'DAILY_PHOTO_LIMIT',
}

/**
 * Why a request that costs money was refused.
 *
 * The prose is for the user and the reason is for the client: a spent cap and
 * an absent subscription read almost the same to a person, but one is answered
 * by waiting until tomorrow and the other by a paywall. A client cannot tell
 * those apart from a sentence.
 */
export type DenialReason = 'capped' | 'subscription_required'

export type Denial = {
  reason: DenialReason
  userMessage: string
}

/** Thrown by a gated path. Carries copy the caller can show the user as-is. */
export class UsageLimitError extends Error {
  readonly userMessage: string
  readonly reason: DenialReason

  constructor(userMessage: string, reason: DenialReason = 'capped') {
    super('Usage limit reached')
    this.name = 'UsageLimitError'
    this.userMessage = userMessage
    this.reason = reason
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
  now: Date = new Date(),
  /** The user's own day boundary; the app zone when they have not reported one. */
  timeZone?: string | null
): Promise<boolean> {
  const count = await prisma.usageEvent.count({
    where: { userId, kind, createdAt: { gte: startOfToday(now, timeZone) } },
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
export async function recordUsage(userId: string, kind: UsageKind): Promise<string | null> {
  try {
    const event = await prisma.usageEvent.create({ data: { userId, kind } })

    // The id lets `attributeTokens` fill in what the call actually cost once
    // the provider says. Callers that do not care can keep ignoring it.
    return event.id
  } catch (error) {
    console.error(
      'usage record failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
  }

  return null
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
export async function todaySuccesses(
  userId: string,
  now: Date = new Date(),
  timeZone?: string | null
): Promise<string | null> {
  const since = startOfToday(now, timeZone)
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
  // "Witness" rather than "coach" on purpose: it is the one word that names
  // what this product actually claims — every number on Today traces back to
  // something the user said, and the receipts feed is the evidence. Saying it
  // out loud at the moment of refusal is better than apologising.
  const opening =
    "I'm not an armchair therapist, hon — I'm your fitness witness. That's us done for today; come back tomorrow."
  // No successes means say nothing about it. Tacking "you logged nothing" onto
  // a refusal is the shaming this product exists to avoid. And the tail stays
  // dry: the persona says say it once, plainly, and move on — "you did great"
  // is the gushing it explicitly rules out.
  return successes ? `${opening} You got down ${successes}. That'll do.` : opening
}

export function photoLimitMessage(successes: string | null): string {
  const opening =
    "Easy with the camera, hon. I've witnessed plenty for one day — bring me more tomorrow."
  return successes ? `${opening} You got down ${successes}. That'll do.` : opening
}

/**
 * The coach's word when the subscription has run out.
 *
 * Names no price. Apple prices per storefront and the paywall reads the real
 * localised figure from StoreKit — a number hardcoded here would eventually be
 * wrong somewhere, and wrong about money.
 *
 * Says the data is still there because it is: Today, the history and the
 * receipts all keep working. Someone deciding whether to pay should not also
 * be wondering whether they have lost anything.
 */
/**
 * The coach's word when an account has spent its month.
 *
 * Deliberately does not say "tomorrow": the ceiling is a rolling thirty days,
 * so tomorrow is very likely the same answer.
 */
export function monthlyLimitMessage(): string {
  return "You've properly worn me out this month, hon. Everything you've logged is still here — " +
    "I'll pick back up as your last few weeks roll off."
}

export function subscriptionRequiredMessage(): string {
  return "That's me done for now, hon. Everything you've logged is still here to look at — " +
    'but the talking and the photo reading are the parts that cost me money, so those need a subscription.'
}

/**
 * The single gate every paid path goes through.
 *
 * Entitlement first, then the cap: an account that cannot spend at all should
 * not get as far as counting, or a lapsed user could still grow the usage
 * table by hammering a route that was going to refuse them anyway.
 *
 * Lives here rather than in the routes for the same reason the caps do — the
 * web action, the v1 API and the Telegram webhook all land on `chat.ts` and
 * `analyzeMeal.ts`, and Telegram has no route-level auth to hang a check from.
 *
 * Returns null when the request may proceed.
 */
export async function denialFor(
  userId: string,
  kind: UsageKind,
  now: Date = new Date()
): Promise<Denial | null> {
  if (!(await isEntitled(userId, now))) {
    return { reason: 'subscription_required', userMessage: subscriptionRequiredMessage() }
  }

  // Resolved once and passed down, rather than looked up by each of them: the
  // cap and the "you got down..." tail have to agree about when today started,
  // or a refusal could list successes from a day it is not counting.
  const timeZone = await zoneFor(userId)

  // Daily cap first, then the month's bill.
  if (await isOverLimit(userId, kind, now, timeZone)) {
    const successes = await todaySuccesses(userId, now, timeZone)
    return {
      reason: 'capped',
      userMessage: kind === 'vision' ? photoLimitMessage(successes) : limitMessage(successes),
    }
  }

  // Its own message, because the daily copy says "come back tomorrow" and
  // tomorrow changes nothing here — the window is a rolling thirty days. A
  // paying subscriber promised relief in a day and given it in three weeks
  // would be right to be angry, and support could not tell the two states
  // apart either.
  if ((await monthlySpendUsd(userId, now)) >= monthlyCeilingUsd()) {
    return { reason: 'capped', userMessage: monthlyLimitMessage() }
  }

  return null
}

/**
 * Per-million-token rates, by model.
 *
 * Read from LLM_MODEL rather than hardcoded to Haiku: pointing that env var at
 * a Sonnet-class model while these stayed at $1/$5 would price every measured
 * row about a third of its true cost — so the ceiling that exists to survive a
 * wrong estimate would itself be wrong, silently.
 *
 * An unrecognised model gets the most expensive rates here rather than the
 * cheapest. Over-charging an account trips the ceiling early, which is
 * visible; under-charging it spends money nobody notices.
 */
const RATES: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-5': { input: 5, output: 25 },
}

const FALLBACK_RATE = { input: 5, output: 25 }

/**
 * Whether the unknown-model warning has already been logged.
 *
 * Module-level, so it fires once per process rather than on every call. A
 * warning printed thousands of times a day is a warning nobody reads.
 */
let warnedAboutRate = false

/** Exposed for tests, which need each case to start from silence. */
export function resetRateWarning(): void {
  warnedAboutRate = false
}

/**
 * What a token costs, from `LLM_MODEL`.
 *
 * Falling back to the dearest rate is deliberate — under-counting spend is the
 * one direction a cost ceiling must not be wrong in. Falling back *silently*
 * was not. A model name that is valid at the API but absent from this table —
 * a dated identifier like `claude-3-5-haiku-20241022`, say — prices every call
 * at five times Haiku, and the only symptom is users meeting a spend ceiling
 * at roughly a quarter of the allowance they were meant to have, told they
 * have spent money they have not.
 *
 * Nothing about that is visible from the outside, which is why it says so.
 */
function rates(): { input: number; output: number } {
  const model = process.env.LLM_MODEL ?? 'claude-haiku-4-5'
  const known = RATES[model]

  if (!known && !warnedAboutRate) {
    warnedAboutRate = true
    console.warn(
      `[limits] LLM_MODEL "${model}" is not in the rate table, so spend is ` +
        `being priced at the fallback $${FALLBACK_RATE.input}/$${FALLBACK_RATE.output} ` +
        `per MTok. If that is not this model's real price, the monthly ceiling ` +
        `will cut users off early. Add it to RATES in src/lib/limits.ts.`
    )
  }

  return known ?? FALLBACK_RATE
}

/**
 * What a call is assumed to cost when its real tokens were never recorded.
 *
 * Used for rows written before tokens were measured, and for calls that died
 * before reporting. Erring high on purpose: under-counting spend is the one
 * direction a cost ceiling must not be wrong in.
 */
const ESTIMATED_USD: Record<UsageKind, number> = {
  chat: 0.0029,
  vision: 0.0038,
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/**
 * The hard stop on what one account can cost in a month.
 *
 * The daily caps bound a burst; this bounds the bill. Thirty saturated days in
 * a row is otherwise simply allowed, and — more to the point — the daily caps
 * only bound cost if the per-call estimates are right. They were never
 * checked. This ceiling is denominated in dollars over *measured* tokens, so
 * it still holds when the estimate turns out to be wrong.
 *
 * Sits above a heavy honest month (~$3.31) and below what a subscription nets
 * ($6.79), so it never troubles a real user and always protects the margin.
 */
export function monthlyCeilingUsd(): number {
  const raw = Number(process.env.MONTHLY_SPEND_CEILING_USD)

  return Number.isFinite(raw) && raw > 0 ? raw : 5
}

/**
 * What this account has actually cost over the last 30 days.
 *
 * Aggregated in the database rather than fetched and reduced in JS. This runs
 * on the latency-critical path before every chat and photo, and at the daily
 * caps a month is well over a thousand rows — pulling all of them to add up
 * two columns is work the index can do.
 */
export async function monthlySpendUsd(userId: string, now: Date = new Date()): Promise<number> {
  // Rolling rather than calendar: a month boundary that resets the ceiling
  // lets someone spend a full month on the 31st and another on the 1st.
  const since = new Date(now.getTime() - THIRTY_DAYS_MS)
  const rate = rates()

  const [measured, unmeasured] = await Promise.all([
    prisma.usageEvent.aggregate({
      where: { userId, createdAt: { gte: since }, NOT: { inputTokens: null } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    // Rows with no tokens fall back to the per-call estimate, grouped by kind
    // because a photo and a chat turn are not priced the same.
    prisma.usageEvent.groupBy({
      by: ['kind'],
      where: { userId, createdAt: { gte: since }, inputTokens: null },
      _count: { _all: true },
    }),
  ])

  const measuredUsd =
    ((measured._sum.inputTokens ?? 0) * rate.input +
      (measured._sum.outputTokens ?? 0) * rate.output) /
    1_000_000

  const estimatedUsd = unmeasured.reduce(
    (total, row) => total + row._count._all * (ESTIMATED_USD[row.kind as UsageKind] ?? 0),
    0
  )

  return measuredUsd + estimatedUsd
}

/**
 * Records what a call actually cost, once the provider has said.
 *
 * Separate from `recordUsage` because the row is written before the call — a
 * timeout still has to count — and the tokens are only known after it. Never
 * throws, for the same reason `recordUsage` does not: bookkeeping must not
 * break the request it is describing.
 */
export async function attributeTokens(
  eventId: string | null,
  usage: TokenUsage
): Promise<void> {
  if (!eventId) return

  try {
    // Accumulated, not overwritten. One recorded chat turn is TWO model calls —
    // the reply and the extraction pass — and the estimate it replaces was
    // sized for both. Overwriting meant a measured row priced lower than the
    // estimate, so the ceiling got weaker the moment it started measuring,
    // which is the opposite of the point.
    //
    // Increment cannot start from null, so the first attribution sets and
    // later ones add.
    const current = await prisma.usageEvent.findUnique({
      where: { id: eventId },
      select: { inputTokens: true, outputTokens: true },
    })

    await prisma.usageEvent.update({
      where: { id: eventId },
      data: {
        inputTokens: (current?.inputTokens ?? 0) + usage.inputTokens,
        outputTokens: (current?.outputTokens ?? 0) + usage.outputTokens,
      },
    })
  } catch (error) {
    console.error(
      'token attribution failed: ' + (error instanceof Error ? error.message : 'unknown')
    )
  }
}
