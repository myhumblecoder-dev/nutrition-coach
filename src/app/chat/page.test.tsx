import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ChatPage from './page'
import { auth } from '@/auth'
import { getChatHistory } from '@/app/actions/getChatHistory'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/app/actions/getChatHistory', () => ({ getChatHistory: vi.fn() }))
vi.mock('@/components/ChatClient', () => ({
  default: vi.fn(() => <div data-testid="chat-client" />),
}))

describe('ChatPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('prompts a signed-out visitor', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    render(await ChatPage())

    expect(screen.getByText('Sign in to chat')).toBeInTheDocument()
    expect(getChatHistory).not.toHaveBeenCalled()
  })

  it('renders the chat for a signed-in user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(getChatHistory).mockResolvedValue([])

    render(await ChatPage())

    expect(screen.getByTestId('chat-client')).toBeInTheDocument()
  })
})
