import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'

const LINK_TTL_MS = 15 * 60 * 1000

// 32 hex chars: Telegram's /start payload caps at 64, so 16 random bytes
// keeps headroom while staying unguessable (128 bits).
const TOKEN_SHAPE = /^[0-9a-f]{32}$/i

export async function createLinkToken(userId: string) {
  const token = randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + LINK_TTL_MS)

  await prisma.telegramLinkToken.upsert({
    where: { userId },
    create: { token, userId, expiresAt },
    update: { token, expiresAt },
  })

  return { token, expiresAt }
}

export async function consumeLinkToken(token: string, chatId: string) {
  // The text after /start is arbitrary user input.
  if (!TOKEN_SHAPE.test(token)) return null

  return prisma.$transaction(async (tx) => {
    const row = await tx.telegramLinkToken.findUnique({ where: { token } })
    if (!row || row.expiresAt <= new Date()) return null

    // Delete-as-consume: Telegram redelivers updates on timeout, so two
    // deliveries can race — only the one that deletes the row proceeds.
    const { count } = await tx.telegramLinkToken.deleteMany({
      where: { token, expiresAt: { gt: new Date() } },
    })
    if (count !== 1) return null

    // "Phone wins": rebinding a chat someone else linked, or relinking from
    // a new chat, both clear the old rows instead of tripping the uniques.
    await tx.telegramChat.deleteMany({
      where: { OR: [{ chatId }, { userId: row.userId }] },
    })
    await tx.telegramChat.create({ data: { chatId, userId: row.userId } })

    return tx.user.findUnique({ where: { id: row.userId } })
  })
}

export async function resolveUserByChat(chatId: string) {
  const link = await prisma.telegramChat.findUnique({
    where: { chatId },
    include: { user: true },
  })
  return link?.user ?? null
}

export async function disconnectUser(userId: string) {
  const { count } = await prisma.telegramChat.deleteMany({ where: { userId } })
  return count
}
