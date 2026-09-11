/**
 * Where a food's fat came from, and how to say it.
 *
 * Not saturated versus unsaturated. That axis puts crisps and avocado in the
 * same place — both are roughly 85% unsaturated, because crisps are fried in
 * sunflower and corn oil — and makes butter the worst thing on the plate.
 * Which is backwards: the distinction people actually mean is whole food
 * against industrially refined, and saturation cuts across that line rather
 * than along it.
 *
 * It is also the easier question to ask a vision model. Grams of saturated fat
 * from a photograph is a second-order inference; "is this fat from a whole food
 * or from a fried packaged product" is answerable from the food's name, which
 * the model has already worked out.
 */
export type FatSource = 'whole' | 'refined'

/** The fields this module reads, so a caller can pass whole food items. */
export type FatBearing = {
  fat: number
  fatSource?: FatSource | null
}

/**
 * What fraction of the day's fat came from whole foods, 0 to 1.
 *
 * Null when nothing carried fat — which is not the same as bad fat, and a day
 * of dry toast must not render as the worst available colour.
 *
 * Weighted by grams rather than by item count: half a teaspoon of butter beside
 * a bag of crisps is not a 50/50 day.
 */
export function wholeFoodFatShare(items: FatBearing[]): number | null {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.fat), 0)
  if (total === 0) return null

  const whole = items
    // An unclassified fat counts as refined. The model failing to say is not
    // evidence that it was good, and defaulting the other way would let a miss
    // flatter the day.
    .filter((item) => item.fatSource === 'whole')
    .reduce((sum, item) => sum + Math.max(0, item.fat), 0)

  return whole / total
}

/**
 * The same reading in words.
 *
 * Exists because the ring says this in green and yellow, and those are among
 * the hardest pairs to tell apart with red-green colour vision deficiency. The
 * colour is the glance; this is the fact. Deliberately vague — "mostly whole
 * food", never "68%" — because this app is for logging, and a percentage turns
 * a glance into arithmetic.
 */
export function fatQualityLabel(share: number | null): string | null {
  if (share === null) return null
  if (share >= 1) return 'whole food'
  if (share >= 0.7) return 'mostly whole food'
  if (share > 0.3) return 'half and half'
  if (share > 0) return 'mostly refined'
  return 'refined'
}
