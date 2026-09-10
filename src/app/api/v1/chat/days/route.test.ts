import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { getChatDaysForUser } from '@/lib/dashboard'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/dashboard', () => ({ getChatDaysForUser: vi.fn() }))

const mockAuth = vi.mocked(authenticateBearer)
const mockDays = vi.mocked(getChatDaysForUser)
const req = () => new Request('http://test/api/v1/chat/days')

describe('GET /api/v1/chat/days', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without a bearer and never queries', async () => {
    mockAuth.mockResolvedValue(null)

    expect((await GET(req())).status).toBe(401)
    expect(mockDays).not.toHaveBeenCalled()
  })

  it('lists the days, scoped to the authenticated user', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockDays.mockResolvedValue([
      { date: '2026-09-10', messageCount: 4 },
      { date: '2026-09-09', messageCount: 12 },
    ])

    const res = await GET(req())

    expect(mockDays).toHaveBeenCalledWith('user-1')
    expect(await res.json()).toEqual({
      days: [
        { date: '2026-09-10', messageCount: 4 },
        { date: '2026-09-09', messageCount: 12 },
      ],
    })
  })

  it('is an empty list for a brand-new account', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockDays.mockResolvedValue([])

    expect(await (await GET(req())).json()).toEqual({ days: [] })
  })
})
