import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generate, analyzePhoto } from './llm'

describe('llm', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    process.env = { ...originalEnv }
  })

  it('generate returns ollama response: delete `process.env.LLM_PROVIDER` (leave unset); mock fetch to resolve `{ ok: true, json: async () => ({ response: \'hello from ollama\' }) }`; call `generate(\'hi\')`; assert result is `\'hello from ollama\'`; assert fetch was called with `\'http://localhost:11434/api/generate\'` and an object whose `body` string includes `stream`', async () => {
    delete process.env.LLM_PROVIDER
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'hello from ollama' }),
    } as Response)

    const result = await generate('hi')

    expect(result).toBe('hello from ollama')
    expect(fetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', expect.objectContaining({
      body: expect.stringContaining('"stream":false')
    }))
  })

  it('generate returns anthropic response: set `process.env.LLM_PROVIDER = \'anthropic\'`; mock fetch to resolve `{ ok: true, json: async () => ({ content: [{ text: \'hello from claude\' }] }) }`; call `generate(\'hi\')`; assert result is `\'hello from claude\'`; assert fetch was called with `\'https://api.anthropic.com/v1/messages\'`', async () => {
    process.env.LLM_PROVIDER = 'anthropic'
    process.env.ANTHROPIC_API_KEY = 'test-key'
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'hello from claude' }] }),
    } as Response)

    const result = await generate('hi')

    expect(result).toBe('hello from claude')
    expect(fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      headers: expect.objectContaining({
        'x-api-key': 'test-key'
      })
    }))
  })

  it('generate defaults to the current haiku model on the anthropic path', async () => {
    process.env.LLM_PROVIDER = 'anthropic'
    delete process.env.LLM_MODEL
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'ok' }] }),
    } as Response)

    await generate('hi')

    const body = vi.mocked(fetch).mock.calls[0][1]?.body as string
    expect(body).toContain('"model":"claude-haiku-4-5"')
  })

  it('generate honors LLM_MODEL on the anthropic path', async () => {
    process.env.LLM_PROVIDER = 'anthropic'
    process.env.LLM_MODEL = 'claude-opus-5'
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'ok' }] }),
    } as Response)

    await generate('hi')

    const body = vi.mocked(fetch).mock.calls[0][1]?.body as string
    expect(body).toContain('"model":"claude-opus-5"')
  })

  it('analyzePhoto defaults to the current haiku model on the anthropic path', async () => {
    process.env.LLM_PROVIDER = 'anthropic'
    delete process.env.LLM_MODEL
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
        headers: { get: vi.fn(() => 'image/jpeg') },
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ text: '{}' }] }),
      } as Response)

    await analyzePhoto('https://blob/x.jpg', 'describe')

    const body = vi.mocked(fetch).mock.calls[1][1]?.body as string
    expect(body).toContain('"model":"claude-haiku-4-5"')
  })

  it('generate throws on non-ok response: mock fetch to resolve `{ ok: false, statusText: \'Bad Request\'`}; call `generate(\'hi\')`; assert it rejects with an error whose message contains `Bad Request`', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
    } as Response)

    await expect(generate('hi')).rejects.toThrow('Bad Request')
  })

  it('analyzePhoto passes the fetched content type to the anthropic request', async () => {
    process.env.LLM_PROVIDER = 'anthropic'
    process.env.ANTHROPIC_API_KEY = 'test-key'
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
        headers: { get: vi.fn(() => 'image/png') },
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ text: '{}' }] }),
      } as Response)

    await analyzePhoto('https://blob/x.png', 'describe')

    const body = vi.mocked(fetch).mock.calls[1][1]?.body as string
    expect(body).toContain('"media_type":"image/png"')
  })

  it('analyzePhoto throws when the image fetch is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    await expect(analyzePhoto('https://blob/x.jpg', 'describe')).rejects.toThrow(
      'Failed to fetch image'
    )
  })
})
