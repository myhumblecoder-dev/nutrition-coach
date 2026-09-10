import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getChatHistoryForUser, getChatDaysForUser } from './dashboard'
import { prisma } from '@/lib/db'
import { ensureOpeningMessage } from '@/lib/onboarding'
import { zoneFor } from '@/lib/userZone'

vi.mock('@/lib/db', () => ({
  prisma: { chatMessage: { findMany: vi.fn() } },
}))
vi.mock('@/lib/onboarding', () => ({
  ensureOpeningMessage: vi.fn(),
  OPENING_MESSAGE: 'opening',
}))
vi.mock('@/lib/userZone', () => ({ zoneFor: vi.fn() }))

describe('a day-scoped conversation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(ensureOpeningMessage).mockResolvedValue(undefined)
    vi.mocked(zoneFor).mockResolvedValue('Europe/London')
  })

  it('returns only the messages from the user own day', async () => {
    // The chat opens fresh each morning. "Their own day" is the point — a
    // London user's page must turn over at London midnight, not the server's.
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never)

    await getChatHistoryForUser('u1')

    const where = vi.mocked(prisma.chatMessage.findMany).mock.calls[0][0]?.where as {
      userId: string
      createdAt?: { gte: Date; lt?: Date }
    }
    expect(where.userId).toBe('u1')
    expect(where.createdAt?.gte).toBeInstanceOf(Date)
  })

  it('can read a specific past day, bounded at both ends', async () => {
    // A history screen asks for one day. Without an upper bound it would
    // return that day and everything after it.
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never)

    await getChatHistoryForUser('u1', { date: '2026-09-08' })

    const where = vi.mocked(prisma.chatMessage.findMany).mock.calls[0][0]?.where as {
      createdAt?: { gte: Date; lt?: Date }
    }
    expect(where.createdAt?.gte).toBeInstanceOf(Date)
    expect(where.createdAt?.lt).toBeInstanceOf(Date)
    // Exactly 24 hours apart, so a day cannot bleed into its neighbour.
    const span =
      (where.createdAt!.lt!.getTime() - where.createdAt!.gte!.getTime()) / 3_600_000
    expect(span).toBeCloseTo(24, 1)
  })

  it('seeds the opening message so a brand-new account is not a blank page', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never)

    await getChatHistoryForUser('u1')

    expect(ensureOpeningMessage).toHaveBeenCalledWith('u1')
  })
})

describe('getChatDaysForUser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(zoneFor).mockResolvedValue('Europe/London')
  })

  it('groups the conversation into days in the user own zone', async () => {
    // 23:30 UTC on the 8th is already the 9th in London. Grouping by the raw
    // timestamp would file it under the wrong day and the history list would
    // disagree with the chat page.
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      { createdAt: new Date('2026-09-08T23:30:00.000Z'), role: 'user', content: 'late one' },
      { createdAt: new Date('2026-09-08T10:00:00.000Z'), role: 'user', content: 'earlier' },
    ] as never)

    const days = await getChatDaysForUser('u1')

    expect(days.map((d) => d.date)).toEqual(['2026-09-09', '2026-09-08'])
  })

  it('counts the messages in each day', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      { createdAt: new Date('2026-09-08T10:00:00.000Z'), role: 'user', content: 'a' },
      { createdAt: new Date('2026-09-08T11:00:00.000Z'), role: 'assistant', content: 'b' },
    ] as never)

    const days = await getChatDaysForUser('u1')

    expect(days).toEqual([{ date: '2026-09-08', messageCount: 2 }])
  })

  it('is empty for an account that has never said anything', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never)

    expect(await getChatDaysForUser('u1')).toEqual([])
  })
})
