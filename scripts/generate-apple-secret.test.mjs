import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, verify as cryptoVerify } from 'node:crypto'
import { generateAppleClientSecret } from './generate-apple-secret.mjs'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })

const NOW = 1_760_000_000_000 // fixed epoch ms so claims are deterministic

async function makeToken() {
  return generateAppleClientSecret({
    privateKeyPem,
    teamId: 'TEAM123456',
    keyId: 'KEY1234567',
    clientId: 'com.example.app.web',
    now: NOW,
  })
}

function decodeSegment(seg) {
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'))
}

describe('generateAppleClientSecret', () => {
  it('emits the required header and claims', async () => {
    const { token } = await makeToken()
    const [h, p] = token.split('.')

    expect(decodeSegment(h)).toEqual({ alg: 'ES256', kid: 'KEY1234567' })
    const payload = decodeSegment(p)
    expect(payload.iss).toBe('TEAM123456')
    expect(payload.sub).toBe('com.example.app.web')
    expect(payload.aud).toBe('https://appleid.apple.com')
    expect(payload.iat).toBe(Math.floor(NOW / 1000))
  })

  it('signs with ES256 in ieee-p1363 form so the JWT verifies', async () => {
    const { token } = await makeToken()
    const [h, p, s] = token.split('.')

    const valid = cryptoVerify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(s, 'base64url')
    )
    expect(valid).toBe(true)
    // ieee-p1363 ES256 signatures are exactly 64 bytes (r||s) — a DER
    // signature would be variable-length and rejected by Apple.
    expect(Buffer.from(s, 'base64url')).toHaveLength(64)
  })

  it('keeps the expiry inside Apple\'s six-month cap', async () => {
    const { token, expiresAt } = await makeToken()
    const payload = decodeSegment(token.split('.')[1])

    expect(payload.exp - payload.iat).toBeLessThanOrEqual(15777000)
    expect(payload.exp).toBeGreaterThan(payload.iat)
    expect(new Date(expiresAt).getTime()).toBe(payload.exp * 1000)
  })
})
