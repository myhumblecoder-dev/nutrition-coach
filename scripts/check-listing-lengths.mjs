#!/usr/bin/env node
// Apple enforces listing field limits at submission, which is the worst moment
// to learn a paragraph is sixteen characters too long.
//
// Reports the length it counted, never the length it expected — a note under
// the promotional text once claimed it fit while it was 186 characters in a
// 170-character field, because nothing had ever counted it.
import { readFields } from './lib/listing.mjs'

let failed = 0

for (const field of readFields()) {
  const { heading, limit, value } = field
  if (value === null) {
    console.log(`  ✗ ${heading} — no fenced block under this heading in ${field.source}`)
    failed = 1
    continue
  }

  // Count code points, not UTF-16 units: the copy uses em dashes and bullets,
  // and Apple counts characters.
  const length = [...value].length

  if (limit === null) {
    console.log(`  ✓ ${heading} — ${length} chars (no limit)`)
  } else if (length > limit) {
    console.log(`  ✗ ${heading} — ${length} characters, ${length - limit} over`)
    failed = 1
  } else {
    console.log(`  ✓ ${heading} — ${length}/${limit}`)
  }
}

// Placeholders are the one content check worth making mechanical: a value that
// merely looks finished is what a human proof-read misses, and Apple reads these
// fields verbatim.
const PLACEHOLDERS = [/<[A-Z][A-Z ]+>/, /\bTODO\b/, /\bTBD\b/, /\bFIXME\b/, /\bXXX\b/, /example\.com/i]

for (const { heading, value } of readFields()) {
  if (value === null) continue
  for (const pattern of PLACEHOLDERS) {
    const hit = value.match(pattern)
    if (hit) {
      console.log(`  ✗ ${heading} — unresolved placeholder ${JSON.stringify(hit[0])}`)
      failed = 1
    }
  }
}

process.exit(failed)
