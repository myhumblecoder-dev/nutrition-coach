import type { ExtractionResult } from '@/lib/extraction'

/**
 * What Siri says back.
 *
 * Server-side so the copy has one home, the same reason `limitMessage` and the
 * coach's storage note live here. A client assembling this would need its own
 * pluralisation and its own idea of the coach's register, and the two would
 * drift.
 *
 * Short on purpose. This is spoken aloud, usually while someone is doing
 * something else, and a sentence that scans on a screen is tedious in the ear.
 */
export function spokenResult(recorded: ExtractionResult): string {
  const written = [
    label(recorded.meals, 'meal', 'meals'),
    label(recorded.training, 'session', 'sessions'),
    label(recorded.recovery, 'entry', 'entries'),
    label(recorded.mood, 'mood note', 'mood notes'),
    label(recorded.measurement, 'measurement', 'measurements'),
  ].filter((part): part is string => part !== null)

  // Never claim a save that did not happen. The same rule the coach follows in
  // chat, and it matters more here: there is no screen to check against.
  if (written.length === 0) {
    return "I couldn't make anything of that — tell me what you ate."
  }

  return `Logged ${list(written)}.`
}

function label(count: number, one: string, many: string): string | null {
  if (count <= 0) return null
  return `${count} ${count === 1 ? one : many}`
}

/** "a, b and c" — spoken, so the conjunction earns its place. */
function list(parts: string[]): string {
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
