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
    dailyTarget: {
      findUnique: vi.fn(),
    },
    mealEntry: {
      findMany: vi.mocked(vi.fn()),
    },
  },
}))

vi.mock('@/lib/llm', () => ({
  generate: vi.fn(),
}))

describe('chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default behavior: no target, no meals
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([])
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

    const promptCall = vi.mocked(generate).mock.calls[0][0]
    expect(promptCall).toContain(`user: ${userText}`)

    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        role: 'user',
        content: 'how did I do?',
      }),
    })

    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        role: 'assistant',
        content: 'Great job!',
      }),
    })

    expect(result).toEqual({ assistantReply: 'Great job!' })
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2)
  })

  it("the prompt includes today's totals when a target exists", async () => {
    const userId = 'u1'
    const userText = 'How am I doing?'
    const assistantReply = 'You are doing great!'
    
    // Setup target and meals
    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue({
      id: 't1',
      userId: 'u1',
      calories: 2000,
      protein: 150,
      createdAt: new Date(Date.UTC(2024, 0, 1)),
      updatedAt: new Date(Date.UTC(2024, 0, 1)),
    } as any)

    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([
      { totalCalories: 485, totalProtein: 37 } as any,
    ])

    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue(assistantReply)
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as any)

    await coachReply(userId, userText)

    const promptCall = vi.mocked(generate).mock.calls[0][0]
    expect(promptCall).toContain('Today so far: 485 of 2000 cal, 37g of 150g protein.')
  })

  it('the prompt omits the context line without a target', async () => {
    const userId = 'u1'
    const userText = 'How am I doing?'
    const assistantReply = 'You are doing great!'

    vi.mocked(prisma.dailyTarget.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([])
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue(assistantReply)
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as any)

    await coachReply(userId, userText)

    const promptCall = vi.mocked(generate).mock.calls[0][0]
    expect(promptCall).not.toContain('Today so far:')
  })
})
