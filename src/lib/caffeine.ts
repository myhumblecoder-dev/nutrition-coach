/**
 * Caffeine pharmacokinetics, kept free of any app dependency so it stays a
 * pure calculation: no prisma, no llm, no next.
 *
 * Caffeine clears by first-order elimination — a fixed FRACTION per unit time,
 * not a fixed amount — so each dose is decayed by its own age and the results
 * summed.
 */
export const CAFFEINE_HALF_LIFE_HOURS = 5

/** Below this, the remaining load is not worth reasoning about. */
export const NEGLIGIBLE_MG = 25

/**
 * Below this, the stimulant effect is no longer meaningfully felt. This — not
 * full clearance — is the number a user means by "how long will this last":
 * the tail from here down to NEGLIGIBLE_MG is another whole half-life during
 * which nothing is perceptible.
 */
export const EFFECT_THRESHOLD_MG = 50

const MS_PER_HOUR = 3600_000

export function caffeineStatus(
  doses: { mg: number; at: Date }[],
  now: Date
): {
  totalMg: number
  currentMg: number
  hoursUntilEffectsFade: number
  hoursUntilNegligible: number
} {
  let total = 0
  let current = 0

  for (const dose of doses) {
    total += dose.mg
    // Clamp at 0: a dose stamped in the future (clock skew) is treated as just
    // taken rather than decayed backwards into an amplified level.
    const hoursElapsed = Math.max(0, (now.getTime() - dose.at.getTime()) / MS_PER_HOUR)
    current += dose.mg * Math.pow(0.5, hoursElapsed / CAFFEINE_HALF_LIFE_HOURS)
  }

  const currentMg = Math.round(current)
  const hoursToFall = (floor: number) =>
    currentMg <= floor
      ? 0
      : Math.round(Math.log2(currentMg / floor) * CAFFEINE_HALF_LIFE_HOURS * 10) / 10

  return {
    totalMg: Math.round(total),
    currentMg,
    hoursUntilEffectsFade: hoursToFall(EFFECT_THRESHOLD_MG),
    hoursUntilNegligible: hoursToFall(NEGLIGIBLE_MG),
  }
}
