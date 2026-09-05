#!/usr/bin/env node
// Apple enforces listing field limits at submission, which is the worst moment
// to learn a paragraph is sixteen characters too long. This measures them.
//
// It reports the length it counted, never the length it expected — a check that
// prints a green line without reading the file is how the promotional text
// shipped at 186/170 with a note underneath claiming it fit.
import { readFileSync } from 'node:fs'

const LIMITS = {
  'Name (30)': 30,
  'Subtitle (30)': 30,
  'Promotional text (170)': 170,
  'Description (4000)': 4000,
  'Keywords (100, comma-separated, no spaces)': 100,
}

const source = readFileSync('ios/STORE-LISTING.md', 'utf8')
let failed = 0

for (const [heading, limit] of Object.entries(LIMITS)) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // The section runs to the next `## ` heading. Prose may sit between the
  // heading and the value, so take the first fenced block inside the section
  // rather than assuming the fence follows the heading directly.
  const section = source.match(new RegExp(`^## ${escaped}\\n([\\s\\S]*?)(?=^## |\\Z)`, 'm'))
  const match = section && section[1].match(/```\n([\s\S]*?)\n```/)

  if (!match) {
    console.log(`  ✗ ${heading} — no fenced block found under this heading`)
    failed = 1
    continue
  }

  // Newlines count against the limit, and App Store Connect stores them
  // verbatim, so measure exactly what would be pasted.
  const value = match[1]
  const length = [...value].length

  if (length > limit) {
    console.log(`  ✗ ${heading} — ${length} characters, ${length - limit} over`)
    failed = 1
  } else {
    console.log(`  ✓ ${heading} — ${length}/${limit}`)
  }
}

process.exit(failed)
