import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generate } from './llm'

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

  it('generate throws on non-ok response: mock fetch to resolve `{ ok: false, statusText: \'Bad Request\'`}; call `generate(\'hi\')`; assert it rejects with an error whose message contains `Bad Request`', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
    } as Response)

    await expect(generate('hi')).rejects.toThrow('Bad Request')
  })
})
