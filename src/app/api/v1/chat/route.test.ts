import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST, maxDuration } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { getChatHistoryForUser } from '@/lib/dashboard'
import { coachReply } from '@/lib/chat'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/dashboard', () => ({ getChatHistoryForUser: vi.fn() }))
vi.mock('@/lib/chat', () => ({ coachReply: vi.fn() }))

const mockAuth = vi.mocked(authenticateBearer)
const mockHistory = vi.mocked(getChatHistoryForUser)
const mockCoach = vi.mocked(coachReply)

function postRequest(body: unknown) {
  return new Request('http://test/api/v1/chat', { method: 'POST', body: JSON.stringify(body) })
}

describe('GET /api/v1/chat', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without a valid bearer and never queries', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await GET(new Request('http://test/api/v1/chat'))

    expect(res.status).toBe(401)
    expect(mockHistory).not.toHaveBeenCalled()
  })

  it('returns the authenticated user history in chronological order', async () => {
    const at = new Date('2026-09-02T12:00:00.000Z')
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockHistory.mockResolvedValue([
      { id: 'c1', role: 'user', content: 'hi', createdAt: at },
      { id: 'c2', role: 'assistant', content: 'hello', createdAt: at },
    ])

    const body = await (await GET(new Request('http://test/api/v1/chat'))).json()

    expect(mockHistory).toHaveBeenCalledWith('user-1')
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual(['c1', 'c2'])
    expect(body.messages[0].createdAt).toBe(at.toISOString())
  })
})

describe('POST /api/v1/chat', () => {
  beforeEach(() => vi.resetAllMocks())

  it('allows the LLM round trip more than the default duration', () => {
    expect(maxDuration).toBe(60)
  })

  it('returns 401 without a valid bearer and never calls the LLM', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST(postRequest({ message: 'hi' }))

    expect(res.status).toBe(401)
    // The auth gate exists to stop strangers burning LLM budget, so this
    // assertion is the point of the test, not the status code.
    expect(mockCoach).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty message', { message: '   ' }],
    ['a missing message', {}],
    ['a non-string message', { message: 42 }],
  ])('rejects %s before reaching the LLM', async (_label, body) => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(postRequest(body))

    expect(res.status).toBe(400)
    expect(mockCoach).not.toHaveBeenCalled()
  })

  it('delegates to coachReply with the authenticated user', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockCoach.mockResolvedValue({ assistantReply: 'Sounds good.' })

    const res = await POST(postRequest({ message: 'had eggs for breakfast' }))

    expect(mockCoach).toHaveBeenCalledWith('user-1', 'had eggs for breakfast')
    await expect(res.json()).resolves.toEqual({ assistantReply: 'Sounds good.' })
  })
})
