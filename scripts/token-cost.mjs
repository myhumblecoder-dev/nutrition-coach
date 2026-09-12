#!/usr/bin/env node
/**
 * What the app actually costs to run, per user, from measured tokens.
 *
 * Every margin figure in this project — the $7.99 price, the daily caps, the
 * $5 monthly ceiling, the decision to honour Family Sharing — rests on an
 * estimate of roughly $1.99 per active user per month. That estimate was made
 * before the prompts grew fat, fat source and NOVA groups, and before the
 * coach started carrying today's food, sleep, mood and check-in answers.
 *
 * `usageEvent` has real token counts. This reads them rather than arguing.
 *
 *   DATABASE_URL="postgres://..." node scripts/token-cost.mjs [days]
 *
 * Defaults to 30 days. Read-only; touches nothing.
 */
import { PrismaClient } from '@prisma/client'

// Must match RATES in src/lib/limits.ts. USD per million tokens.
const RATES = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-5': { input: 5, output: 25 },
}
const MODEL = process.env.LLM_MODEL ?? 'claude-haiku-4-5'
const rate = RATES[MODEL] ?? RATES['claude-opus-5']

const days = Number(process.argv[2] ?? 30)
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

const usd = (input, output) => (input * rate.input + output * rate.output) / 1e6
const money = (n) => `$${n.toFixed(4)}`

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[i]
}

const prisma = new PrismaClient()

try {
  // Pulled into memory to compute percentiles, which SQL would make fiddly.
  // Fine at current volume; at a thousand active users this would be most of a
  // million rows, so it refuses rather than quietly eating the machine.
  const total = await prisma.usageEvent.count({ where: { createdAt: { gte: since } } })
  if (total > 200_000) {
    console.error(
      `${total} events in ${days} days — too many to load. Narrow the window: ` +
        `node scripts/token-cost.mjs 7`
    )
    process.exit(1)
  }

  const events = await prisma.usageEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { userId: true, kind: true, inputTokens: true, outputTokens: true },
  })

  if (events.length === 0) {
    console.log(`No usage in the last ${days} days. Nothing to measure yet.`)
    process.exit(0)
  }

  const measured = events.filter((e) => e.inputTokens !== null)
  const coverage = ((measured.length / events.length) * 100).toFixed(0)

  console.log(`\nModel ${MODEL} at $${rate.input}/$${rate.output} per MTok`)
  console.log(`${events.length} calls over ${days} days, ${coverage}% with measured tokens\n`)

  // Per call, by kind. This is what the daily caps are sized against.
  console.log('PER CALL')
  for (const kind of ['chat', 'vision']) {
    const rows = measured.filter((e) => e.kind === kind)
    if (rows.length === 0) {
      console.log(`  ${kind.padEnd(7)} no measured calls`)
      continue
    }
    const costs = rows.map((e) => usd(e.inputTokens, e.outputTokens)).sort((a, b) => a - b)
    const mean = costs.reduce((a, b) => a + b, 0) / costs.length
    const inAvg = Math.round(rows.reduce((a, e) => a + e.inputTokens, 0) / rows.length)
    const outAvg = Math.round(rows.reduce((a, e) => a + e.outputTokens, 0) / rows.length)
    console.log(
      `  ${kind.padEnd(7)} n=${String(rows.length).padEnd(6)} mean ${money(mean)}  ` +
        `p50 ${money(percentile(costs, 50))}  p95 ${money(percentile(costs, 95))}  ` +
        `(${inAvg} in / ${outAvg} out)`
    )
  }

  // Per user, normalised to 30 days — the number the price has to clear.
  const byUser = new Map()
  for (const e of measured) {
    byUser.set(e.userId, (byUser.get(e.userId) ?? 0) + usd(e.inputTokens, e.outputTokens))
  }
  const perUser = [...byUser.values()]
    .map((total) => (total / days) * 30)
    .sort((a, b) => a - b)

  const mean = perUser.reduce((a, b) => a + b, 0) / perUser.length
  console.log(`\nPER USER PER 30 DAYS  (${perUser.length} users with measured usage)`)
  console.log(`  mean ${money(mean)}   p50 ${money(percentile(perUser, 50))}   ` +
    `p95 ${money(percentile(perUser, 95))}   max ${money(perUser[perUser.length - 1])}`)

  // What the pricing actually has to survive.
  const PROCEEDS = 7.99 * 0.85 // Small Business Program: Apple takes 15%
  const CEILING = Number(process.env.MONTHLY_SPEND_CEILING_USD) || 5
  console.log(`\nAGAINST $7.99/month (${money(PROCEEDS)} after Apple's 15%)`)
  console.log(`  worst measured user costs ${money(perUser[perUser.length - 1])} ` +
    `— margin ${money(PROCEEDS - perUser[perUser.length - 1])}`)
  console.log(`  break-even at ${(PROCEEDS / mean).toFixed(1)} average users per subscription`)
  console.log(`  (Family Sharing allows up to 6, so that number must stay above 6)`)
  console.log(`  per-user monthly ceiling is $${CEILING}; ` +
    `${perUser.filter((c) => c > CEILING).length} user(s) would have hit it\n`)
} finally {
  await prisma.$disconnect()
}
