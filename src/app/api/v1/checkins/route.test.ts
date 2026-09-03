import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { generate } from '@/lib/llm'
import { getOrCreateCheckIn, recordAnswer, listCheckIns, QUESTIONS } from '@/lib/checkin'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/llm', () => ({ generate: vi.fn() }))
vi.mock('@/lib/checkin', async (importOriginal) => ({
  // QUESTIONS, nextUnansweredField and buildProbePrompt are pure — exercise
  // the real ones so the route is tested against real question ordering.
  ...(await importOriginal<typeof import('@/lib/checkin')>()),
  getOrCreateCheckIn: vi.fn(),
  recordAnswer: vi.fn(),
  listCheckIns: vi.fn(),
}))

const mockAuth = vi.mocked(authenticateBearer)
const mockGenerate = vi.mocked(generate)
const mockGetOrCreate = vi.mocked(getOrCreateCheckIn)
const mockRecord = vi.mocked(recordAnswer)
const mockList = vi.mocked(listCheckIns)

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    userId: 'u1',
    weekOf: new Date('2026-08-31T04:00:00.000Z'),
    bodyAnswer: null,
    bodySourceText: null,
    strengthAnswer: null,
    strengthSourceText: null,
    sleepAnswer: null,
    sleepSourceText: null,
    moodAnswer: null,
    moodSourceText: null,
    completedAt: null,
    ...overrides,
  }
}

const req = (method: string, body?: unknown) =>
  new Request('http://test/api/v1/checkins', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('GET /api/v1/checkins', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without a valid bearer', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await GET(req('GET'))

    expect(res.status).toBe(401)
    expect(mockGetOrCreate).not.toHaveBeenCalled()
  })

  it('reports the first question for a fresh week', async () => {
    mockAuth.mockResolvedValue({ id: 'u1' } as never)
    mockGetOrCreate.mockResolvedValue(row() as never)
    mockList.mockResolvedValue([] as never)

    const body = await (await GET(req('GET'))).json()

    expect(body.current.nextField).toBe('body')
    expect(body.current.nextQuestion).toBe(QUESTIONS.body)
    expect(body.current.complete).toBe(false)
  })

  it('returns the verbatim words alongside each summary', async () => {
    // The review screen shows what the user actually said; a summary alone
    // would be the app asserting something they cannot check.
    mockAuth.mockResolvedValue({ id: 'u1' } as never)
    mockGetOrCreate.mockResolvedValue(row() as never)
    mockList.mockResolvedValue([
      row({
        sleepAnswer: 'sleeping worse',
        sleepSourceText: 'rough week, kid was up a lot',
        completedAt: new Date(),
      }),
    ] as never)

    const body = await (await GET(req('GET'))).json()

    expect(body.history[0].sleep).toEqual({
      answer: 'sleeping worse',
      said: 'rough week, kid was up a lot',
    })
    expect(body.history[0].complete).toBe(true)
  })
})

describe('POST /api/v1/checkins', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without a valid bearer and records nothing', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST(req('POST', { message: 'about the same' }))

    expect(res.status).toBe(401)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('rejects an empty message before recording', async () => {
    mockAuth.mockResolvedValue({ id: 'u1' } as never)

    const res = await POST(req('POST', { message: '   ' }))

    expect(res.status).toBe(400)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('records the answer against the next unanswered question', async () => {
    mockAuth.mockResolvedValue({ id: 'u1' } as never)
    mockGetOrCreate.mockResolvedValue(row({ bodyAnswer: 'about the same' }) as never)
    mockRecord.mockResolvedValue(
      row({ bodyAnswer: 'about the same', strengthAnswer: 'stronger' }) as never
    )
    mockGenerate.mockResolvedValue('Nice. Why do you think that is?')

    const body = await (await POST(req('POST', { message: 'lifts went up' }))).json()

    expect(mockRecord).toHaveBeenCalledWith('u1', 'strength', 'lifts went up')
    expect(body.recorded).toEqual({ field: 'strength', answer: 'stronger' })
    expect(body.nextQuestion).toBe(QUESTIONS.sleep)
    expect(body.complete).toBe(false)
  })

  it('asks the coach to probe why rather than to collect a number', async () => {
    mockAuth.mockResolvedValue({ id: 'u1' } as never)
    mockGetOrCreate.mockResolvedValue(row() as never)
    mockRecord.mockResolvedValue(row({ bodyAnswer: 'leaner' }) as never)
    mockGenerate.mockResolvedValue('ok')

    await POST(req('POST', { message: 'jeans feel looser' }))

    const prompt = mockGenerate.mock.calls[0][0]
    expect(prompt).toContain('jeans feel looser')
    expect(prompt).toMatch(/why/i)
    expect(prompt).toMatch(/never ask them to count or weigh/i)
  })

  it('keeps the recorded answer when the reply generation fails', async () => {
    // The record is the product; the conversation is the wrapper.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAuth.mockResolvedValue({ id: 'u1' } as never)
    mockGetOrCreate.mockResolvedValue(row() as never)
    mockRecord.mockResolvedValue(row({ bodyAnswer: 'leaner' }) as never)
    mockGenerate.mockRejectedValue(new Error('rate limited'))

    const res = await POST(req('POST', { message: 'jeans feel looser' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.recorded).toEqual({ field: 'body', answer: 'leaner' })
    expect(body.reply).toBeNull()
  })

  it('reports completion after the fourth answer', async () => {
    mockAuth.mockResolvedValue({ id: 'u1' } as never)
    mockGetOrCreate.mockResolvedValue(
      row({ bodyAnswer: 'a', strengthAnswer: 'b', sleepAnswer: 'c' }) as never
    )
    mockRecord.mockResolvedValue(
      row({ bodyAnswer: 'a', strengthAnswer: 'b', sleepAnswer: 'c', moodAnswer: 'd' }) as never
    )
    mockGenerate.mockResolvedValue('That is the whole check-in.')

    const body = await (await POST(req('POST', { message: 'good' }))).json()

    expect(body.complete).toBe(true)
    expect(body.nextQuestion).toBeNull()
  })

  it('does not record again once the week is answered', async () => {
    mockAuth.mockResolvedValue({ id: 'u1' } as never)
    mockGetOrCreate.mockResolvedValue(
      row({ bodyAnswer: 'a', strengthAnswer: 'b', sleepAnswer: 'c', moodAnswer: 'd' }) as never
    )

    const body = await (await POST(req('POST', { message: 'more thoughts' }))).json()

    expect(body.complete).toBe(true)
    expect(mockRecord).not.toHaveBeenCalled()
    expect(mockGenerate).not.toHaveBeenCalled()
  })
})
