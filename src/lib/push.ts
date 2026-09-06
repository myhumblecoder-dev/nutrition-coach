import { createSign, createPrivateKey } from 'node:crypto'
import { connect } from 'node:http2'

// APNs is HTTP/2 only — Node's fetch cannot speak it, so this uses node:http2
// directly. That confines the module to the Node runtime (not Edge), which is
// where the cron route already runs.

// Apple rejects provider tokens older than one hour and also rejects tokens
// regenerated too often, so one token is minted and reused for 50 minutes.
const TOKEN_TTL_MS = 50 * 60 * 1000
const APNS_PROD_HOST = 'https://api.push.apple.com'
const APNS_SANDBOX_HOST = 'https://api.sandbox.push.apple.com'

let cached: { token: string; mintedAt: number } | null = null

export function resetPushTokenCache() {
  cached = null
}

type ApnsConfig = {
  keyId: string
  teamId: string
  privateKeyPem: string
  bundleId: string
  host: string
}

function readConfig(): ApnsConfig {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  // The .p8 contents live in an env var, not a file: Vercel has no persistent
  // filesystem to read a key from at request time.
  const privateKeyPem = process.env.APNS_PRIVATE_KEY
  const bundleId = process.env.APNS_BUNDLE_ID

  if (!keyId || !teamId || !privateKeyPem || !bundleId) {
    throw new Error('Push not configured')
  }

  return {
    keyId,
    teamId,
    privateKeyPem: privateKeyPem.replace(/\\n/g, '\n'),
    bundleId,
    host: process.env.APNS_ENVIRONMENT === 'sandbox' ? APNS_SANDBOX_HOST : APNS_PROD_HOST,
  }
}

/**
 * Mints the ES256 provider token APNs authenticates with.
 *
 * Same mechanism as scripts/generate-apple-secret.mjs, including the
 * `ieee-p1363` DSA encoding — the DER default produces signatures Apple
 * rejects.
 */
export function buildProviderToken(config: Pick<ApnsConfig, 'keyId' | 'teamId' | 'privateKeyPem'>, now: number) {
  const header = { alg: 'ES256', kid: config.keyId }
  const payload = { iss: config.teamId, iat: Math.floor(now / 1000) }

  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const unsigned = `${encode(header)}.${encode(payload)}`

  const signature = createSign('sha256')
    .update(unsigned)
    .sign({ key: createPrivateKey(config.privateKeyPem), dsaEncoding: 'ieee-p1363' })

  return `${unsigned}.${Buffer.from(signature).toString('base64url')}`
}

function providerToken(config: ApnsConfig): string {
  if (cached && Date.now() - cached.mintedAt < TOKEN_TTL_MS) return cached.token

  const token = buildProviderToken(config, Date.now())
  cached = { token, mintedAt: Date.now() }
  return token
}

export type PushResult = { ok: boolean; unregistered: boolean; status: number }

/**
 * Sends one alert notification.
 *
 * `unregistered` is the signal that matters operationally: APNs answers 410
 * when the app has been deleted, and that token must be dropped or every
 * later send wastes a request on a device that no longer exists.
 */
export async function sendPushNotification(
  deviceToken: string,
  message: { title: string; body: string }
): Promise<PushResult> {
  const config = readConfig()
  const client = connect(config.host)

  try {
    return await new Promise<PushResult>((resolve, reject) => {
      client.on('error', reject)

      const request = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken(config)}`,
        'apns-topic': config.bundleId,
        'apns-push-type': 'alert',
      })

      let status = 0
      request.on('response', (headers) => {
        status = Number(headers[':status']) || 0
      })

      let body = ''
      request.setEncoding('utf8')
      request.on('data', (chunk) => {
        body += chunk
      })

      request.on('end', () => {
        if (status !== 200) {
          console.error(`APNs send failed (${status}): ${body}`)
        }
        resolve({ ok: status === 200, unregistered: status === 410, status })
      })

      request.on('error', reject)

      request.end(
        JSON.stringify({
          aps: { alert: { title: message.title, body: message.body }, sound: 'default' },
        })
      )
    })
  } finally {
    client.close()
  }
}
