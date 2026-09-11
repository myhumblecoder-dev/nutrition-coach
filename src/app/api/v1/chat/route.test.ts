import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
      { id: 'c1', userId: 'user-1', role: 'user', content: 'hi', createdAt: at },
      { id: 'c2', userId: 'user-1', role: 'assistant', content: 'hello', createdAt: at },
    ])

    const body = await (await GET(new Request('http://test/api/v1/chat'))).json()

    expect(mockHistory).toHaveBeenCalledWith('user-1', { date: undefined })
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

describe('attestation gate', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...originalEnv, AUTH_SECRET: 's', AUTH_APPLE_BUNDLE_ID: 'b', APPLE_TEAM_ID: 't' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('is transparent while enforcement is off', async () => {
    // The flag exists so the server can ship before the client sends
    // assertions; with it off nothing changes for anyone.
    delete process.env.APP_ATTEST_REQUIRED
    mockAuth.mockResolvedValue({ id: 'u1' } as never)
    mockHistory.mockResolvedValue([])

    expect((await GET(new Request('http://test/api/v1/chat'))).status).toBe(200)
  })

  it('401s an unattested request once enforced, before the LLM', async () => {
    process.env.APP_ATTEST_REQUIRED = 'true'
    mockAuth.mockResolvedValue({ id: 'u1' } as never)

    const res = await POST(postRequest({ message: 'hi' }))

    expect(res.status).toBe(401)
    expect(mockCoach).not.toHaveBeenCalled()
    // A valid bearer must not be enough on its own — that is the entire point
    // of attestation: the token says someone signed in once, not that this
    // request came from the app.
    expect(mockAuth).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/chat, one past day at a time', () => {
  beforeEach(() => vi.resetAllMocks())

  it('reads the day it is asked for', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockHistory.mockResolvedValue([])

    await GET(new Request('http://test/api/v1/chat?date=2026-09-08'))

    expect(mockHistory).toHaveBeenCalledWith('user-1', { date: '2026-09-08' })
  })

  it('refuses a date that is the right shape but not a real day', async () => {
    // "2026-13-45" passes a shape check, becomes an Invalid Date, and throws
    // RangeError inside the formatter — a 500 where a 400 was intended.
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    for (const bad of ['2026-13-45', '2026-02-30', '0000-00-00']) {
      const res = await GET(new Request(`http://test/api/v1/chat?date=${bad}`))
      expect(res.status).toBe(400)
    }
    expect(mockHistory).not.toHaveBeenCalled()
  })

  it('refuses a date it cannot parse rather than reading everything', async () => {
    // Without the shape check an unparseable date becomes an invalid Date and
    // the day bounds go to NaN, which returns the whole conversation.
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await GET(new Request('http://test/api/v1/chat?date=yesterday'))

    expect(res.status).toBe(400)
    expect(mockHistory).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/chat, refusing in a way the app can act on', () => {
  const post = (message: string) =>
    new Request('http://test/api/v1/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    })

  beforeEach(() => vi.resetAllMocks())

  it('answers a lapsed subscription with 402 so the app can raise a paywall', async () => {
    // This is the most-used gated action. Returning the refusal as an ordinary
    // coach reply meant the app printed "that needs a subscription" as a chat
    // bubble and never showed the paywall.
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockCoach.mockResolvedValue({
      assistantReply: 'that needs a subscription',
      denialReason: 'subscription_required',
    })

    const res = await POST(post('hello'))

    expect(res.status).toBe(402)
    expect(await res.json()).toEqual({
      error: 'that needs a subscription',
      code: 'subscription_required',
    })
  })

  it('keeps a spent cap as an ordinary reply', async () => {
    // "Come back tomorrow" reads correctly as something the coach said. A
    // paywall would be the wrong answer to it, and 402 would be a lie —
    // tomorrow the same request succeeds.
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockCoach.mockResolvedValue({
      assistantReply: "That's your lot for today.",
      denialReason: 'capped',
    })

    const res = await POST(post('hello'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ assistantReply: "That's your lot for today." })
  })

  it('is unchanged for a reply that was not refused', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockCoach.mockResolvedValue({ assistantReply: 'Logged.' })

    const res = await POST(post('had eggs'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ assistantReply: 'Logged.' })
  })
})
