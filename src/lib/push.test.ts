import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPairSync, createVerify, type KeyObject } from 'node:crypto'
import { buildProviderToken } from './push'

// The provider token is the whole of APNs authentication, so it is verified
// against a real signature rather than snapshotted.

let privateKeyPem: string
let publicKey: KeyObject

beforeAll(() => {
  const { privateKey, publicKey: pub } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  publicKey = pub
})

const NOW = Date.UTC(2026, 8, 2, 12, 0, 0)

function config() {
  return { keyId: 'ABC1234567', teamId: 'S84D3BXRYL', privateKeyPem }
}

function decode(segment: string) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString())
}

describe('buildProviderToken', () => {
  it('sets the ES256 header with the key id Apple looks up', () => {
    const [header] = buildProviderToken(config(), NOW).split('.')

    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'ABC1234567' })
  })

  it('claims the team as issuer with a second-precision iat', () => {
    const [, payload] = buildProviderToken(config(), NOW).split('.')

    expect(decode(payload)).toEqual({ iss: 'S84D3BXRYL', iat: Math.floor(NOW / 1000) })
  })

  it('produces a signature Apple can verify', () => {
    const token = buildProviderToken(config(), NOW)
    const [header, payload, signature] = token.split('.')

    const verified = createVerify('sha256')
      .update(`${header}.${payload}`)
      .verify(
        // ieee-p1363, not the DER default — Apple rejects DER signatures, the
        // same trap scripts/generate-apple-secret.mjs documents.
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url')
      )

    expect(verified).toBe(true)
  })

  it('does not verify under the DER encoding, proving ieee-p1363 is in use', () => {
    const token = buildProviderToken(config(), NOW)
    const [header, payload, signature] = token.split('.')

    const verifiedAsDer = createVerify('sha256')
      .update(`${header}.${payload}`)
      .verify({ key: publicKey, dsaEncoding: 'der' }, Buffer.from(signature, 'base64url'))

    expect(verifiedAsDer).toBe(false)
  })

  it('accepts a PEM whose newlines were escaped by the env var round trip', () => {
    // Vercel env vars carry the .p8 as a single line with literal \n.
    const escaped = privateKeyPem.replace(/\n/g, '\\n')

    expect(() =>
      buildProviderToken({ ...config(), privateKeyPem: escaped.replace(/\\n/g, '\n') }, NOW)
    ).not.toThrow()
  })
})
