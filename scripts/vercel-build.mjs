#!/usr/bin/env node
/**
 * The production build, run by Vercel.
 *
 * Exists for one line: `prisma db push` has to happen **before** the new code
 * serves a request. The CD workflow used to guarantee that by pushing the
 * schema and only then deploying. Now that Vercel's Git integration deploys on
 * push to main, the ordering has to live inside the build instead — a build
 * completes before its deployment is promoted, so schema-then-code still holds.
 *
 * The comment it inherits is worth keeping: on 2026-08-26, main deployed code
 * that selected a column the database did not have yet. Code and database move
 * together or they do not move.
 *
 * Invoked as `npm run vercel-build` rather than directly, because the package
 * manager is what puts `node_modules/.bin` on PATH — run with bare `node` the
 * `prisma` calls below cannot be found.
 *
 * Guarded on VERCEL_ENV, and that guard is the whole safety of this file.
 * Preview deployments build from feature branches against the *production*
 * database unless separate credentials are configured — so an unguarded push
 * would let any open pull request reshape production's schema.
 */
import { execSync } from 'node:child_process'

const run = (command) => execSync(command, { stdio: 'inherit' })

run('prisma generate')

if (process.env.VERCEL_ENV === 'production') {
  console.log('production build: pushing schema before the code that reads it')
  run('prisma db push --accept-data-loss')
} else {
  console.log(`VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'} — skipping schema push`)
}

run('next build')
