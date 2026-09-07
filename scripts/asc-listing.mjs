#!/usr/bin/env node
// Reads — and optionally writes — the App Store Connect listing from
// ios/listing/, so the repo is the source of truth for what Apple shows.
//
//   node scripts/asc-listing.mjs           # audit: report what Apple holds
//   node scripts/asc-listing.mjs --push    # write description + reviewer notes
//
// Pasting eight fields by hand is where drift comes from: twice in one week a
// re-paste silently did not take, leaving Apple describing screens the app no
// longer had. The audit catches that; --push fixes it.
//
// Deliberately narrow. It writes exactly two fields, and NEVER touches
// appStoreVersionSubmissions — submitting stays a human decision.
//
// Needs, from the environment:
//   APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID
//   APP_STORE_CONNECT_KEYS_DIR (default ~/.appstoreconnect/private_keys)
import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID
const KEYS_DIR = process.env.APP_STORE_CONNECT_KEYS_DIR ?? join(homedir(), '.appstoreconnect/private_keys')

if (!KEY_ID || !ISSUER_ID) {
  console.error('Set APP_STORE_CONNECT_KEY_ID and APP_STORE_CONNECT_ISSUER_ID.')
  console.error('See ios/SUBMITTING.md §5.')
  process.exit(2)
}

const push = process.argv.includes('--push')
const bundleId = JSON.parse(readFileSync('appstore.config.json', 'utf8')).bundleId

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const header = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })
  const payload = b64({ iss: ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })
  const signer = createSign('SHA256')
  signer.update(`${header}.${payload}`)
  // ieee-p1363, not OpenSSL's DER default. A DER signature is a silent 401.
  const key = readFileSync(join(KEYS_DIR, `AuthKey_${KEY_ID}.p8`), 'utf8')
  return `${header}.${payload}.${signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
}

const TOKEN = token()

async function call(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`  ${method} ${path} → HTTP ${res.status}`)
    console.error('  ' + text.slice(0, 400))
    process.exit(1)
  }
  return text ? JSON.parse(text) : {}
}

const field = (name) => readFileSync(`ios/listing/${name}.md`, 'utf8').replace(/\n$/, '')

const apps = await call('GET', '/v1/apps?limit=200')
const app = apps.data.find((a) => a.attributes.bundleId === bundleId)
if (!app) {
  console.error(`No app in App Store Connect with bundle id ${bundleId}.`)
  process.exit(1)
}

const version = (await call('GET', `/v1/apps/${app.id}/appStoreVersions`)).data[0]
const loc = (await call('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`))
  .data.find((l) => l.attributes.locale === 'en-US')
const detail = (await call('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`)).data

console.log(`${app.attributes.name} — version ${version.attributes.versionString} (${version.attributes.appStoreState})`)

if (push) {
  await call('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, {
    data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { description: field('description') } },
  })
  await call('PATCH', `/v1/appStoreReviewDetails/${detail.id}`, {
    data: { type: 'appStoreReviewDetails', id: detail.id, attributes: { notes: field('review-notes') } },
  })
  console.log('  pushed description and reviewer notes')
}

// Always read back afterwards. A 200 on a PATCH is not evidence the field
// holds what you sent, and this whole script exists because a write that
// looked fine had not landed.
const freshLoc = (await call('GET', `/v1/appStoreVersionLocalizations/${loc.id}`)).data.attributes
const freshDetail = (await call('GET', `/v1/appStoreReviewDetails/${detail.id}`)).data.attributes

let drift = 0
const compare = (label, got, want) => {
  if (got === want) {
    console.log(`  ok  ${label}  ${want.length} chars, matches ios/listing`)
  } else {
    console.log(`  x   ${label}  Apple has ${got?.length ?? 0} chars, ios/listing has ${want.length}`)
    drift = 1
  }
}

compare('description ', freshLoc.description, field('description'))
compare('review notes', freshDetail.notes, field('review-notes'))
compare('keywords    ', freshLoc.keywords, field('keywords'))
compare('promo text  ', freshLoc.promotionalText, field('promotional-text'))
compare('support url ', freshLoc.supportUrl, field('support-url'))
compare('marketing   ', freshLoc.marketingUrl, field('marketing-url'))

if (drift && !push) console.log('\n  run with --push to write description and reviewer notes')
process.exit(drift)
