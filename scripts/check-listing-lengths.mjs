#!/usr/bin/env node
// Apple enforces listing field limits at submission, which is the worst moment
// to learn a paragraph is sixteen characters too long.
//
// Reports the length it counted, never the length it expected — a note under
// the promotional text once claimed it fit while it was 186 characters in a
// 170-character field, because nothing had ever counted it.
import { readFields, SOURCE } from './lib/listing.mjs'

let failed = 0

for (const { heading, limit, value } of readFields()) {
  if (value === null) {
    console.log(`  ✗ ${heading} — no fenced block under this heading in ${SOURCE}`)
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

process.exit(failed)
