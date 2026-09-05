import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  attestRequired,
  attestConfig,
  createChallenge,
  verifyChallenge,
  registerAttestation,
  linkAttestedDevice,
  verifyRequestAssertion,
  requireAttestation,
} from './attest'
import { prisma } from '@/lib/db'
import { verifyAttestation, verifyAssertion } from 'node-app-attest'

vi.mock('node-app-attest', () => ({ verifyAttestation: vi.fn(), verifyAssertion: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    attestedDevice: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}))

const mockPrisma = vi.mocked(prisma, true)
const mockVerifyAttestation = vi.mocked(verifyAttestation)
const mockVerifyAssertion = vi.mocked(verifyAssertion)

const originalEnv = process.env

function configured(extra: Record<string, string> = {}) {
  process.env = {
    ...originalEnv,
    AUTH_SECRET: 'test-secret',
    AUTH_APPLE_BUNDLE_ID: 'dev.myhumblecoder.nutritioncoach',
    APPLE_TEAM_ID: 'S84D3BXRYL',
    ...extra,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  configured()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('attestRequired', () => {
  it('is off unless explicitly switched on', () => {
    delete process.env.APP_ATTEST_REQUIRED
    expect(attestRequired()).toBe(false)

    process.env.APP_ATTEST_REQUIRED = 'false'
    expect(attestRequired()).toBe(false)

    // Enforcement must be opt-in: turning it on before a client that sends
    // assertions exists would lock every user out.
    process.env.APP_ATTEST_REQUIRED = 'true'
    expect(attestRequired()).toBe(true)
  })
})

describe('attestConfig', () => {
  it('is null when the identifiers are missing', () => {
    process.env = { ...originalEnv, AUTH_APPLE_BUNDLE_ID: undefined, APPLE_TEAM_ID: undefined }
    expect(attestConfig()).toBeNull()
  })

  it('defaults the development environment off', () => {
    // Accepting development attestations in production would accept any
    // simulator build.
    delete process.env.APP_ATTEST_ALLOW_DEV
    expect(attestConfig()?.allowDevelopmentEnvironment).toBe(false)
  })

  it('allows the development environment only when opted in', () => {
    configured({ APP_ATTEST_ALLOW_DEV: 'true' })
    expect(attestConfig()?.allowDevelopmentEnvironment).toBe(true)
  })
})

describe('challenges', () => {
  it('round-trips a freshly minted challenge', () => {
    expect(verifyChallenge(createChallenge())).toBe(true)
  })

  it('never mints the same challenge twice', () => {
    expect(createChallenge()).not.toBe(createChallenge())
  })

  it('rejects a challenge the client made up', () => {
    expect(verifyChallenge('abc.123.deadbeef')).toBe(false)
    expect(verifyChallenge('nonsense')).toBe(false)
    expect(verifyChallenge('')).toBe(false)
  })

  it('rejects a tampered timestamp', () => {
    // Moving the clock forward in the payload must invalidate the MAC, or the
    // TTL means nothing.
    const [nonce, issuedAt, mac] = createChallenge().split('.')
    expect(verifyChallenge(`${nonce}.${Number(issuedAt) + 1}.${mac}`)).toBe(false)
  })

  it('expires after five minutes', () => {
    const issued = Date.now()
    const challenge = createChallenge(issued)

    expect(verifyChallenge(challenge, issued + 4 * 60_000)).toBe(true)
    expect(verifyChallenge(challenge, issued + 6 * 60_000)).toBe(false)
  })

  it('rejects a challenge dated in the future', () => {
    const challenge = createChallenge(Date.now() + 60_000)
    expect(verifyChallenge(challenge, Date.now())).toBe(false)
  })

  it('does not verify under a different secret', () => {
    const challenge = createChallenge()
    configured({ AUTH_SECRET: 'a-different-secret' })

    expect(verifyChallenge(challenge)).toBe(false)
  })
})

describe('registerAttestation', () => {
  const input = {
    keyId: 'key-1',
    attestation: Buffer.from('attestation').toString('base64'),
    challenge: '',
  }

  it('refuses an expired or forged challenge before doing any crypto', async () => {
    await expect(
      registerAttestation({ ...input, challenge: 'forged.1.deadbeef' })
    ).rejects.toThrow(/challenge/i)
    expect(mockVerifyAttestation).not.toHaveBeenCalled()
  })

  it('verifies against the configured bundle and team', async () => {
    mockVerifyAttestation.mockReturnValue({ keyId: 'key-1', publicKey: 'PUBKEY' } as never)

    await registerAttestation({ ...input, challenge: createChallenge() })

    expect(mockVerifyAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        bundleIdentifier: 'dev.myhumblecoder.nutritioncoach',
        teamIdentifier: 'S84D3BXRYL',
        allowDevelopmentEnvironment: false,
      })
    )
  })

  it('stores the attested key with a zeroed counter', async () => {
    mockVerifyAttestation.mockReturnValue({ keyId: 'key-1', publicKey: 'PUBKEY' } as never)

    await registerAttestation({ ...input, challenge: createChallenge(), userId: 'u1' })

    expect(mockPrisma.attestedDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { keyId: 'key-1' },
        create: { keyId: 'key-1', publicKey: 'PUBKEY', signCount: 0, userId: 'u1' },
      })
    )
  })

  it('does not erase an existing link when re-attesting without a session', async () => {
    // Re-attestation happens at launch, before sign-in, so it routinely
    // carries no userId. Writing `?? null` there would unlink the device on
    // every cold start and destroy the only per-device signal we collect.
    mockVerifyAttestation.mockReturnValue({ keyId: 'key-1', publicKey: 'PUBKEY' } as never)

    await registerAttestation({ ...input, challenge: createChallenge() })

    const { update } = mockPrisma.attestedDevice.upsert.mock.calls[0][0]
    expect(update).toEqual({ publicKey: 'PUBKEY' })
    expect(update).not.toHaveProperty('userId')
  })

  it('writes the link when the registration does carry a session', async () => {
    mockVerifyAttestation.mockReturnValue({ keyId: 'key-1', publicKey: 'PUBKEY' } as never)

    await registerAttestation({ ...input, challenge: createChallenge(), userId: 'u1' })

    expect(mockPrisma.attestedDevice.upsert.mock.calls[0][0].update).toEqual({
      publicKey: 'PUBKEY',
      userId: 'u1',
    })
  })

  it('propagates a failed attestation rather than storing anything', async () => {
    mockVerifyAttestation.mockImplementation(() => {
      throw new Error('bad certificate chain')
    })

    await expect(
      registerAttestation({ ...input, challenge: createChallenge() })
    ).rejects.toThrow()
    expect(mockPrisma.attestedDevice.upsert).not.toHaveBeenCalled()
  })
})

