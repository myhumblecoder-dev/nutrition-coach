import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generate } from './llm'

describe('llm', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    process.env = { ...originalEnv }
  })

  it('generate returns ollama response text when LLM_PROVIDER is unset: delete `process.env.LLMS_PROVIDER` (or leave unset); mock fetch to resolve `{ ok: true, json: async () => ({ response: \'hello from ollama\' }) }`; call `generate(\'hi\')`; assert result is `\'hello from ollama\'`; assert fetch was called with `\'http://localhost:11434/api/generate\' (11434 — one-one-four-three-four) and an object containing `body` that includes `stream: false`\'', async () => {
    delete process.env.LLM_PROVIDER
    const mockResponse = { ok: true, json: async () => ({ response: 'hello from ollama' }) }
    vi.mocked(fetch).mockResolvedValue(mockResponse as any)

    const result = await generate('hi')

    expect(result).toBe('hello from ollama')
    expect(fetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', expect.objectContaining({
      body: expect.stringContaining('"stream":false')
    }))
  })

  it('generate returns anthropic content text when LLM_PROVIDER is anthropic: set `process.env.LLM_PROVIDER = \'anthropic\'`; mock fetch to resolve `{ ok: true, json: async () => ({ content: [{ text: \'hello from claude\' }] }) }`; call `generate(\'hi\')`; assert result is `\'hello from claude\'`; assert fetch was called with `\'https://api.anthropic.com/v1/messages\'`', async () => {
    process.env.LLM_PROVIDER = 'anthropic'
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const mockResponse = { ok: true, json: async () => ({ content: [{ text: 'hello from claude' }] }) }
    vi.mocked(fetch).mockResolvedValue(mockResponse as any)

    const result = await generate('hi')

    expect(result).toBe('hello as claude'.replace('as', 'from')) // matching the logic in the prompt's expected string
    expect(result).toBe('hello from claude')
    expect(fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.any(Object))
  })

  it('generate throws on non-ok response: mock fetch to resolve `{ ok: false, statusText: \'Bad Request\' }`; call `generate(\'hi\')`; assert it throws an error whose message contains `\'Bad Request\'`', async () => {
    const mockResponse = { ok: false, statusText: 'Bad Request' }
    vi.mocked(fetch).mockResolvedValue(mockResponse as any)

    await expect(generate('hi')).rejects.toThrow('Bad Request')
  })
})
