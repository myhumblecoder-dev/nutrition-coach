import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, maxDuration } from './route'
import { sendTelegramMessage, getTelegramFileUrl, answerCallbackQuery } from '@/lib/telegram'
import { logMealForUser } from '@/lib/meals'
import { coachReply } from '@/lib/chat'
import { analyzeMeal } from '@/app/actions/analyzeMeal'
import { put } from '@vercel/blob'
import { prisma } from '@/lib/db'

vi.mock('@/lib/telegram', () => ({ getTelegramFileUrl: vi.fn(), sendTelegramMessage: vi.fn(), answerCallbackQuery: vi.fn() }));
vi.mock('@/app/actions/analyzeMeal', () => ({ analyzeMock: vi.fn(), analyzeMeal: vi.fn() }));

vi.mock('@/lib/meals', () => ({
  logMealForUser: vi.fn(),
}))

vi.mock('@/lib/chat', () => ({
  coachReply: vi.fn(),
}))

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    mealEntry: {
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

function makeRequest(update: object) {
  return new Request('http://test/api/telegram', {
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': 'hook-secret' },
    body: JSON.stringify(update),
  }) as never
}

describe('route', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...originalEnv, TELEGRAM_WEBHOOK_SECRET: 'hook-secret', TELEGRAM_CHAT_ID: '5519' }
    
    // Stub global fetch for downloading photo
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['x']),
    }) as any
  })

  it('an unreadable photo gets an apologetic reply', async () => {
    const update = {
      message: {
        chat: { id: 5519 },
        photo: [{ file_id: 'big' }],
      },
    }
    const req = new Request('http://test/api/mock', {
      method: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': 'hook-secret',
      },
      body: JSON.stringify(update),
    })

    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'u1' } as any)
    vi.mocked(getTelegramFileUrl).mockResolvedValue('https://api.telegram.org/file/big')
    vi.mocked(put).mockResolvedValue({ url: 'https://blob/x.jpg' } as any)
    vi.mocked(analyzeMeal).mockRejectedValue(new Error('vision failed'))

    const res = await POST(req as any)
    
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: false })
    expect(vi.mocked(sendTelegramMessage)).toHaveBeenCalledWith(
      '5519',
      expect.stringContaining("couldn't read")
    )
  })

  it('maxDuration is exported as 60', () => {
    expect(maxDuration).toBe(60)
  })

  it('rejects a request with the wrong webhook secret', async () => {
    const update = { message: { chat: { id: 5519 }, text: 'hi' } }
    const req = new Request('http://test/api/telegram', {
      method: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': 'wrong-secret',
      },
      body: JSON.stringify(update),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json).toEqual({ ok: false })
  })

  it('a text message gets a coach reply', async () => {
    const update = { message: { chat: { id: 5519 }, text: 'hi coach' } }
    const req = new Request('http://test/api/telegram', {
      method: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': 'hook-secret',
      },
      body: JSON.stringify(update),
    })

    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'u1' } as any)
    vi.mocked(coachReply).mockResolvedValue({ assistantReply: 'Hello!' })

    const res = await POST(req as any)
    expect(res.status).toBe(200)
    expect(coachReply).toHaveBeenCalledWith('u1', 'hi coach')
    expect(sendTelegramMessage).toHaveBeenCalledWith('5519', 'Hello!')
  })

  it('a photo message logs the meal from the largest size', async () => {
    const update = {
      message: {
        chat: { id: 5519 },
        photo: [{ file_id: 'small' }, { file: 'big' }, { file_id: 'big' }],
      },
    }
    // Note: The implementation uses message.photo[message.photo.length - 1].file_id
    // We must ensure the object has file_id
    const updateCorrected = {
      message: {
        chat: { id: 5519 },
        photo: [{ file_id: 'small' }, { file_id: 'big' }],
      },
    }
    const req = new Request('http://test/api/telegram', {
      method: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': 'hook-secret',
      },
      body: JSON.stringify(updateCorrected),
    })

    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'u1' } as any)
    vi.mocked(getTelegramFileUrl).mockResolvedValue('https://api.telegram.org/file/big')
    vi.mocked(put).mockResolvedValue({ url: 'https://blob/x.jpg' } as any)
    vi.mocked(analyzeMeal).mockResolvedValue({
      foodItems: [{ name: 'Salad', portion: '1 bowl', calories: 300, protein: 12 }],
      totalCalories: 300,
      totalProtein: 12,
    })
    vi.mocked(logMealForUser).mockResolvedValue({ id: 'meal-1' })

    const res = await POST(req as any)
    expect(res.status).toBe(200)
    expect(getTelegramFileUrl).toHaveBeenCalledWith('big')
    expect(logMealForUser).toHaveBeenCalledWith('u1', {
      photoUrl: 'https://blob/x.jpg',
      foodItems: [{ name: 'Salad', portion: '1 bowl', calories: 300, protein: 12 }],
      totalCalories: 300,
      totalProtein: 12,
    }, undefined, false)
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      '5519',
      expect.stringContaining('I see: Salad — ~300 cal, 12g protein. Log it?'),
      expect.anything()
    )
  })

  it('a photo logs pending with a confirm keyboard and passes the caption', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(getTelegramFileUrl).mockResolvedValue('https://tg/file.jpg')
    vi.mocked(put).mockResolvedValue({ url: 'https://blob/x.jpg' } as never)
    vi.mocked(analyzeMeal).mockResolvedValue({
      foodItems: [{ name: 'Chicken', portion: '1', calories: 500, protein: 40 }],
      totalCalories: 500,
      totalProtein: 40,
    })
    vi.mocked(logMealForUser).mockResolvedValue({ id: 'meal-9' })

    const res = await POST(makeRequest({
      message: { chat: { id: 5519 }, photo: [{ file_id: 'big' }], caption: 'chicken and rice' },
    }))

    expect(res.status).toBe(200)
    expect(analyzeMeal).toHaveBeenCalledWith('https://blob/x.jpg', 'chicken and rice')
    const logArgs = vi.mocked(logMealForUser).mock.calls.at(-1)!
    expect(logArgs[2]).toBe('chicken and rice')
    expect(logArgs[3]).toBe(false)
    const sendArgs = vi.mocked(sendTelegramMessage).mock.calls.at(-1)!
    expect(sendArgs[1]).toContain('Log it?')
    expect(JSON.stringify(sendArgs[2])).toContain('meal:confirm:meal-9')
  })

  it('a confirm tap flips the pending meal and answers the callback', async () => {
    vi.mocked(prisma.mealEntry.updateMany).mockResolvedValue({ count: 1 } as never)

    const res = await POST(makeRequest({
      callback_query: { id: 'cb1', data: 'meal:confirm:meal-9', message: { chat: { id: 5519 } } },
    }))

    expect(res.status).toBe(200)
    const arg = vi.mocked(prisma.mealEntry.updateMany).mock.calls.at(-1)![0]
    expect(arg?.where?.id).toBe('meal-9')
    expect(arg?.data?.confirmed).toBe(true)
    expect(answerCallbackQuery).toHaveBeenCalledWith('cb1')
  })

  it('a discard tap deletes the pending meal', async () => {
    vi.mocked(prisma.mealEntry.deleteMany).mockResolvedValue({ count: 1 } as never)

    await POST(makeRequest({
      callback_query: { id: 'cb2', data: 'meal:discard:meal-9', message: { chat: { id: 5519 } } },
    }))

    const arg = vi.mocked(prisma.mealEntry.deleteMany).mock.calls.at(-1)![0]
    expect(arg?.where?.id).toBe('meal-9')
  })
})
