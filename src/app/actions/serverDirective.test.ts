import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

// Reads source text instead of importing the modules, so no mock can fool it.
// A server action missing 'use server' compiles into the client bundle when a
// client component imports it — the phase-1c root failure.
const files = [
  'analyzeMeal.ts',
  'deleteMealEntry.ts',
  'getChatHistory.ts',
  'getToday.ts',
  'saveMealEntry.ts',
  'sendChatMessage.ts',
  'uploadMealPhoto.ts',
  'upsertDailyTarget.ts',
].filter((f) => {
  try {
    readFileSync(join(process.cwd(), 'src/app/actions', f))
    return true
  } catch {
    return false
  }
})

describe('server action directives', () => {
  it('every server action file begins with the use server directive', () => {
    for (const file of files) {
      const firstLine = readFileSync(
        join(process.cwd(), 'src/app/actions', file),
        'utf8'
      ).split('\n')[0]
      expect(firstLine, file).toMatch(/^['"]use server['"];?\s*$/)
    }
  })
})
