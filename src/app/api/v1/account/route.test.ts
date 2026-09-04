import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { prisma } from '@/lib/db'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/attest', () => ({ requireAttestation: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { user: { delete: vi.fn() } } }))

const mockAuth = vi.mocked(authenticateBearer)
const mockAttest = vi.mocked(requireAttestation)
const mockDelete = vi.mocked(prisma.user.delete)

const req = (body: unknown) =>
  new Request('http://test/api/v1/account', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { authorization: 'Bearer t' },
  })

describe('DELETE /api/v1/account', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAttest.mockResolvedValue({ blocked: null, keyId: null })
    mockAuth.mockResolvedValue({ id: 'u1' } as never)
  })

  it('deletes the signed-in user', async () => {
    const res = await DELETE(req({ confirm: 'DELETE' }))

    expect(res.status).toBe(200)
    // One delete, scoped to the bearer's user — every related table cascades.
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'u1' } })
  })

  it('401s without a valid bearer, and deletes nothing', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await DELETE(req({ confirm: 'DELETE' }))

    expect(res.status).toBe(401)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('returns the attestation gate refusal untouched', async () => {
    // A blocked request must never reach the delete, and must not be turned
    // into some other status on the way out.
    mockAttest.mockResolvedValue({
      blocked: Response.json({ error: 'Attestation required' }, { status: 401 }),
      keyId: null,
    })

    const res = await DELETE(req({ confirm: 'DELETE' }))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Attestation required' })
    expect(mockAuth).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it.each([
    ['no confirmation', {}],
    ['the wrong phrase', { confirm: 'delete' }],
    ['a non-string', { confirm: true }],
  ])('refuses %s', async (_label, body) => {
    const res = await DELETE(req(body))

    expect(res.status).toBe(400)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('refuses a body that is not JSON at all', async () => {
    const res = await DELETE(
      new Request('http://test/api/v1/account', {
        method: 'DELETE',
        body: 'not json',
        headers: { authorization: 'Bearer t' },
      })
    )

    expect(res.status).toBe(400)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('tolerates surrounding whitespace in the confirmation', async () => {
    await DELETE(req({ confirm: '  DELETE  ' }))

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'u1' } })
  })

  it('signs the assertion over the body, not the path', async () => {
    // The confirmation is what the assertion binds to. Passing the raw text
    // through is what stops an assertion for some other call being replayed
    // onto an account deletion.
    await DELETE(req({ confirm: 'DELETE' }))

    expect(mockAttest).toHaveBeenCalledWith(expect.anything(), JSON.stringify({ confirm: 'DELETE' }))
  })
})
