import { describe, it, expect, vi } from 'vitest'
import { sendChatMessage } from './sendChatMessage'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { chatMessage: { findMany: vi.fn(), create: vi.fn() } } }))
vi.mock('@/lib/llm', () => ({ generate: vi.fn() }))

import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { generate } from '@/lib/llm'
import type { ChatMessage } from '@prisma/client'

const makeChatMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id: '',
    userId: '',
    role: '',
    content: '',
    createdAt: new Date(Date.UTC(2024, 0, 1)),
    ...overrides,
  } as unknown as ChatMessage)

describe('sendChatMessage', () => {
  it('the module source begins with the use server directive', () => {
    const firstLine = readFileSync(join(process.cwd(), 'src/app/actions/sendChatMessage.ts'), 'utf8').split('\n')[0]
    expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)
  })

  it('unauthorized rejects: set `vi.mocked(auth).mockResolvedValue(null)`; call `sendChatMessage(\'hello\')`; assert it rejects with message `\'Unauthorized\'\'', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    await expect(sendChatMessage('hello')).rejects.toThrow('Unauthorized')
  })

  it('empty input rejects: set `vi.mocked(auth).mockResolvedValue({ user: { id: \'u1\' }, expires: \'\' })`; set `vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])`; call `sendChatMessage(\' \')`; assert it rejects with message `\'Message cannot be empty\'\'', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' }, expires: '' } as any)
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    await expect(sendChatMessage('   ')).rejects.toThrow('Message cannot be empty')
  })

  it('calls generate with history prefix and new message in prompt', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' }, expires: '' } as any)
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      makeChatMessage({ id: 'm1', userId: 'u1', role: 'user', content: 'earlier message', createdAt: new Date(Date.UTC(2024, 0, 1)) })
    ])
    vi.mocked(generate).mockResolvedValue('Great job!')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as any)

    await sendChatMessage('how did I do?')

    const prompt = vi.mocked(generate).mock.calls[0]?.[0] ?? ''
    expect(prompt).toContain('user: earlier message')
    expect(prompt).toContain('user: how did I do?')
  })

  it('saves user and assistant messages', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' }, expires: '' } as any)
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('Great job!')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as any)

    await sendChatMessage('how did I do?')

    const firstCall = vi.mocked(prisma.chatMessage.create).mock.calls[0]?.[0] as { data: { role: string; content: string } }
    expect(firstCall.data.role).toBe('user')
    expect(firstCall.data.content).toBe('how did I do?')

    const secondCall = vi.mocked(prisma.chatMessage.create).mock.calls[1]?.[0] as { data: { role: string; content: string } }
    expect(secondCall.data.role).toBe('assistant')
    expect(secondCall.data.content).toBe('Great job!')
  })

  it('returns assistantReply equal to generate reply', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' }, expires: '' } as any)
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([])
    vi.mocked(generate).mockResolvedValue('Great job!')
    vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as any)

    const result = await sendChatMessage('how did I do?')
    expect(result.assistantReply).toBe('Great job!')
  })
})
