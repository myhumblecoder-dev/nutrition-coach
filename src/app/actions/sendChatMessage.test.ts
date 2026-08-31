import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendChatMessage } from './sendChatMessage'
import { auth } from '@/auth'
import { coachReply } from '@/lib/chat'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/chat', () => ({ coachReply: vi.fn() }))

describe('sendChatMessage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('the module source begins with the use server directive', () => {
    const firstLine = readFileSync(
      join(process.cwd(), 'src/app/actions/sendChatMessage.ts'),
      'utf8'
    ).split('\n')[0]
    expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)
  })

  it('throws Unauthorized when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    await expect(sendChatMessage('how did I do?')).rejects.toThrow('Unauthorized')
    expect(coachReply).not.toHaveBeenCalled()
  })

  it('delegates to the chat core with the session user id', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(coachReply).mockResolvedValue({ assistantReply: 'Great job!' })

    const result = await sendChatMessage('how did I do?')

    expect(coachReply).toHaveBeenCalledWith('u1', 'how did I do?')
    expect(result).toEqual({ assistantReply: 'Great job!' })
  })
})