describe('linkAttestedDevice', () => {
  it('records the account against the attested key', async () => {
    await linkAttestedDevice('key-1', 'u1')

    expect(mockPrisma.attestedDevice.updateMany).toHaveBeenCalledWith({
      where: { keyId: 'key-1' },
      data: { userId: 'u1' },
    })
  })

  it('does not throw when the device row is gone', async () => {
    // updateMany, not update: a pruned or reinstalled device must not turn an
    // otherwise valid sign-in into a 500.
    mockPrisma.attestedDevice.updateMany.mockResolvedValue({ count: 0 } as never)

    await expect(linkAttestedDevice('vanished', 'u1')).resolves.toBeUndefined()
  })
})

describe('verifyRequestAssertion', () => {
  it('rejects a key the server never attested', async () => {
    mockPrisma.attestedDevice.findUnique.mockResolvedValue(null as never)

    await expect(verifyRequestAssertion('nope', 'a', 'body')).resolves.toEqual({
      ok: false,
      reason: 'unknown key',
    })
  })

  it('checks the assertion against the exact request body', async () => {
    // Signing the body is what stops an assertion being lifted from one call
    // and replayed onto a different one.
    mockPrisma.attestedDevice.findUnique.mockResolvedValue({
      keyId: 'k', publicKey: 'PUBKEY', signCount: 3,
    } as never)
    mockVerifyAssertion.mockReturnValue({ signCount: 4 } as never)

    await verifyRequestAssertion('k', 'assertion', '{"message":"hi"}')

    expect(mockVerifyAssertion).toHaveBeenCalledWith(
      expect.objectContaining({ payload: '{"message":"hi"}', signCount: 3, publicKey: 'PUBKEY' })
    )
  })

  it('advances the stored counter so the same assertion cannot be reused', async () => {
    mockPrisma.attestedDevice.findUnique.mockResolvedValue({
      keyId: 'k', publicKey: 'PUBKEY', signCount: 3,
    } as never)
    mockVerifyAssertion.mockReturnValue({ signCount: 4 } as never)

    await verifyRequestAssertion('k', 'assertion', 'body')

    expect(mockPrisma.attestedDevice.update).toHaveBeenCalledWith({
      where: { keyId: 'k' },
      data: { signCount: 4 },
    })
  })

  it('does not leak why an assertion failed', async () => {
    mockPrisma.attestedDevice.findUnique.mockResolvedValue({
      keyId: 'k', publicKey: 'PUBKEY', signCount: 9,
    } as never)
    mockVerifyAssertion.mockImplementation(() => {
      throw new Error('signCount did not increase')
    })

    const result = await verifyRequestAssertion('k', 'assertion', 'body')

    // Telling a prober that the signature was fine but the counter was stale
    // is a free hint.
    expect(result).toEqual({ ok: false, reason: 'invalid assertion' })
    expect(mockPrisma.attestedDevice.update).not.toHaveBeenCalled()
  })
})

