import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { verifyAttestation, verifyAssertion } from 'node-app-attest'
import { prisma } from '@/lib/db'

// App Attest proves a request came from a genuine, unmodified instance of this
// app on real Apple hardware. A bearer token only proves someone signed in
// once; it says nothing about what is making the request now, so a leaked
// token can be replayed from a script forever. Attestation closes that.

const CHALLENGE_TTL_MS = 5 * 60 * 1000

export type AttestConfig = {
  bundleIdentifier: string
  teamIdentifier: string
  allowDevelopmentEnvironment: boolean
}

/**
 * Enforcement is opt-in so the server can ship before the client does.
 * Turning this on without a client that sends assertions locks everyone out.
 */
export function attestRequired(): boolean {
  return process.env.APP_ATTEST_REQUIRED === 'true'
}

export function attestConfig(): AttestConfig | null {
  const bundleIdentifier = process.env.AUTH_APPLE_BUNDLE_ID
  const teamIdentifier = process.env.APPLE_TEAM_ID
  if (!bundleIdentifier || !teamIdentifier) return null

  return {
    bundleIdentifier,
    teamIdentifier,
    // Debug builds attest against Apple's development environment, which
    // produces a different aaguid. Must never be true in production.
    allowDevelopmentEnvironment: process.env.APP_ATTEST_ALLOW_DEV === 'true',
  }
}

function challengeKey(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  // Domain separation: the challenge key is derived from AUTH_SECRET rather
  // than being AUTH_SECRET, so a leak in one context is not a leak in both.
  return createHmac('sha256', secret).update('app-attest-challenge').digest()
}

/**
 * A stateless, self-verifying challenge.
 *
 * Signed and timestamped rather than stored, so there is no table to grow and
 * no cleanup job to forget. The HMAC is what stops a client minting its own.
 */
export function createChallenge(now: number = Date.now()): string {
  const nonce = randomBytes(16).toString('hex')
  const body = `${nonce}.${now}`
  const mac = createHmac('sha256', challengeKey()).update(body).digest('hex')
  return `${body}.${mac}`
}

export function verifyChallenge(challenge: string, now: number = Date.now()): boolean {
  const parts = challenge.split('.')
  if (parts.length !== 3) return false

  const [nonce, issuedAt, mac] = parts
  const expected = createHmac('sha256', challengeKey()).update(`${nonce}.${issuedAt}`).digest('hex')

  const given = Buffer.from(mac, 'hex')
  const want = Buffer.from(expected, 'hex')
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false

  const age = now - Number(issuedAt)
  return Number.isFinite(age) && age >= 0 && age < CHALLENGE_TTL_MS
}

export type AttestationInput = {
  keyId: string
  attestation: string
  challenge: string
  userId?: string
}

/**
 * Verifies a first-launch attestation and stores the attested public key.
 *
 * Throws rather than returning a result: every failure here means the caller
 * is not what it claims to be, and there is no partial success worth reporting.
 */
export async function registerAttestation(input: AttestationInput): Promise<void> {
  const config = attestConfig()
  if (!config) throw new Error('App Attest is not configured')

  if (!verifyChallenge(input.challenge)) {
    throw new Error('Challenge is invalid or expired')
  }

  const { keyId, publicKey } = verifyAttestation({
    attestation: Buffer.from(input.attestation, 'base64'),
    challenge: input.challenge,
    keyId: input.keyId,
    ...config,
  })

  // Upsert: a reinstall generates a fresh key, but a retried registration of
  // the same key must not collide on the unique.
  //
  // userId is only written when this call carries one. Re-attesting is
  // routinely unauthenticated (it happens at launch, before sign-in), and
  // writing `?? null` there would erase the link on every cold start.
  await prisma.attestedDevice.upsert({
    where: { keyId },
    create: { keyId, publicKey, signCount: 0, userId: input.userId ?? null },
    update: { publicKey, ...(input.userId ? { userId: input.userId } : {}) },
  })
}

/**
 * Records which account an already-attested device belongs to.
 *
 * Separate from registration because the device attests at first launch and
 * signs in later, so the link can only be made on the sign-in path.
 *
 * updateMany rather than update: it must not throw when the row is gone (a
 * pruned device, a race with a reinstall). Failing to record the link is not
 * a reason to fail an otherwise valid sign-in.
 */
export async function linkAttestedDevice(keyId: string, userId: string): Promise<void> {
  await prisma.attestedDevice.updateMany({ where: { keyId }, data: { userId } })
}

export type AssertionResult = { ok: true } | { ok: false; reason: string }

/**
 * Verifies the per-request assertion.
 *
 * The signed payload is the request body, so an assertion cannot be lifted
 * from one call and replayed onto another. `signCount` must strictly increase,
 * which is what makes a captured assertion useless the second time.
 */
export async function verifyRequestAssertion(
  keyId: string,
  assertionBase64: string,
  payload: string
): Promise<AssertionResult> {
  const config = attestConfig()
  if (!config) return { ok: false, reason: 'not configured' }

  const device = await prisma.attestedDevice.findUnique({ where: { keyId } })
  if (!device) return { ok: false, reason: 'unknown key' }

  let signCount: number
  try {
    ;({ signCount } = verifyAssertion({
      assertion: Buffer.from(assertionBase64, 'base64'),
      payload,
      publicKey: device.publicKey,
      signCount: device.signCount,
      bundleIdentifier: config.bundleIdentifier,
      teamIdentifier: config.teamIdentifier,
    }))
  } catch (error) {
    // The reason is logged, never returned: distinguishing a bad signature
    // from a stale counter only helps someone probing the endpoint.
    console.error(
      'assertion rejected: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
    return { ok: false, reason: 'invalid assertion' }
  }

  await prisma.attestedDevice.update({ where: { keyId }, data: { signCount } })
  return { ok: true }
}

/**
 * Gate for the v1 routes. `blocked` is a Response to return as-is, or null
 * when the request may proceed.
 *
 * `keyId` is set only when an assertion actually verified, so it is safe to
 * attribute a request to that device. It is null while enforcement is off,
 * where the header is unverified client input and must not be trusted.
 *
 * Reads the body text so the assertion can be checked against exactly what was
 * sent; callers pass it in rather than re-reading a consumed stream.
 */
export type AttestationGate =
  | { blocked: Response; keyId: null }
  | { blocked: null; keyId: string | null }

export async function requireAttestation(
  request: Request,
  body = ''
): Promise<AttestationGate> {
  if (!attestRequired()) return { blocked: null, keyId: null }

  // A GET has no body to bind the assertion to, so the path is signed
  // instead. Weaker than a body — two GETs to the same path are
  // interchangeable — but the strictly increasing counter still makes any
  // single assertion single-use.
  const payload = body || new URL(request.url).pathname

  const keyId = request.headers.get('x-attest-key-id')
  const assertion = request.headers.get('x-attest-assertion')

  if (!keyId || !assertion) {
    return {
      blocked: Response.json({ error: 'Attestation required' }, { status: 401 }),
      keyId: null,
    }
  }

  const result = await verifyRequestAssertion(keyId, assertion, payload)
  if (!result.ok) {
    return {
      blocked: Response.json({ error: 'Attestation failed' }, { status: 401 }),
      keyId: null,
    }
  }

  return { blocked: null, keyId }
}
