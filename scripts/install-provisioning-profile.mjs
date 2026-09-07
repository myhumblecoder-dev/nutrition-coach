#!/usr/bin/env node
// Fetches the App Store provisioning profile from App Store Connect and
// installs it where xcodebuild looks.
//
// xcodebuild's cloud signing (-allowProvisioningUpdates with automatic
// signing) needs an API key with the Admin role. An App Manager key can create
// and read profiles through the API but cannot drive cloud signing, and the
// failure is an unhelpful pair:
//
//   error: exportArchive Cloud signing permission error
//   error: exportArchive No profiles for '<bundle id>' were found
//
// — the second of which is untrue when a matching ACTIVE profile exists.
// Fetching the profile ourselves sidesteps cloud signing entirely and keeps the
// key at the least privilege that works.
//
// Prints the profile name for ExportOptions.plist to reference.
import { createSign } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID
// A "~" arriving from a YAML env value is a literal tilde — nothing expands it
// before node sees it — so expand it here rather than looking for a directory
// actually named "~".
const KEYS_DIR = (process.env.APP_STORE_CONNECT_KEYS_DIR ?? join(homedir(), '.appstoreconnect/private_keys'))
  .replace(/^~(?=\/|$)/, homedir())
const bundleId = JSON.parse(readFileSync('appstore.config.json', 'utf8')).bundleId

if (!KEY_ID || !ISSUER_ID) {
  console.error('APP_STORE_CONNECT_KEY_ID and APP_STORE_CONNECT_ISSUER_ID are required')
  process.exit(2)
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const header = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })
const payload = b64({ iss: ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })
const signer = createSign('SHA256')
signer.update(`${header}.${payload}`)
// ieee-p1363: OpenSSL's DER default is a silent 401.
const key = readFileSync(join(KEYS_DIR, `AuthKey_${KEY_ID}.p8`), 'utf8')
const TOKEN = `${header}.${payload}.${signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`${method} ${path} → HTTP ${res.status}`)
    console.error(text.slice(0, 400))
    process.exit(1)
  }
  return text ? JSON.parse(text) : null
}

// An ACTIVE App Store profile for this bundle id, created if there is none.
const profiles = await api('GET', '/v1/profiles?limit=200&include=bundleId')
let profile = (profiles.data ?? []).find((p) => {
  if (p.attributes.profileType !== 'IOS_APP_STORE') return false
  if (p.attributes.profileState !== 'ACTIVE') return false
  const rel = p.relationships?.bundleId?.data?.id
  return (profiles.included ?? []).some((b) => b.id === rel && b.attributes.identifier === bundleId)
})

if (!profile) {
  const ids = await api('GET', '/v1/bundleIds?limit=200')
  const target = (ids.data ?? []).find((b) => b.attributes.identifier === bundleId)
  if (!target) {
    console.error(`No App ID registered for ${bundleId}`)
    process.exit(1)
  }
  const certs = await api('GET', '/v1/certificates?limit=200')
  const dist = (certs.data ?? []).filter((c) => c.attributes.certificateType === 'DISTRIBUTION')
  if (dist.length === 0) {
    console.error('No DISTRIBUTION certificate in the account')
    process.exit(1)
  }
  const created = await api('POST', '/v1/profiles', {
    data: {
      type: 'profiles',
      attributes: { name: `${bundleId} App Store`, profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: target.id } },
        certificates: { data: dist.map((c) => ({ type: 'certificates', id: c.id })) },
      },
    },
  })
  profile = created.data
  console.log(`created profile "${profile.attributes.name}"`)
}

const decoded = Buffer.from(profile.attributes.profileContent, 'base64')
const uuid = decoded.toString('latin1').match(/<key>UUID<\/key>\s*<string>([^<]+)<\/string>/)?.[1]
if (!uuid) {
  console.error('Could not read a UUID out of the profile')
  process.exit(1)
}

// Reported, not assumed: an export fails confusingly if the profile lacks an
// entitlement the app declares.
const text = decoded.toString('latin1')
for (const entitlement of [
  'aps-environment',
  'com.apple.developer.applesignin',
  'devicecheck.appattest-environment',
]) {
  if (!text.includes(entitlement)) {
    console.error(`profile does not grant ${entitlement} — enable it on the App ID`)
    process.exit(1)
  }
}

const dir = join(homedir(), 'Library/MobileDevice/Provisioning Profiles')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, `${uuid}.mobileprovision`), decoded)

console.log(`installed "${profile.attributes.name}"  ${uuid}`)
console.log(`expires ${profile.attributes.expirationDate}`)
// Consumed by the workflow to build ExportOptions.plist.
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, `profile_name=${profile.attributes.name}\n`, { flag: 'a' })
}
