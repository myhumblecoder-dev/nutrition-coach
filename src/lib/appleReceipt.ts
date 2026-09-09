import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SignedDataVerifier, Environment } from '@apple/app-store-server-library'

/**
 * Verifies the signed data Apple sends — the transaction the app posts after a
 * purchase, and the notifications that follow it.
 *
 * Signature verification *is* the authentication here. The notification
 * endpoint has no bearer token because Apple calls it, so an unsigned or
 * badly-signed payload is the only thing standing between this and anybody
 * granting themselves a subscription with a POST.
 *
 * Roots come from disk rather than the network: a trust anchor fetched at
 * runtime is not a trust anchor. See `certs/apple/README.md`.
 */
const ROOT_FILES = [
  'AppleIncRootCertificate.cer',
  'AppleRootCA-G2.cer',
  'AppleRootCA-G3.cer',
]

function appleRootCertificates(): Buffer[] {
  const dir = join(process.cwd(), 'certs', 'apple')

  return ROOT_FILES.map((file) => readFileSync(join(dir, file)))
}

function environment(): Environment {
  return process.env.APPLE_IAP_ENVIRONMENT === 'Sandbox'
    ? Environment.SANDBOX
    : Environment.PRODUCTION
}

let cached: SignedDataVerifier | null = null

/**
 * Built once and reused. Reading three certificates and parsing them on every
 * request would be pure waste, and the inputs cannot change without a deploy.
 */
export function verifier(): SignedDataVerifier {
  if (cached) return cached

  const bundleId = process.env.AUTH_APPLE_BUNDLE_ID
  if (!bundleId) {
    throw new Error('AUTH_APPLE_BUNDLE_ID is required to verify App Store data')
  }

  // Online checks are OCSP revocation lookups against Apple. Off: they add a
  // network round trip to a path the user is waiting on, and the signature and
  // certificate chain are what actually matter here.
  cached = new SignedDataVerifier(
    appleRootCertificates(),
    false,
    environment(),
    bundleId,
    appAppleId()
  )

  return cached
}

/**
 * Apple's numeric app id. Required by the verifier in production and rejected
 * in sandbox, which is why it is read rather than hardcoded.
 */
function appAppleId(): number | undefined {
  const raw = Number(process.env.APPLE_APP_APPLE_ID)

  return Number.isFinite(raw) && raw > 0 ? raw : undefined
}

/** Verifies a `Transaction.jwsRepresentation` posted by the app. */
export async function verifyTransaction(signedTransaction: string) {
  return verifier().verifyAndDecodeTransaction(signedTransaction)
}

/** Verifies a `signedPayload` from App Store Server Notifications V2. */
export async function verifyNotification(signedPayload: string) {
  return verifier().verifyAndDecodeNotification(signedPayload)
}

/** Test seam: forget the memoised verifier so a new environment takes effect. */
export function resetVerifier() {
  cached = null
}
