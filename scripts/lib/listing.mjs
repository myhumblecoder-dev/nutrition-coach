// One parser for ios/STORE-LISTING.md, shared by the length check and the
// paste-ready file generator. Two regexes over the same file would drift, and
// the whole point of that file is that it IS the listing rather than a draft.
import { readFileSync } from 'node:fs'

export const SOURCE = 'ios/STORE-LISTING.md'
export const REVIEW_SOURCE = 'ios/REVIEW-NOTES.md'

// Heading in STORE-LISTING.md → output basename and Apple's character limit.
// A limit of null means Apple does not cap the field.
export const FIELDS = [
  { heading: 'Name (30)', file: 'name', limit: 30 },
  { heading: 'Subtitle (30)', file: 'subtitle', limit: 30 },
  { heading: 'Promotional text (170)', file: 'promotional-text', limit: 170 },
  { heading: 'Description (4000)', file: 'description', limit: 4000 },
  { heading: 'Keywords (100, comma-separated, no spaces)', file: 'keywords', limit: 100 },
  { heading: 'Support URL', file: 'support-url', limit: null },
  { heading: 'Marketing URL', file: 'marketing-url', limit: null },
  { heading: 'Privacy policy URL', file: 'privacy-policy-url', limit: null },
]

// The App Review Information "Notes" box, from a different file: it is written
// for a reviewer, not a customer, and lives with the submission checklist.
export const REVIEW_NOTES = {
  heading: 'Notes for the reviewer',
  file: 'review-notes',
  limit: 4000,
  source: REVIEW_SOURCE,
}

/**
 * The first fenced block under a `## ` heading, verbatim.
 *
 * The section runs to the next `## `, and prose may sit between the heading and
 * the value, so the fence is searched for inside the section rather than
 * assumed to follow the heading directly.
 *
 * Returns null rather than throwing: a caller reporting "not found" is more
 * useful than a stack trace, and silently returning an empty string would let a
 * missing field pass a length check.
 */
export function extract(source, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const section = source.match(new RegExp(`^## ${escaped}\\n([\\s\\S]*?)(?=^## |\\Z)`, 'm'))
  if (!section) return null
  const fence = section[1].match(/```\n([\s\S]*?)\n```/)
  return fence ? fence[1] : null
}

export function readFields() {
  const source = readFileSync(SOURCE, 'utf8')
  const fields = FIELDS.map((f) => ({ ...f, value: extract(source, f.heading), source: SOURCE }))

  const reviewSource = readFileSync(REVIEW_SOURCE, 'utf8')
  fields.push({ ...REVIEW_NOTES, value: extract(reviewSource, REVIEW_NOTES.heading) })

  return fields
}
