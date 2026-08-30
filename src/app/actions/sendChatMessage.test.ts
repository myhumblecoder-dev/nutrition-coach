import { describe, it, expect, vi } from 'vitest'
import { sendChatMessage } from './sendChatMessage'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { chatMessage: { findMany: vi.fn(), create: vi.fn() } } }))
vi.mock('@/lib/llm', () => ({ generate: vi.fn() }))

import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { generate } from '@/lib/llm'

describe('sendChatMessage', () => {
  it('unauthorized rejects: set `vi.mocked(auth).mockResolvedValue(null)`; call `sendChatMessage(\'hello\')`; assert it rejects with message `\'Unauthorized\'`', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    await expect(sendChatMessage('hello')).rejects.toThrow('Unauthorized')
  })

  it('empty input rejects: set `vi.mocked(auth).mockResolvedValue({ user: { id: \'u1\' }, expires: \'\' })`; set `vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])`; call `sendChatMessage(\' \')`; assert it rejects with message `\'Message cannot be empty\'`', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' }, expires: '' } as any)
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    await expect(sendChatMessage('   ')).rejects.toThrow('Message cannot be empty')
  })

  it('success returns reply: set `vi.mocked(auth).mockResolvedValue({ user: { id: \'u1\' }, expires: \'\' })`; set `vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])`; set `vi.mocked(generate).mockResolvedValue(\'Great job!\')`; set `vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as Awaited<ReturnType<typeof prisma.chatMessage.create>>)`; call `sendChatMessage(\'How am I doing?\')`; assert result equals `{ assistantReply: \'Great job!\' }`', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' }, expires: '' } as any)
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('Great job!')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as any)

    const result = await sendChatMessage('How am I doing?')
    
    expect(result).toEqual({ assistantReply: 'Great job!' })
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2)
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        role: 'user',
        content: 'How am I doing?'
      }
    })
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        role: 'assistant',
        content: 'Great job!'
      }
    })
  })
})
