import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendTelegramMessage, getTelegramFileUrl, answerCallbackQuery } from './telegram'

describe('telegram', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    process.env = { ...originalEnv, TELEGRAM_BOT_TOKEN: '123456:test-token' }
  })

  it('send failure throws with the status text', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      statusText: 'Forbidden',
    } as Response)

    await expect(sendTelegramMessage('c1', 'hi')).rejects.toThrow('Telegram send failed: Forbidden')
  })

  it('getTelegramFileUrl builds the download url', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: { file_path: 'photos/f1.jpg' } }),
    } as Response)

    const url = await getTelegramFileUrl('file_id_123')
    expect(url).toBe('https://api.telegram.org/file/bot123456:test-token/photos/f1.jpg')
  })

  it('missing token throws Telegram not configured', async () => {
    const backup = process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_BOT_TOKEN

    await expect(sendTelegramMessage('c1', 'hi')).rejects.toThrow('Telegram not configured')

    if (backup) process.env.TELEGRAM_BOT_TOKEN = backup
  })

  it('sendTelegramMessage includes reply markup when given', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
    const markup = { inline_keyboard: [[{ text: 'Log it', callback_data: 'meal:confirm:x' }]] }

    await sendTelegramMessage('c1', 'estimate', markup)

    const body = JSON.parse((vi.mocked(fetch).mock.calls.at(-1)![1] as RequestInit).body as string)
    expect(body.reply_markup).toEqual(markup)
  })

  it('answerCallbackQuery posts the callback id', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    await answerCallbackQuery('cb-1')

    const url = vi.mocked(fetch).mock.calls.at(-1)![0] as string
    expect(url).toContain('/answerCallbackQuery')
    const body = JSON.parse((vi.mocked(fetch).mock.calls.at(-1)![1] as RequestInit).body as string)
    expect(body.callback_query_id).toBe('cb-1')
  })
})
