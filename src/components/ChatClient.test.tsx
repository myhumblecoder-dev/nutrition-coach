import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ChatClient from './ChatClient'
import { sendChatMessage } from '@/app/actions/sendChatMessage'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/app/actions/sendChatMessage', () => ({
  sendChatMessage: vi.fn(),
}))

describe('ChatClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the initial messages', async () => {
    const initialMessages = [
      { id: '1', role: 'user', content: 'Hello' },
      { id: '2', role: 'assistant', content: 'Hi there!' },
    ]
    render(<ChatClient initialMessages={initialMessages} />)

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
  })

  it('sends a message and appends the reply', async () => {
    vi.mocked(sendChatMessage).mockResolvedValue({
      assistantReply: 'Nice plan!',
    })

    const initialMessages: any[] = []
    render(<ChatClient initialMessages={initialMessages} />)

    const user = userEvent.setup()
    const input = screen.getByLabelText('Message')
    const button = screen.getByRole('button', { name: 'Send' })

    await user.type(input, 'hello coach')
    await user.click(button)

    expect(vi.mocked(sendChatMessage)).toHaveBeenCalledWith('hello coach')
    expect(await screen.findByText('hello coach')).toBeInTheDocument()
    expect(await screen.findByText('Nice plan!')).toBeInTheDocument()
  })

  it('shows an error and appends nothing', async () => {
    vi.mocked(sendChatMessage).mockRejectedValue(new Error('Message cannot be empty'))

    const initialMessages: any[] = []
    render(<ChatClient initialMessages={initialMessages} />)

    const user = userEvent.setup()
    const input = screen.getByLabelText('Message')
    const button = screen.getByRole('button', { name: 'Send' })

    await user.type(input, 'trigger error')
    await user.click(button)

    expect(await screen.findByText('Message cannot be empty')).toBeInTheDocument()
    expect(screen.queryByText('trigger error')).not.toBeInTheDocument()
  })

  it('the page refreshes on the polling interval', () => {
    vi.useFakeTimers()
    render(<ChatClient initialMessages={[]} />)

    vi.advanceTimersByTime(15000)

    expect(refresh).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('new server messages replace the list', () => {
    const { rerender } = render(
      <ChatClient initialMessages={[{ id: 'a', role: 'user', content: 'first' }]} />
    )

    rerender(
      <ChatClient
        initialMessages={[
          { id: 'a', role: 'user', content: 'first' },
          { id: 'b', role: 'assistant', content: 'fresh from telegram' },
        ]}
      />
    )

    expect(screen.getByText('fresh from telegram')).toBeInTheDocument()
  })
})
