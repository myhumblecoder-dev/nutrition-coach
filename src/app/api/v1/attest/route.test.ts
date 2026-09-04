import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { registerAttestation } from '@/lib/attest'
import { authenticateBearer } from '@/lib/apiAuth'

vi.mock('@/lib/attest', () => ({ registerAttestation: vi.fn() }))
vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))

const mockRegister = vi.mocked(registerAttestation)
const mockAuth = vi.mocked(authenticateBearer)

const body = { keyId: 'key-1', attestation: 'YXR0', challenge: 'a.1.b' }

const req = (b: unknown, headers: Record<string, string> = {}) =>
  new Request('http://test/api/v1/attest', { method: 'POST', body: JSON.stringify(b), headers })

describe('POST /api/v1/attest', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each([
    ['a missing keyId', { attestation: 'a', challenge: 'c' }],
    ['a missing attestation', { keyId: 'k', challenge: 'c' }],
    ['a missing challenge', { keyId: 'k', attestation: 'a' }],
  ])('rejects %s', async (_label, b) => {
    const res = await POST(req(b))

    expect(res.status).toBe(400)
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('registers a device that has not signed in yet', async () => {
    // Attestation happens at first launch, which may be before the user has
    // an account — requiring a session here would make the gate unusable.
    mockAuth.mockResolvedValue(null)

    const res = await POST(req(body))

    expect(res.status).toBe(200)
    expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({ userId: undefined }))
  })

  it('links the device to the session when there is one', async () => {
    mockAuth.mockResolvedValue({ id: 'u1' } as never)

    await POST(req(body, { authorization: 'Bearer t' }))

    expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }))
  })

  it('401s without leaking why the attestation failed', async () => {
    mockAuth.mockResolvedValue(null)
    mockRegister.mockRejectedValue(new Error('certificate chain did not validate'))

    const res = await POST(req(body))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Attestation failed' })
  })
})
