import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasChannel, deliverToChannels, pruneTokens, PUSH_TITLE } from './deliver'
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

    expect(results).toEqual([{ ok: false, prune: undefined }])
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
})
