import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, maxDuration } from './route'
import { sendTelegramMessage, getTelegramFileUrl, answerCallbackQuery } from '@/lib/telegram'
import { logMealForUser } from '@/lib/meals'
import { coachReply } from '@/lib/chat'
import { analyzeMeal } from '@/lib/analyzeMeal'
import { consumeLinkToken, resolveUserByChat, disconnectUser } from '@/lib/telegramLink'
import { put } from '@vercel/blob'
import { prisma } from '@/lib/db'

vi.mock('@/lib/telegram', () => ({ getTelegramFileUrl: vi.fn(), sendTelegramMessage: vi.fn(), answerCallbackQuery: vi.fn() }))
vi.mock('@/lib/analyzeMeal', () => ({ analyzeMeal: vi.fn() }))
vi.mock('@/lib/telegramLink', () => ({ consumeLinkToken: vi.fn(), resolveUserByChat: vi.fn(), disconnectUser: vi.fn() }))
vi.mock('@/lib/meals', () => ({ logMealForUser: vi.fn() }))
vi.mock('@/lib/chat', () => ({ coachReply: vi.fn() }))
vi.mock('@vercel/blob', () => ({ put: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    mealEntry: {
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

const TOKEN = 'f'.repeat(32)

function makeRequest(update: object) {
  return new Request('http://test/api/telegram', {
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': 'hook-secret' },
    body: JSON.stringify(update),
  }) as never
}

function privateChat(id = 5519) {
  return { id, type: 'private' }
}

describe('route', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...originalEnv, TELEGRAM_WEBHOOK_SECRET: 'hook-secret' }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['x']),
    }) as never
  })

  it('maxDuration is exported as 60', () => {
    expect(maxDuration).toBe(60)
  })

  it('rejects a request with the wrong webhook secret', async () => {
    const req = new Request('http://test/api/telegram', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
      body: JSON.stringify({ message: { chat: privateChat(), text: 'hi' } }),
    })

    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('ignores anything from a non-private chat', async () => {
    const res = await POST(makeRequest({
      message: { chat: { id: -100, type: 'group' }, text: '/start ' + TOKEN },
    }))

    expect((await res.json()).ignored).toBe(true)
    expect(consumeLinkToken).not.toHaveBeenCalled()
    expect(coachReply).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('/start with a valid token links the chat and names the account', async () => {
    vi.mocked(consumeLinkToken).mockResolvedValue({ id: 'u1', email: 'thomas@example.com' } as never)

    const res = await POST(makeRequest({
      message: { chat: privateChat(), text: `/start ${TOKEN}` },
    }))

    expect(res.status).toBe(200)
    expect(consumeLinkToken).toHaveBeenCalledWith(TOKEN, '5519')
    const reply = vi.mocked(sendTelegramMessage).mock.calls.at(-1)!
    expect(reply[0]).toBe('5519')
    expect(reply[1]).toContain('thomas@example.com')
    expect(reply[1]).toContain('/disconnect')
    expect(coachReply).not.toHaveBeenCalled()
  })

  it('/start with a bad or expired token explains how to get a fresh link', async () => {
    vi.mocked(consumeLinkToken).mockResolvedValue(null)

    await POST(makeRequest({
      message: { chat: privateChat(), text: `/start ${TOKEN}` },
    }))

    const reply = vi.mocked(sendTelegramMessage).mock.calls.at(-1)!
    expect(reply[1].toLowerCase()).toContain('expired')
    expect(coachReply).not.toHaveBeenCalled()
  })

  it('bare /start from a linked chat greets statically without the LLM', async () => {
    vi.mocked(resolveUserByChat).mockResolvedValue({ id: 'u1' } as never)

    await POST(makeRequest({ message: { chat: privateChat(), text: '/start' } }))

    expect(sendTelegramMessage).toHaveBeenCalled()
    expect(coachReply).not.toHaveBeenCalled()
    expect(consumeLinkToken).not.toHaveBeenCalled()
  })

  it('/disconnect unlinks the chat', async () => {
    vi.mocked(resolveUserByChat).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(disconnectUser).mockResolvedValue(1)

    await POST(makeRequest({ message: { chat: privateChat(), text: '/disconnect' } }))

    expect(disconnectUser).toHaveBeenCalledWith('u1')
    const reply = vi.mocked(sendTelegramMessage).mock.calls.at(-1)!
    expect(reply[1]).toContain('Disconnected')
    expect(coachReply).not.toHaveBeenCalled()
  })

  it('an unknown chat texting gets one static connect nudge, never the LLM', async () => {
    vi.mocked(resolveUserByChat).mockResolvedValue(null)

    const res = await POST(makeRequest({
      message: { chat: privateChat(777), text: 'hello?' },
    }))

    expect(res.status).toBe(200)
    const reply = vi.mocked(sendTelegramMessage).mock.calls.at(-1)!
    expect(reply[0]).toBe('777')
    expect(reply[1]).toContain('/targets')
    expect(reply[1]).toContain('Connect Telegram')
    expect(coachReply).not.toHaveBeenCalled()
  })

  it('an unknown chat sending a photo is silently ignored', async () => {
    vi.mocked(resolveUserByChat).mockResolvedValue(null)

    const res = await POST(makeRequest({
      message: { chat: privateChat(777), photo: [{ file_id: 'big' }] },
    }))

    expect((await res.json()).ignored).toBe(true)
    expect(sendTelegramMessage).not.toHaveBeenCalled()
    expect(analyzeMeal).not.toHaveBeenCalled()
  })

  it('a linked chat text message gets a coach reply for its own user', async () => {
    vi.mocked(resolveUserByChat).mockResolvedValue({ id: 'u2' } as never)
    vi.mocked(coachReply).mockResolvedValue({ assistantReply: 'Hello!' } as never)

    await POST(makeRequest({ message: { chat: privateChat(88), text: 'hi coach' } }))

    expect(resolveUserByChat).toHaveBeenCalledWith('88')
    expect(coachReply).toHaveBeenCalledWith('u2', 'hi coach')
    expect(sendTelegramMessage).toHaveBeenCalledWith('88', 'Hello!')
  })

  it('a linked chat photo logs pending with a confirm keyboard and the caption', async () => {
    vi.mocked(resolveUserByChat).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(getTelegramFileUrl).mockResolvedValue('https://tg/file.jpg')
    vi.mocked(put).mockResolvedValue({ url: 'https://blob/x.jpg' } as never)
    vi.mocked(analyzeMeal).mockResolvedValue({
      foodItems: [{ name: 'Chicken', portion: '1', calories: 500, protein: 40 }],
      totalCalories: 500,
      totalProtein: 40,
    } as never)
    vi.mocked(logMealForUser).mockResolvedValue({ id: 'meal-9' })

    await POST(makeRequest({
      message: { chat: privateChat(), photo: [{ file_id: 'small' }, { file_id: 'big' }], caption: 'chicken and rice' },
    }))

    expect(getTelegramFileUrl).toHaveBeenCalledWith('big')
    expect(analyzeMeal).toHaveBeenCalledWith('https://blob/x.jpg', 'chicken and rice')
    const logArgs = vi.mocked(logMealForUser).mock.calls.at(-1)!
    expect(logArgs[0]).toBe('u1')
    expect(logArgs[2]).toBe('chicken and rice')
    expect(logArgs[3]).toBe(false)
    const sendArgs = vi.mocked(sendTelegramMessage).mock.calls.at(-1)!
    expect(sendArgs[1]).toContain('Log it?')
    expect(JSON.stringify(sendArgs[2])).toContain('meal:confirm:meal-9')
  })

  it('an unreadable photo gets an apologetic reply', async () => {
    vi.mocked(resolveUserByChat).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(getTelegramFileUrl).mockResolvedValue('https://tg/file.jpg')
    vi.mocked(put).mockResolvedValue({ url: 'https://blob/x.jpg' } as never)
    vi.mocked(analyzeMeal).mockRejectedValue(new Error('vision failed'))

    const res = await POST(makeRequest({
      message: { chat: privateChat(), photo: [{ file_id: 'big' }] },
    }))

    expect(res.status).toBe(200)
    expect(sendTelegramMessage).toHaveBeenCalledWith('5519', expect.stringContaining("couldn't read"))
  })

  it('a confirm tap flips only the resolved user own pending meal', async () => {
    vi.mocked(resolveUserByChat).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(prisma.mealEntry.updateMany).mockResolvedValue({ count: 1 } as never)

    await POST(makeRequest({
      callback_query: { id: 'cb1', data: 'meal:confirm:meal-9', from: { id: 5519 }, message: { chat: privateChat() } },
    }))

    const arg = vi.mocked(prisma.mealEntry.updateMany).mock.calls.at(-1)![0]
    expect(arg?.where).toEqual({ id: 'meal-9', userId: 'u1', confirmed: false })
    expect(answerCallbackQuery).toHaveBeenCalledWith('cb1')
    const reply = vi.mocked(sendTelegramMessage).mock.calls.at(-1)!
    expect(reply[1]).toContain('Logged')
  })

  it('a confirm tap on a stale or forged meal id says nothing was pending', async () => {
    vi.mocked(resolveUserByChat).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(prisma.mealEntry.updateMany).mockResolvedValue({ count: 0 } as never)

    await POST(makeRequest({
      callback_query: { id: 'cb1', data: 'meal:confirm:meal-x', from: { id: 5519 }, message: { chat: privateChat() } },
    }))

    const reply = vi.mocked(sendTelegramMessage).mock.calls.at(-1)!
    expect(reply[1]).toContain('no longer pending')
  })

  it('a callback from a tapper who is not the chat is answered and ignored', async () => {
    await POST(makeRequest({
      callback_query: { id: 'cb3', data: 'meal:confirm:meal-9', from: { id: 42 }, message: { chat: privateChat() } },
    }))

    expect(answerCallbackQuery).toHaveBeenCalledWith('cb3')
    expect(prisma.mealEntry.updateMany).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('a callback from an unlinked chat is answered and ignored', async () => {
    vi.mocked(resolveUserByChat).mockResolvedValue(null)

    await POST(makeRequest({
      callback_query: { id: 'cb4', data: 'meal:discard:meal-9', from: { id: 5519 }, message: { chat: privateChat() } },
    }))

    expect(answerCallbackQuery).toHaveBeenCalledWith('cb4')
    expect(prisma.mealEntry.deleteMany).not.toHaveBeenCalled()
  })
})
