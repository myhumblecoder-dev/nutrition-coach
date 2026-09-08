import { prisma } from '@/lib/db'
import { targetSchema, type DailyTargetInput } from '@/lib/targets'

// A new account has nothing to mirror: no targets, so no rings, and an empty
// conversation. Rather than open a form — the one thing this product says it
// never asks you to fill in — the coach starts the conversation.

/**
 * The coach's first words.
 *
 * Fixed, not generated: it is the same question every time, it must name both
 * routes, and a model rewording the opening is a risk with no upside. The
 * coach's voice comes in on the reply, exactly as it does for the weekly
 * check-in questions.
 */
export const OPENING_MESSAGE =
  "Right, let's get you started. What are you aiming for in a day — calories and protein? " +
  "If you have no idea, just tell me roughly how tall you are and what you weigh, and I'll " +
  "work out somewhere to start."

/**
 * Seeds the opening message for an account that has never had a conversation.
 *
 * Idempotent and keyed on the conversation being empty, so it fires once per
 * account and never interrupts an existing one. Called from the chat read path
 * so both clients get it without either having to know about onboarding.
 */
export async function ensureOpeningMessage(userId: string): Promise<void> {
  const existing = await prisma.chatMessage.count({ where: { userId } })
  if (existing > 0) return

  await prisma.chatMessage.create({
    data: { userId, role: 'assistant', content: OPENING_MESSAGE },
  })
}

export type BodyEstimateInput = { heightIn: number; weightLb: number }

/**
 * A starting daily target from height and weight.
 *
 * Mifflin-St Jeor needs age and sex, and this app asks for neither — so both
 * are assumed, and the numbers are a starting point rather than a prescription.
 * That is not a shortcoming to hide: the product's whole argument is that these
 * figures are estimates, and the coach says so when it offers them.
 *
 * Assumptions, stated rather than buried:
 *   - age 35, the middle of the likely range
 *   - the midpoint of the male (+5) and female (−161) constants, so the answer
 *     is wrong by a similar margin in either direction instead of being right
 *     for one and badly off for the other
 *   - lightly active (×1.4), because someone who has not set a target has not
 *     told us how they train
 *   - protein at 0.8 g per pound of bodyweight
 */
export function estimateTargets({ heightIn, weightLb }: BodyEstimateInput): DailyTargetInput {
  const kg = weightLb * 0.45359237
  const cm = heightIn * 2.54

  const bmr = 10 * kg + 6.25 * cm - 5 * 35 - 78
  const calories = Math.round((bmr * 1.4) / 10) * 10
  const protein = Math.round(weightLb * 0.8)

  // Clamped to the same bounds the API enforces: an implausible height or
  // weight must not produce a target the rest of the app would reject, and a
  // ring needs a denominator it can actually divide by.
  return targetSchema.parse({
    calories: Math.min(10000, Math.max(500, calories)),
    protein: Math.min(500, Math.max(20, protein)),
  })
}
