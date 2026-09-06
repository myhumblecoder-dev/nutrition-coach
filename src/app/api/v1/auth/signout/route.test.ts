import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { revokeBearerSession } from '@/lib/apiAuth'

vi.mock('@/lib/apiAuth', () => ({ revokeBearerSession: vi.fn() }))

const mockRevoke = vi.mocked(revokeBearerSession)

describe('POST /api/v1/auth/signout', () => {
  beforeEach(() => vi.resetAllMocks())

  it('revokes the presented session', async () => {
    mockRevoke.mockResolvedValue(1)
    const request = new Request('http://test/api/v1/auth/signout', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + 'a'.repeat(64) },
    })

    const res = await POST(request)

    expect(res.status).toBe(200)
    expect(mockRevoke).toHaveBeenCalledWith(request)
  })

  it('still succeeds when the token is already gone', async () => {
    // Idempotent by design: a client retrying after a lost response must be
    // able to clear its Keychain without handling a spurious error.
    mockRevoke.mockResolvedValue(0)

    const res = await POST(
      new Request('http://test/api/v1/auth/signout', { method: 'POST' })
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
  })
})
