#!/usr/bin/env node
// Counts the App Store listing fields in ios/LISTING.md against Apple's
// limits. A field that overflows is not rejected — it is silently truncated,
// which is how a description ends mid-sentence on the store page.
import { readFileSync } from 'node:fs'

const LIMITS = { Subtitle: 30, 'Promotional text': 170, Keywords: 100, Description: 4000 }

const text = readFileSync(new URL('../ios/LISTING.md', import.meta.url), 'utf8')
let failed = false

for (const [field, limit] of Object.entries(LIMITS)) {
  // The first fenced block after the field's heading.
  const section = text.split(new RegExp(`^## ${field}`, 'm'))[1]
  const body = section?.match(/```\n([\s\S]*?)\n```/)?.[1]

  if (body === undefined) {
    console.error(`✗ ${field}: no fenced block found under its heading`)
    failed = true
    continue
  }

  const used = body.length
  const mark = used <= limit ? '✓' : '✗'
  console.log(`${mark} ${field}: ${used}/${limit}`)
  if (used > limit) failed = true
}

process.exit(failed ? 1 : 0)
