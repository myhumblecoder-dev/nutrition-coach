#!/usr/bin/env node
// Writes each App Store Connect field to its own file under ios/listing/, so a
// manual submission is open-and-copy rather than hunting through a document.
//
// Generated, never hand-edited: ios/STORE-LISTING.md is the source, and a
// second hand-maintained copy of the description is exactly the drift this
// avoids. `--check` verifies the two agree without writing, which is what the
// appstore gate runs.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { readFields, SOURCE } from './lib/listing.mjs'

const OUT = 'ios/listing'
const checkOnly = process.argv.includes('--check')

const fields = readFields()
let failed = 0

if (!checkOnly) mkdirSync(OUT, { recursive: true })

for (const { heading, file, value } of fields) {
  if (value === null) {
    console.log(`  ✗ ${heading} — no fenced block under this heading in ${SOURCE}`)
    failed = 1
    continue
  }

  const path = join(OUT, `${file}.md`)
  // Trailing newline so the files behave in a terminal; stripped on paste.
  const contents = `${value}\n`

  if (checkOnly) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null
    if (current === contents) {
      console.log(`  ✓ ${path} matches ${SOURCE}`)
    } else {
      const why = current === null ? 'missing' : 'differs from the source'
      console.log(`  ✗ ${path} ${why} — run: node scripts/generate-listing-files.mjs`)
      failed = 1
    }
  } else {
    writeFileSync(path, contents)
    console.log(`  wrote ${path}  ${[...value].length} chars`)
  }
}

process.exit(failed)
