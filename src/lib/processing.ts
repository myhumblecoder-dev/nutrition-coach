/**
 * How processed the day's food was, on one axis.
 *
 * Groups are NOVA, the classification used in nutrition research, so the scale
 * is a published methodology rather than something invented here:
 *
 *   1  unprocessed or minimally processed — fruit, vegetables, meat, eggs, milk
 *   2  processed culinary ingredients — olive oil, butter, sugar, salt
 *   3  processed foods — cheese, bread, canned vegetables, cured meat
 *   4  ultra-processed — soft drinks, packaged snacks, protein bars
 *
 * Separate from `fatSource` in `fat.ts` on purpose. That answers "was this
 * fat any good", and cheese is group 3 with perfectly good fat — deriving one
 * from the other misclassifies both. They are different questions about the
 * same item.
 */
export type ProcessingGroup = 1 | 2 | 3 | 4

export type ProcessedBearing = {
  calories: number
  processingGroup?: ProcessingGroup | null
}

/**
 * Where the day sits, 0 for entirely ultra-processed and 1 for entirely whole.
 * Null when there is nothing to place.
 *
 * Weighted by calories. Item count over-punishes a condiment — a pinch of
 * stock powder on a plate of vegetables is not half a processed day — and
 * weight over-punishes anything watery.
 */
export function naturalShare(items: ProcessedBearing[]): number | null {
  // An unclassified item does not vote. Unlike fat, where silence counts
  // against, a missing group here would drag the marker somewhere arbitrary
  // rather than towards a known answer.
  const classified = items.filter((item) => item.processingGroup != null)

  const total = classified.reduce((sum, item) => sum + weightOf(item), 0)
  if (total === 0) return null

  const weighted = classified.reduce(
    (sum, item) => sum + weightOf(item) * (item.processingGroup as number),
    0
  )

  // Groups run 1..4; map the weighted mean onto 1..0 so 1 is the natural end.
  return (4 - weighted / total) / 3
}

/**
 * A floor under the calorie weighting, so a zero-calorie item still counts for
 * something.
 *
 * Weighting purely by calories silently excluded the most processed things a
 * person eats: diet soda, sugar-free gum, zero-calorie energy drinks are all
 * group 4 and all round to nothing. A day of them returned no reading at all,
 * and one beside a real meal read as a perfect whole-food day.
 *
 * Small enough that it cannot outweigh food — twenty of them still lose to one
 * 400-calorie plate — but large enough to register.
 */
const MINIMUM_WEIGHT = 15

function weightOf(item: ProcessedBearing): number {
  return Math.max(MINIMUM_WEIGHT, item.calories)
}

/**
 * The same position in words.
 *
 * Never a percentage. A marker on a labelled spectrum is something you glance
 * at; "68% natural" is arithmetic, and this app is for logging rather than
 * auditing. It also stops the gauge reading as a score out of a hundred, which
 * is the thing a day of unavoidable airport food should not be given.
 */
export function processingLabel(share: number | null): string | null {
  if (share === null) return null
  if (share >= 0.85) return 'real food'
  if (share >= 0.6) return 'mostly real food'
  if (share > 0.35) return 'a bit of both'
  if (share > 0) return 'mostly packaged'
  return 'packaged'
}

/**
 * Pulls the calorie-and-group pairs out of a meal's stored `foodItems` JSON.
 *
 * Same tolerance as `fatItemsFromJson`, and for the same reason: most rows in
 * the database name no group at all, and a malformed one must cost the gauge
 * its marker rather than fail whatever is reading it.
 */
export function processedItemsFromJson(foodItems: string): ProcessedBearing[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(foodItems)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []
    const { calories, processingGroup } = item as {
      calories?: unknown
      processingGroup?: unknown
    }
    if (typeof calories !== 'number' || !Number.isFinite(calories) || calories <= 0) return []

    const group =
      processingGroup === 1 || processingGroup === 2 || processingGroup === 3 || processingGroup === 4
        ? processingGroup
        : null

    return [{ calories, processingGroup: group }]
  })
}
