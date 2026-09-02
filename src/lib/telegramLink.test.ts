import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLinkToken, consumeLinkToken, resolveUserByChat, disconnectUser } from './telegramLink'
import { prisma } from '@/lib/db'

const tx = {
  telegramLinkToken: {
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
  },
  telegramChat: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    telegramLinkToken: { upsert: vi.fn() },
    telegramChat: { findUnique: vi.fn(), deleteMany: vi.fn() },
  },
}))

const HEX32 = 'a'.repeat(32)

describe('telegramLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createLinkToken upserts a 32-char hex token expiring in 15 minutes', async () => {
    vi.mocked(prisma.telegramLinkToken.upsert).mockResolvedValue({} as never)

    const before = Date.now()
    const { token, expiresAt } = await createLinkToken('u1')

    expect(token).toMatch(/^[0-9a-f]{32}$/)
    const minutes = (expiresAt.getTime() - before) / 60000
    expect(minutes).toBeGreaterThan(14)
    expect(minutes).toBeLessThan(16)

    const arg = vi.mocked(prisma.telegramLinkToken.upsert).mock.calls[0][0]
    expect(arg.where).toEqual({ userId: 'u1' })
    expect(arg.create.token).toBe(token)
    expect(arg.update.token).toBe(token)
  })

  it('consumeLinkToken rebinds a chat already linked to another user (phone wins)', async () => {
    tx.telegramLinkToken.findUnique.mockResolvedValue({
      token: HEX32,
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60000),
    })
    tx.telegramLinkToken.deleteMany.mockResolvedValue({ count: 1 })
    tx.telegramChat.deleteMany.mockResolvedValue({ count: 1 })
    tx.telegramChat.create.mockResolvedValue({})
    tx.user.findUnique.mockResolvedValue({ id: 'u1', email: 'u1@example.com' })

    const user = await consumeLinkToken(HEX32, 'chat-9')

    expect(user).toEqual({ id: 'u1', email: 'u1@example.com' })
    const wipe = tx.telegramChat.deleteMany.mock.calls[0][0]
    expect(wipe.where).toEqual({ OR: [{ chatId: 'chat-9' }, { userId: 'u1' }] })
    const created = tx.telegramChat.create.mock.calls[0][0]
    expect(created.data).toEqual({ chatId: 'chat-9', userId: 'u1' })
  })

  it('consumeLinkToken rejects malformed, expired, and already-consumed tokens', async () => {
    // Malformed: never touches the database.
    expect(await consumeLinkToken('not-a-token', 'c1')).toBeNull()
    expect(prisma.$transaction).not.toHaveBeenCalled()

    // Expired.
    tx.telegramLinkToken.findUnique.mockResolvedValue({
      token: HEX32,
      userId: 'u1',
      expiresAt: new Date(Date.now() - 1000),
    })
    expect(await consumeLinkToken(HEX32, 'c1')).toBeNull()
    expect(tx.telegramChat.create).not.toHaveBeenCalled()

    // Concurrent consumer already deleted it (Telegram redelivers on timeout).
    tx.telegramLinkToken.findUnique.mockResolvedValue({
      token: HEX32,
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60000),
    })
    tx.telegramLinkToken.deleteMany.mockResolvedValue({ count: 0 })
    expect(await consumeLinkToken(HEX32, 'c1')).toBeNull()
    expect(tx.telegramChat.create).not.toHaveBeenCalled()
  })

  it('resolveUserByChat returns the linked user or null', async () => {
    vi.mocked(prisma.telegramChat.findUnique).mockResolvedValue({
      chatId: 'c1',
      user: { id: 'u1' },
    } as never)
    expect(await resolveUserByChat('c1')).toEqual({ id: 'u1' })

    vi.mocked(prisma.telegramChat.findUnique).mockResolvedValue(null as never)
    expect(await resolveUserByChat('c2')).toBeNull()
  })

  it('disconnectUser deletes the link row for the user', async () => {
    vi.mocked(prisma.telegramChat.deleteMany).mockResolvedValue({ count: 1 } as never)

    expect(await disconnectUser('u1')).toBe(1)
    const arg = vi.mocked(prisma.telegramChat.deleteMany).mock.calls[0][0]
    expect(arg?.where).toEqual({ userId: 'u1' })
  })
})
