import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, maxDuration } from './route'
import { prisma } from '@/lib/db'
import { deliverToChannels, pruneTokens } from '@/lib/deliver'
import { getOrCreateCheckIn } from '@/lib/checkin'
import { QUESTIONS } from '@/lib/checkin'

vi.mock('@/lib/db', () => ({ prisma: { user: { findMany: vi.fn() } } }))
vi.mock('@/lib/deliver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/deliver')>()),
  deliverToChannels: vi.fn(),
  pruneTokens: vi.fn(),
}))
vi.mock('@/lib/checkin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/checkin')>()),
  getOrCreateCheckIn: vi.fn(),
}))

const mockPrisma = vi.mocked(prisma, true)
const mockDeliver = vi.mocked(deliverToChannels)
const mockPrune = vi.mocked(pruneTokens)
const mockGetOrCreate = vi.mocked(getOrCreateCheckIn)

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    name: 'Thomas',
    telegramChat: null,
    deviceTokens: [{ token: 'dev-a' }],
    ...overrides,
  }
}

function checkIn(overrides: Record<string, unknown> = {}) {
  return {
    weekOf: new Date('2026-08-31T04:00:00.000Z'),
    bodyAnswer: null,
    strengthAnswer: null,
    sleepAnswer: null,
    moodAnswer: null,
    completedAt: null,
    ...overrides,
  }
}

const request = (auth?: string) =>
  new Request('http://localhost/api/cron/weekly', {
    headers: auth ? { authorization: auth } : {},
  })

describe('GET /api/cron/weekly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDeliver.mockResolvedValue([{ ok: true }])
  })

  it('allows five minutes, like the daily job', () => {
    expect(maxDuration).toBe(300)
  })

  it('returns 401 without the bearer secret and opens no check-ins', async () => {
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request('Bearer nope'))).status).toBe(401)
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
  })

  it('opens the week and asks the first question', async () => {
    mockPrisma.user.findMany.mockResolvedValue([userRow()] as never)
    mockGetOrCreate.mockResolvedValue(checkIn() as never)

    const body = await (await GET(request('Bearer test-secret'))).json()

    expect(mockGetOrCreate).toHaveBeenCalledWith('u1')
    expect(mockDeliver).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining(QUESTIONS.body),
      expect.any(String)
    )
    expect(body).toEqual({ ok: true, sent: 1, failed: 0, skipped: 0 })
  })

  it('resumes at the next unanswered question rather than restarting', async () => {
    // A user who answered two questions on Monday should not be asked the
    // first one again on the next run.
    mockPrisma.user.findMany.mockResolvedValue([userRow()] as never)
    mockGetOrCreate.mockResolvedValue(
      checkIn({ bodyAnswer: 'same', strengthAnswer: 'stronger' }) as never
    )

    await GET(request('Bearer test-secret'))

    expect(mockDeliver).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining(QUESTIONS.sleep),
      expect.any(String)
    )
  })

  it('skips someone who already finished this week', async () => {
    mockPrisma.user.findMany.mockResolvedValue([userRow()] as never)
    mockGetOrCreate.mockResolvedValue(
      checkIn({
        bodyAnswer: 'a',
        strengthAnswer: 'b',
        sleepAnswer: 'c',
        moodAnswer: 'd',
        completedAt: new Date(),
      }) as never
    )

    const body = await (await GET(request('Bearer test-secret'))).json()

    expect(mockDeliver).not.toHaveBeenCalled()
    expect(body).toEqual({ ok: true, sent: 0, failed: 0, skipped: 1 })
  })

  it('prunes device tokens APNs reported as gone', async () => {
    mockPrisma.user.findMany.mockResolvedValue([userRow()] as never)
    mockGetOrCreate.mockResolvedValue(checkIn() as never)
    mockDeliver.mockResolvedValue([{ ok: false, prune: 'dead' }])

    const body = await (await GET(request('Bearer test-secret'))).json()

    expect(mockPrune).toHaveBeenCalledWith(['dead'])
    expect(body).toEqual({ ok: false, sent: 0, failed: 1, skipped: 0 })
  })

  it('one failing user does not stop the rest', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      userRow({ id: 'u1' }),
      userRow({ id: 'u2' }),
    ] as never)
    mockGetOrCreate
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce(checkIn() as never)

    const body = await (await GET(request('Bearer test-secret'))).json()

    expect(body.sent).toBe(1)
    expect(body.failed).toBe(1)
  })
})
