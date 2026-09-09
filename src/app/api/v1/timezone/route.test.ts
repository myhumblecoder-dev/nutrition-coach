import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PUT } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { user: { update: vi.fn() } } }))

const mockAuth = vi.mocked(authenticateBearer)
const mockUpdate = vi.mocked(prisma.user.update)

function put(body: unknown) {
  return new Request('http://test/api/v1/timezone', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

describe('PUT /api/v1/timezone', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUpdate.mockResolvedValue({ timezone: 'Europe/London' } as never)
  })

  it('returns 401 without a bearer and writes nothing', async () => {
    mockAuth.mockResolvedValue(null)

    expect((await PUT(put({ timezone: 'Europe/London' }))).status).toBe(401)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('stores a real IANA zone against the signed-in user', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await PUT(put({ timezone: 'Europe/London' }))

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { timezone: 'Europe/London' },
    })
    expect(await res.json()).toEqual({ timezone: 'Europe/London' })
  })

  it('refuses a zone the runtime does not recognise', async () => {
    // It arrives from a client. Storing nonsense would silently move the
    // user's whole day boundary back to the app default with no sign of why.
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await PUT(put({ timezone: 'Mars/Olympus_Mons' }))

    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects a body with no timezone', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    expect((await PUT(put({}))).status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/timezone', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without a bearer', async () => {
    mockAuth.mockResolvedValue(null)

    expect((await GET(new Request('http://test/api/v1/timezone'))).status).toBe(401)
  })

  it('reports the default for a user who has never set one', async () => {
    // Settings has to show something. The default is what their day is
    // actually being measured in, so showing it is honest rather than blank.
    mockAuth.mockResolvedValue({ id: 'user-1', timezone: null } as never)

    expect(await (await GET(new Request('http://test/api/v1/timezone'))).json()).toEqual({
      timezone: 'America/New_York',
    })
  })

  it('reports what they chose', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1', timezone: 'Asia/Tokyo' } as never)

    expect(await (await GET(new Request('http://test/api/v1/timezone'))).json()).toEqual({
      timezone: 'Asia/Tokyo',
    })
  })
})
