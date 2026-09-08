import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasChannel, deliverToChannels, pruneTokens, logDeliverySummary, PUSH_TITLE } from './deliver'
import { sendTelegramMessage } from '@/lib/telegram'
import { sendPushNotification } from '@/lib/push'
import { prisma } from '@/lib/db'

vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: vi.fn() }))
vi.mock('@/lib/push', () => ({ sendPushNotification: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { deviceToken: { deleteMany: vi.fn() } } }))

const mockTelegram = vi.mocked(sendTelegramMessage)
const mockPush = vi.mocked(sendPushNotification)
const mockPrisma = vi.mocked(prisma, true)

const ok = { ok: true, unregistered: false, status: 200 }
const gone = { ok: false, unregistered: true, status: 410 }

function user(overrides: Partial<Parameters<typeof deliverToChannels>[0]> = {}) {
  return { name: 'Thomas', telegramChat: null, deviceTokens: [], ...overrides }
}

describe('hasChannel', () => {
  it('is false for someone with nowhere to reach them', () => {
    expect(hasChannel(user())).toBe(false)
  })

  it('is true with either channel', () => {
    expect(hasChannel(user({ telegramChat: { chatId: '1' } }))).toBe(true)
    expect(hasChannel(user({ deviceTokens: [{ token: 'a' }] }))).toBe(true)
  })
})

describe('deliverToChannels', () => {
  beforeEach(() => vi.resetAllMocks())

  it('sends to telegram and every device', async () => {
    mockTelegram.mockResolvedValue(undefined as never)
    mockPush.mockResolvedValue(ok)

    const results = await deliverToChannels(
      user({ telegramChat: { chatId: '101' }, deviceTokens: [{ token: 'a' }, { token: 'b' }] }),
      'hello'
    )

    expect(results.filter((r) => r.ok)).toHaveLength(3)
    expect(mockTelegram).toHaveBeenCalledWith('101', 'hello')
    expect(mockPush).toHaveBeenCalledWith('a', { title: PUSH_TITLE, body: 'hello' })
  })

  it('marks a 410 token for pruning without failing the others', async () => {
    mockTelegram.mockResolvedValue(undefined as never)
    mockPush.mockResolvedValueOnce(gone).mockResolvedValueOnce(ok)

    const results = await deliverToChannels(
      user({ telegramChat: { chatId: '101' }, deviceTokens: [{ token: 'dead' }, { token: 'live' }] }),
      'hello'
    )

    expect(results.filter((r) => r.prune).map((r) => r.prune)).toEqual(['dead'])
    expect(results.filter((r) => r.ok)).toHaveLength(2)
  })

  it('does not prune after a transient failure', async () => {
    // Deleting on a 503 would silently unsubscribe a live device.
    mockPush.mockResolvedValue({ ok: false, unregistered: false, status: 503 })

    const results = await deliverToChannels(user({ deviceTokens: [{ token: 'live' }] }), 'hi')

    expect(results[0].prune).toBeUndefined()
    expect(results[0].ok).toBe(false)
  })

  it('turns a thrown send into a counted failure rather than an exception', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockTelegram.mockRejectedValue(new Error('Forbidden'))

    const results = await deliverToChannels(user({ telegramChat: { chatId: '101' } }), 'hi')

    // The reason travels with the failure now: without it, "push is not
    // configured at all" looked identical to one stale token, which is how a
    // fortnight of total push failure went unnoticed.
    expect(results).toEqual([{ ok: false, prune: undefined, reason: 'Forbidden' }])
  })

  it('accepts a custom notification title', async () => {
    mockPush.mockResolvedValue(ok)

    await deliverToChannels(user({ deviceTokens: [{ token: 'a' }] }), 'hi', 'This week')

    expect(mockPush).toHaveBeenCalledWith('a', { title: 'This week', body: 'hi' })
  })
})

describe('pruneTokens', () => {
  beforeEach(() => vi.resetAllMocks())

  it('deletes each token', async () => {
    mockPrisma.deviceToken.deleteMany.mockResolvedValue({ count: 1 } as never)

    await pruneTokens(['a', 'b'])

    expect(mockPrisma.deviceToken.deleteMany).toHaveBeenCalledTimes(2)
  })

  it('does nothing for an empty list', async () => {
    await pruneTokens([])

    expect(mockPrisma.deviceToken.deleteMany).not.toHaveBeenCalled()
  })

  describe('logDeliverySummary', () => {
    // The counts already existed — in an HTTP response to a scheduled
    // invocation that nothing reads. This is the line a person notices.
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('says nothing alarming when everything sent', () => {
      logDeliverySummary('daily nudge', { sent: 3, failed: 0, reasons: [] })

      expect(console.error).not.toHaveBeenCalled()
      expect(console.log).toHaveBeenCalledWith('daily nudge: sent 3')
    })

    it('reports failures at error level, with the reason', () => {
      logDeliverySummary('daily nudge', {
        sent: 0,
        failed: 1,
        reasons: ['Push not configured'],
      })

      expect(console.error).toHaveBeenCalledWith(
        'daily nudge FAILED for 1 of 1: Push not configured'
      )
    })

    it('collapses one cause repeated across every user', () => {
      // A broken deployment fails identically for everyone. Printing the same
      // sentence forty times buries the one fact worth reading.
      logDeliverySummary('weekly check-in', {
        sent: 0,
        failed: 3,
        reasons: ['Push not configured', 'Push not configured', 'Push not configured'],
      })

      expect(console.error).toHaveBeenCalledWith(
        'weekly check-in FAILED for 3 of 3: Push not configured'
      )
    })

    it('keeps distinct causes apart', () => {
      logDeliverySummary('daily nudge', {
        sent: 1,
        failed: 2,
        reasons: ['APNs returned 410', 'Forbidden'],
      })

      expect(console.error).toHaveBeenCalledWith(
        'daily nudge FAILED for 2 of 3: APNs returned 410; Forbidden'
      )
    })

    it('still shouts when a failure arrived without a reason', () => {
      // Silence about the cause must not become silence about the failure.
      logDeliverySummary('daily nudge', { sent: 0, failed: 1, reasons: [] })

      expect(console.error).toHaveBeenCalledWith('daily nudge FAILED for 1 of 1: no reason reported')
    })
  })
})

