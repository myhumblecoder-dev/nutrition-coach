/**
 * Strips direct identifiers before text is sent to the model.
 *
 * **This is not a health-data filter, and could not be one.** Weight, sleep,
 * mood and meals are the entire input to this app — filtering them would leave
 * nothing for the coach to read. What it removes is the handful of things the
 * coach has no use for and that people paste by accident: an email address, a
 * phone number, a card number, a national ID.
 *
 * Deterministic and local. No model call, nothing to get creative, and every
 * rule is testable — which matters, because the failure worth worrying about
 * here is not a missed email address but a greedy rule quietly eating "172 on
 * the scale" and making the coach look broken.
 */
export const REDACTED = '[redacted]'

/**
 * Ordered because they overlap: a card number would otherwise be partly
 * consumed by the phone rule, leaving a fragment of a real card in the text.
 */
const RULES: RegExp[] = [
  // Email. Deliberately loose on the local part — people have odd addresses,
  // and over-matching here costs nothing.
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,

  // Card-length digit runs, 13-16 digits with optional spaces or hyphens.
  // Before the phone rule, which would otherwise bite off the first chunk.
  /\b(?:\d[ -]?){12,15}\d\b/g,

  // US social security number.
  /\b\d{3}-\d{2}-\d{4}\b/g,

  // Phone numbers. Anchored on either a leading + or a bracketed or
  // hyphen-separated grouping, so a bare "2000 calories" or "3x5 at 185"
  // cannot match — the thing that makes a naive digit rule dangerous here.
  /\+\d[\d -]{7,}\d/g,
  /\(\d{3}\)[ -]?\d{3}[ -]?\d{4}\b/g,
  /\b\d{3}-\d{3}-\d{4}\b/g,
]

export function redactIdentifiers(text: string): string {
  return RULES.reduce((current, rule) => current.replace(rule, REDACTED), text)
}