describe('requireAttestation', () => {
  function requestWith(headers: Record<string, string> = {}) {
    return new Request('http://test/api/v1/chat', { method: 'POST', headers })
  }

  it('lets everything through while enforcement is off', async () => {
    delete process.env.APP_ATTEST_REQUIRED

    // keyId stays null: with the gate off the header is unverified client
    // input, and attributing a request to a device on that basis would let
    // anyone claim any device.
    await expect(
      requireAttestation(requestWith({ 'x-attest-key-id': 'claimed' }), 'body')
    ).resolves.toEqual({ blocked: null, keyId: null })
    expect(mockPrisma.attestedDevice.findUnique).not.toHaveBeenCalled()
  })

  it('401s a request with no attestation headers once enforced', async () => {
    configured({ APP_ATTEST_REQUIRED: 'true' })

    const gate = await requireAttestation(requestWith(), 'body')

    expect(gate.blocked?.status).toBe(401)
    expect(gate.keyId).toBeNull()
  })

  it('401s an assertion that does not verify', async () => {
    configured({ APP_ATTEST_REQUIRED: 'true' })
    mockPrisma.attestedDevice.findUnique.mockResolvedValue(null as never)

    const gate = await requireAttestation(
      requestWith({ 'x-attest-key-id': 'k', 'x-attest-assertion': 'a' }),
      'body'
    )

    expect(gate.blocked?.status).toBe(401)
    expect(gate.keyId).toBeNull()
  })

  it('hands back the verified key for a good assertion', async () => {
    configured({ APP_ATTEST_REQUIRED: 'true' })
    mockPrisma.attestedDevice.findUnique.mockResolvedValue({
      keyId: 'k', publicKey: 'PUBKEY', signCount: 1,
    } as never)
    mockVerifyAssertion.mockReturnValue({ signCount: 2 } as never)

    // The keyId is only surfaced once an assertion actually verified, which
    // is what makes it safe to attribute the request to that device.
    await expect(
      requireAttestation(requestWith({ 'x-attest-key-id': 'k', 'x-attest-assertion': 'a' }), 'body')
    ).resolves.toEqual({ blocked: null, keyId: 'k' })
  })
})
