/**
 * The fat ring's colour, walked between two ends.
 *
 * Green for fat from whole foods, yellow for fat from refined ones, and a
 * continuous gradient between — not a traffic light. A day that is a little
 * worse should look a little worse rather than flipping to a warning colour at
 * some invented threshold, and a threshold would also be a verdict, which is
 * the thing `voice.ts` forbids pointing at the person.
 *
 * Yellow rather than red on purpose. Red reads as "you failed"; yellow reads
 * as "look at this". The judgement is on the fat, not the eater.
 *
 * Shared with iOS by keeping the maths trivial and the ends written down in
 * both places — see `Theme.fatWhole` / `Theme.fatRefined`.
 */

/**
 * Emerald 500, not the accent's emerald 600.
 *
 * Both ends have to be about equally light or the path between them sags
 * through olive — which is what the first attempt did, and it made a 60%
 * whole-food day look like sludge rather than like anything good. Brightening
 * this end keeps the whole scale clean. It stays in the accent's hue family,
 * so the fat ring reads as a brighter sibling of the other two.
 */
export const FAT_WHOLE = '#10b981'
/** Yellow, as in "green is good and yellow is bad". Not red: red reads as
 * "you failed", and the judgement belongs on the fat, not the eater. */
export const FAT_REFINED = '#eab308'
/** Theme.track. What an empty ring already is. */
const NO_READING = '#f0f0f1'

export function fatColour(wholeFoodShare: number | null): string {
  // Nothing to say, so say nothing: the ring stays the colour of an empty one.
  // Rendering a fatless day as fully refined would be a lie about it.
  if (wholeFoodShare === null) return NO_READING

  const t = Math.min(1, Math.max(0, wholeFoodShare))

  return mix(FAT_REFINED, FAT_WHOLE, t)
}

/**
 * Linear in sRGB, which is fine *because* the two ends were chosen to have
 * similar lightness. Mud between green and yellow is a lightness problem, not
 * a colour-space one: interpolating a dark green to a bright yellow goes
 * through olive in any space. Keep both ends bright and plain sRGB is clean,
 * and stays trivial to mirror in Swift.
 */
function mix(from: string, to: string, t: number): string {
  const channels = [0, 1, 2].map((i) => {
    const a = parseInt(from.slice(1 + i * 2, 3 + i * 2), 16)
    const b = parseInt(to.slice(1 + i * 2, 3 + i * 2), 16)
    return Math.round(a + (b - a) * t)
  })

  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
