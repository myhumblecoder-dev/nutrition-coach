import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'
import { verifyChallenge } from '@/lib/attest'

const originalEnv = process.env

describe('POST /api/v1/attest/challenge', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AUTH_SECRET: 'test-secret',
      AUTH_APPLE_BUNDLE_ID: 'dev.myhumblecoder.nutritioncoach',
      APPLE_TEAM_ID: 'S84D3BXRYL',
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('mints a challenge the verifier accepts', async () => {
    const { challenge } = await (await POST()).json()

    expect(verifyChallenge(challenge)).toBe(true)
  })

  it('never mints the same challenge twice', async () => {
    const a = await (await POST()).json()
    const b = await (await POST()).json()

    expect(a.challenge).not.toBe(b.challenge)
  })

  it('500s rather than issuing an unusable challenge when unconfigured', async () => {
    process.env = { ...originalEnv, AUTH_APPLE_BUNDLE_ID: undefined, APPLE_TEAM_ID: undefined }

    expect((await POST()).status).toBe(500)
  })
})
