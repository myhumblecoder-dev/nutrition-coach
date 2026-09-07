import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PUT } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { getTargetForUser, setTargetForUser } from '@/lib/targets'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/attest', () => ({ requireAttestation: vi.fn() }))
vi.mock('@/lib/targets', async (importOriginal) => ({
  // targetSchema is exercised for real: the bounds are the contract.
  ...(await importOriginal<typeof import('@/lib/targets')>()),
  getTargetForUser: vi.fn(),
  setTargetForUser: vi.fn(),
}))

const put = (body: unknown) =>
  new Request('http://test/api/v1/targets', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { authorization: 'Bearer t' },
  })

describe('/api/v1/targets', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(requireAttestation).mockResolvedValue({ blocked: null, keyId: null })
    vi.mocked(authenticateBearer).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(setTargetForUser).mockResolvedValue({ calories: 2000, protein: 150 } as never)
  })

  it('saves a target and echoes what was stored', async () => {
    const res = await PUT(put({ calories: 2000, protein: 150 }))

    expect(res.status).toBe(200)
    expect(setTargetForUser).toHaveBeenCalledWith('u1', { calories: 2000, protein: 150 })
    await expect(res.json()).resolves.toEqual({ target: { calories: 2000, protein: 150 } })
  })

  it('401s without a bearer and writes nothing', async () => {
    vi.mocked(authenticateBearer).mockResolvedValue(null)

    expect((await PUT(put({ calories: 2000, protein: 150 }))).status).toBe(401)
    expect(setTargetForUser).not.toHaveBeenCalled()
  })

  it('rejects an out-of-range target and says what the range is', async () => {
    // The client shows this message, so it has to be useful on its own.
    const res = await PUT(put({ calories: 90000, protein: 150 }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'calories must be 500–10000 and protein 20–500',
    })
    expect(setTargetForUser).not.toHaveBeenCalled()
  })

  it('GET returns null when nothing is set', async () => {
    vi.mocked(getTargetForUser).mockResolvedValue(null)

    const res = await GET(new Request('http://test/api/v1/targets', {
      headers: { authorization: 'Bearer t' },
    }))

    await expect(res.json()).resolves.toEqual({ target: null })
  })

  it('returns the attestation refusal untouched', async () => {
    vi.mocked(requireAttestation).mockResolvedValue({
      blocked: Response.json({ error: 'Attestation required' }, { status: 401 }),
      keyId: null,
    })

    expect((await PUT(put({ calories: 2000, protein: 150 }))).status).toBe(401)
    expect(authenticateBearer).not.toHaveBeenCalled()
  })
})
