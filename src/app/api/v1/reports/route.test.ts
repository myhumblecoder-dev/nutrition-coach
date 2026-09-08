import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { recordReport } from '@/lib/reports'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/attest', () => ({ requireAttestation: vi.fn() }))
vi.mock('@/lib/reports', async (importOriginal) => ({
  // reportSchema is exercised for real — the bounds are the contract.
  ...(await importOriginal<typeof import('@/lib/reports')>()),
  recordReport: vi.fn(),
}))

const post = (body: unknown) =>
  new Request('http://test/api/v1/reports', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { authorization: 'Bearer t' },
  })

describe('POST /api/v1/reports', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(requireAttestation).mockResolvedValue({ blocked: null, keyId: null })
    vi.mocked(authenticateBearer).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(recordReport).mockResolvedValue({ id: 'r1' } as never)
  })

  it('records the reported reply against the reporting user', async () => {
    const res = await POST(post({ content: 'something objectionable', messageId: 'm1' }))

    expect(res.status).toBe(200)
    expect(recordReport).toHaveBeenCalledWith('u1', {
      content: 'something objectionable',
      messageId: 'm1',
    })
  })

  it('accepts a report without a message id', async () => {
    // A reply shown optimistically has no server id yet, and that is exactly
    // when someone is most likely to report it.
    await POST(post({ content: 'something objectionable' }))

    expect(recordReport).toHaveBeenCalledWith('u1', { content: 'something objectionable' })
  })

  it('401s without a bearer and records nothing', async () => {
    vi.mocked(authenticateBearer).mockResolvedValue(null)

    expect((await POST(post({ content: 'x' }))).status).toBe(401)
    expect(recordReport).not.toHaveBeenCalled()
  })

  it.each([
    ['empty content', { content: '' }],
    ['whitespace only', { content: '   ' }],
    ['no content at all', { messageId: 'm1' }],
  ])('rejects %s', async (_label, body) => {
    expect((await POST(post(body))).status).toBe(400)
    expect(recordReport).not.toHaveBeenCalled()
  })

  it('returns the attestation refusal untouched', async () => {
    vi.mocked(requireAttestation).mockResolvedValue({
      blocked: Response.json({ error: 'Attestation required' }, { status: 401 }),
      keyId: null,
    })

    expect((await POST(post({ content: 'x' }))).status).toBe(401)
    expect(authenticateBearer).not.toHaveBeenCalled()
  })
})
