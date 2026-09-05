import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, DELETE } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { registerDeviceToken, unregisterDeviceToken } from '@/lib/devices'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/devices', () => ({
  registerDeviceToken: vi.fn(),
  unregisterDeviceToken: vi.fn(),
}))

const mockAuth = vi.mocked(authenticateBearer)
const mockRegister = vi.mocked(registerDeviceToken)
const mockUnregister = vi.mocked(unregisterDeviceToken)

const TOKEN = 'a1b2c3d4'.repeat(8)

function request(method: string, body: unknown) {
  return new Request('http://test/api/v1/devices', { method, body: JSON.stringify(body) })
}

describe('POST /api/v1/devices', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without a valid bearer and registers nothing', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST(request('POST', { token: TOKEN }))

    expect(res.status).toBe(401)
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('binds the token to the authenticated user, not one named in the body', async () => {
    // The body must never choose the owner — that would let any signed-in
    // user redirect another account's notifications to their own device.
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    await POST(request('POST', { token: TOKEN, userId: 'someone-else' }))

    expect(mockRegister).toHaveBeenCalledWith('user-1', TOKEN, 'ios')
  })

  it.each([
    ['a missing token', {}],
    ['a non-hex token', { token: 'not-a-token' }],
    ['a short token', { token: 'abc' }],
  ])('rejects %s', async (_label, body) => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(request('POST', body))

    expect(res.status).toBe(400)
    expect(mockRegister).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/v1/devices', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without a valid bearer and deletes nothing', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await DELETE(request('DELETE', { token: TOKEN }))

    expect(res.status).toBe(401)
    expect(mockUnregister).not.toHaveBeenCalled()
  })

  it('succeeds even when the token is already gone', async () => {
    // Toggling notifications off twice must not surface an error.
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockUnregister.mockResolvedValue(0)

    const res = await DELETE(request('DELETE', { token: TOKEN }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
  })
})
