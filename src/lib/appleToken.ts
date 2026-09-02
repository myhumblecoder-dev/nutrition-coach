import { createRemoteJWKSet, jwtVerify } from 'jose'

// Apple signs identity tokens with rotating keys, so the key set is fetched
// rather than pinned. jose caches it and only refetches on an unknown kid,
// which is what makes this safe to call per sign-in.
const APPLE_ISSUER = 'https://appleid.apple.com'
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys')

const jwks = createRemoteJWKSet(APPLE_JWKS_URL)

export type AppleIdentity = {
  sub: string
  email: string | null
  emailVerified: boolean
}

/**
 * Verifies a Sign in with Apple identity token from a native client.
 *
 * The audience is the app's Bundle ID, NOT the Services ID the web flow uses:
 * a native ASAuthorizationController issues tokens whose `aud` is the bundle
 * identifier, so passing the Services ID here would reject every real token.
 */
export async function verifyAppleIdentityToken(
  idToken: string,
  audience: string
): Promise<AppleIdentity> {
  // jwtVerify checks signature, `iss`, `aud`, and `exp`/`nbf` — an expired or
  // wrong-audience token throws here rather than reaching the claim reads.
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: APPLE_ISSUER,
    audience,
  })

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Apple token has no subject')
  }

  // Apple sends email_verified as a boolean in some responses and the string
  // "true" in others — the same quirk src/auth.config.ts handles for the web.
  const rawVerified = payload.email_verified
  const emailVerified = rawVerified === true || rawVerified === 'true'

  const email = typeof payload.email === 'string' ? payload.email : null

  return { sub: payload.sub, email, emailVerified }
}
