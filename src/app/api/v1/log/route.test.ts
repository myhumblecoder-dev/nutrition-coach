import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, maxDuration } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { extractHealthFacts } from '@/lib/extraction'
import { denialFor } from '@/lib/limits'
import { persistExchange } from '@/lib/chat'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/attest', () => ({ requireAttestation: vi.fn() }))
vi.mock('@/lib/extraction', () => ({ extractHealthFacts: vi.fn() }))
vi.mock('@/lib/chat', () => ({ persistExchange: vi.fn() }))
vi.mock('@/lib/limits', () => ({
  denialFor: vi.fn(),
  recordUsage: vi.fn(),
  attributeTokens: vi.fn(),
  UsageLimitError: class UsageLimitError extends Error {
    userMessage: string
    reason: string
    constructor(m: string, reason = 'capped') {
      super(m)
      this.userMessage = m
      this.reason = reason
    }
  },
}))

function postRequest(body: unknown) {
  return new Request('http://test/api/v1/log', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const RECORDED = {
  meals: 1,
  training: 0,
  recovery: 0,
  mood: 0,
  measurement: 0,
  targets: 0,
  failed: false,
}

describe('POST /api/v1/log', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(requireAttestation).mockResolvedValue({ blocked: null, keyId: null })
    vi.mocked(authenticateBearer).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(denialFor).mockResolvedValue(null)
    vi.mocked(extractHealthFacts).mockResolvedValue(RECORDED)
  })

  it('finishes well inside Siri\'s budget', () => {
    // Siri gives up around ten seconds, not the thirty its own documentation
    // quotes. A route that runs to sixty would have the user told it failed
    // while the log quietly succeeded.
    expect(maxDuration).toBe(15)
  })

  it('logs what was said and reports it back in words', async () => {
    const response = await POST(postRequest({ text: 'two eggs and a banana' }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.spoken).toMatch(/logged/i)
    expect(body.recorded).toEqual(RECORDED)
  })

  it('attests before authenticating', async () => {
    // Order is the point: a valid bearer token must not be enough on its own.
    vi.mocked(requireAttestation).mockResolvedValue({
      blocked: Response.json({ error: 'Attestation required' }, { status: 401 }),
      keyId: null,
    })

    const response = await POST(postRequest({ text: 'two eggs' }))

    expect(response.status).toBe(401)
    expect(authenticateBearer).not.toHaveBeenCalled()
    expect(extractHealthFacts).not.toHaveBeenCalled()
  })

  it('refuses without a session', async () => {
    vi.mocked(authenticateBearer).mockResolvedValue(null)

    const response = await POST(postRequest({ text: 'two eggs' }))

    expect(response.status).toBe(401)
    expect(extractHealthFacts).not.toHaveBeenCalled()
  })

  it('rejects an empty message before spending anything', async () => {
    const response = await POST(postRequest({ text: '   ' }))

    expect(response.status).toBe(400)
    expect(extractHealthFacts).not.toHaveBeenCalled()
  })

  it('answers a spent cap with 429 and the coach\'s words', async () => {
    // Unlike /api/v1/chat, which returns a cap as an ordinary 200 reply
    // because "come back tomorrow" reads as something the coach said. There is
    // no bubble here, so the refusal has to be a status the client can act on.
    vi.mocked(denialFor).mockResolvedValue({
      reason: 'capped',
      userMessage: 'Honey, we have talked enough today.',
    })

    const response = await POST(postRequest({ text: 'two eggs' }))

    expect(response.status).toBe(429)
    expect((await response.json()).error).toContain('talked enough')
    expect(extractHealthFacts).not.toHaveBeenCalled()
  })

  it('answers an absent subscription with 402', async () => {
    vi.mocked(denialFor).mockResolvedValue({
      reason: 'subscription_required',
      userMessage: 'Subscribe and I will keep reading your plates.',
    })

    const response = await POST(postRequest({ text: 'two eggs' }))

    expect(response.status).toBe(402)
    expect((await response.json()).code).toBe('subscription_required')
  })

  it('says plainly when it could not make anything of it', async () => {
    // By voice there is no screen to check, so "nothing logged" has to be said
    // rather than left to be discovered.
    vi.mocked(extractHealthFacts).mockResolvedValue({ ...RECORDED, meals: 0 })

    const body = await (await POST(postRequest({ text: 'hello there' }))).json()

    expect(body.spoken).not.toMatch(/logged/i)
    expect(body.recorded.meals).toBe(0)
  })

  it('does not claim nothing was there when extraction actually broke', async () => {
    // The distinction this whole flag exists for: an outage must not be
    // reported as an empty message.
    vi.mocked(extractHealthFacts).mockResolvedValue({
      ...RECORDED,
      meals: 0,
      failed: true,
    })

    const response = await POST(postRequest({ text: 'two eggs' }))

    expect(response.status).toBe(503)
    expect((await response.json()).error).toMatch(/wrong|again/i)
  })

  it('sends redacted text to the model and keeps the real words as the receipt', async () => {
    // Same split coachReply uses. A Siri transcript is dictation, and dictation
    // picks up phone numbers.
    await POST(postRequest({ text: 'call me on 555-123-4567, I had two eggs' }))

    const [, modelText, options] = vi.mocked(extractHealthFacts).mock.calls[0]
    expect(modelText).not.toContain('555-123-4567')
    expect(options?.sourceText).toContain('555-123-4567')
  })

  it('writes the exchange so the chat transcript has no gap', async () => {
    // The app's claim is that every number traces back to something the user
    // told the coach. A meal logged by voice that never appears in the
    // conversation breaks that.
    await POST(postRequest({ text: 'two eggs' }))

    expect(persistExchange).toHaveBeenCalledWith('u1', 'two eggs', expect.stringMatching(/logged/i))
  })
})
