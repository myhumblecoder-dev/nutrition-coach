import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair, type JWK, type CryptoKey } from 'jose'
import { verifyAppleIdentityToken } from './appleToken'

// Verification is the app's entire security boundary, so these tests exercise
// the real jose verification against a real signature rather than mocking it.
// Only Apple's key endpoint is faked.

const BUNDLE_ID = 'dev.myhumblecoder.nutritioncoach'
const ISSUER = 'https://appleid.apple.com'

let applePrivateKey: CryptoKey
let appleJwk: JWK
let attackerPrivateKey: CryptoKey

beforeAll(async () => {
  const apple = await generateKeyPair('RS256', { extractable: true })
  applePrivateKey = apple.privateKey
  appleJwk = { ...(await exportJWK(apple.publicKey)), kid: 'apple-key-1', alg: 'RS256', use: 'sig' }

  // A well-formed token signed by a key Apple does not publish.
  const attacker = await generateKeyPair('RS256', { extractable: true })
  attackerPrivateKey = attacker.privateKey
})

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ keys: [appleJwk] }), {
      headers: { 'content-type': 'application/json' },
    }))
  )
})

type Claims = {
  aud?: string
  iss?: string
  sub?: string
  expiresIn?: string | number
  email?: string
  email_verified?: boolean | string
}

function signToken(claims: Claims = {}, key: CryptoKey = applePrivateKey) {
  const {
    aud = BUNDLE_ID,
    iss = ISSUER,
    sub = 'apple-sub-000',
    expiresIn = '10m',
    ...rest
  } = claims

  return new SignJWT({ ...rest })
    .setProtectedHeader({ alg: 'RS256', kid: 'apple-key-1' })
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key)
}

describe('verifyAppleIdentityToken', () => {
  it('accepts a valid token and returns the identity', async () => {
    const token = await signToken({ email: 'thomas@example.com', email_verified: true })

    await expect(verifyAppleIdentityToken(token, BUNDLE_ID)).resolves.toEqual({
      sub: 'apple-sub-000',
      email: 'thomas@example.com',
      emailVerified: true,
    })
  })

  it('treats the string "true" as verified, as Apple sometimes sends it', async () => {
    const token = await signToken({ email: 'thomas@example.com', email_verified: 'true' })

    await expect(verifyAppleIdentityToken(token, BUNDLE_ID)).resolves.toMatchObject({
      emailVerified: true,
    })
  })

  it('reports an absent email as null rather than inventing one', async () => {
    // Apple omits email on every sign-in after the first.
    const token = await signToken()

    await expect(verifyAppleIdentityToken(token, BUNDLE_ID)).resolves.toMatchObject({
      email: null,
      emailVerified: false,
    })
  })

  it('rejects a token signed by a key Apple did not publish', async () => {
    const token = await signToken({}, attackerPrivateKey)

    await expect(verifyAppleIdentityToken(token, BUNDLE_ID)).rejects.toThrow()
  })

  it('rejects a token minted for the web Services ID', async () => {
    // The exact confusion this endpoint exists to prevent: a web-flow token
    // must not authenticate a native client.
    const token = await signToken({ aud: 'dev.myhumblecoder.nutritioncoach.web' })

    await expect(verifyAppleIdentityToken(token, BUNDLE_ID)).rejects.toThrow()
  })

  it('rejects an expired token', async () => {
    const token = await signToken({ expiresIn: '-1s' })

    await expect(verifyAppleIdentityToken(token, BUNDLE_ID)).rejects.toThrow()
  })

  it('rejects a token from another issuer', async () => {
    const token = await signToken({ iss: 'https://evil.example.com' })

    await expect(verifyAppleIdentityToken(token, BUNDLE_ID)).rejects.toThrow()
  })

  it('rejects a garbage token', async () => {
    await expect(verifyAppleIdentityToken('not-a-jwt', BUNDLE_ID)).rejects.toThrow()
  })
})
