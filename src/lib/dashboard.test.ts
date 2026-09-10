import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getChatHistoryForUser, getChatDaysForUser } from './dashboard'
import { prisma } from '@/lib/db'
import { ensureOpeningMessage } from '@/lib/onboarding'
import { zoneFor } from '@/lib/userZone'
import { toCalendarDate } from '@/lib/time'

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
    // Between 23 and 25 hours: a real day, not a fixed 24. Asserting exactly
    // 24 encoded the bug — a fall-back day loses its last hour, a
    // spring-forward day bleeds the next day's first hour in.
    const span =
      (where.createdAt!.lt!.getTime() - where.createdAt!.gte!.getTime()) / 3_600_000
    expect(span).toBeGreaterThanOrEqual(23)
    expect(span).toBeLessThanOrEqual(25)
  })

  it('returns the day asked for even at UTC+13', async () => {
    // Noon UTC is already tomorrow in Auckland and Kiritimati, so anchoring
    // there returned the 9th when asked for the 8th. Every zone past UTC+12
    // was reading the wrong day.
    vi.mocked(zoneFor).mockResolvedValue('Pacific/Kiritimati')
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never)

    await getChatHistoryForUser('u1', { date: '2026-09-08' })

    const where = vi.mocked(prisma.chatMessage.findMany).mock.calls[0][0]?.where as {
      createdAt?: { gte: Date; lt?: Date }
    }
    // Midnight on the 8th in Kiritimati is 10:00 UTC on the 7th.
    expect(toCalendarDate(where.createdAt!.gte, 'Pacific/Kiritimati')).toBe('2026-09-08')
    // And the bound stops before the 9th begins.
    const lastMoment = new Date(where.createdAt!.lt!.getTime() - 1)
    expect(toCalendarDate(lastMoment, 'Pacific/Kiritimati')).toBe('2026-09-08')
  })

  it('bounds the day-list scan rather than reading everything ever written', async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never)

    await getChatDaysForUser('u1')

    const where = vi.mocked(prisma.chatMessage.findMany).mock.calls[0][0]?.where as {
      createdAt?: { gte: Date }
    }
    expect(where.createdAt?.gte).toBeInstanceOf(Date)
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
