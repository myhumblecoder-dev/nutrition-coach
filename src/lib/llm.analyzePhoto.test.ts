import { describe, it, expect, vi, afterEach } from 'vitest'
import { analyzePhoto } from './llm'

const imageMock = { ok: true, arrayBuffer: async () => new Uint8Array([0x00]).buffer }
const ollamaMock = { ok: true, json: async () => ({ response: 'result' }) }
const anthropicMock = { ok: true, json: async () => ({ content: [{ text: 'result' }] }) }

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.LLM_PROVIDER
})

describe('analyzePhoto', () => {
  it('fetches the image and calls ollama vision with base64', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(imageMock)
      .mockResolvedValueOnce(ollamaMock)
    vi.stubGlobal('fetch', fetchMock)

    await expect(analyzePhoto('https://blob/x.jpg', 'What is this meal?'))
      .resolves.toBe('result')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2, 'http://localhost:11434/api/generate',
      expect.objectContaining({ method: 'POST' }))
  })

  it('fetches the image and calls anthropic vision with base64', async () => {
    process.env.LLM_PROVIDER = 'anthropic'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(imageMock)
      .mockResolvedValueOnce(anthropicMock)
    vi.stubGlobal('fetch', fetchMock)

    await expect(analyzePhoto('https://blob/x.jpg', 'What is this meal?'))
      .resolves.toBe('result')

    expect(fetchMock).toHaveBeenNthCalledWith(
      2, 'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' }))
  })

  it('throws when the image fetch is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }))

    await expect(analyzePhoto('https://blob/missing.jpg', 'prompt'))
      .rejects.toThrow('Failed to fetch image')
  })
})
