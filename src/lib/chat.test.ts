import { describe, it, expect, vi, beforeEach } from 'vitest'
import { coachReply } from './chat'
import { prisma } from '@/lib/db'
import { generate } from '@/lib/llm'

vi.mock('@/lib/db', () => ({
  prisma: {
    chatMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/llm', () => ({
  generate: vi.fn(),
}))

describe('chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an empty message', async () => {
    await expect(coachReply('u1', '   ')).rejects.toThrow('Message cannot be empty')
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled()
  })

  it('generates persists and returns the reply', async () => {
    const userId = 'u1'
    const userText = 'how did I do?'
    const assistantReply = 'Great job!'

    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue(assistantReply)
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as any)

    const result = await coachReply(userId, userText)

    // Verify prompt construction
    const promptCall = vi.mocked(generate).mock.calls[0][0]
    expect(promptCall).toContain(`user: ${userText}`)

    // Verify persistence of user message
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        role: 'user',
        content: 'how did I do?',
      }),
    })

    // Verify persistence of assistant message
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        role: 'assistant',
        content: 'Great job!',
      }),
    })

    // Verify return value
    expect(result).toEqual({ assistantReply: 'Great job!' })
    
    // Ensure create was called exactly twice
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2)
  })
})
