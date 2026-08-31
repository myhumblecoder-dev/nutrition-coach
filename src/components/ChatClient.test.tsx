import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ChatClient from './ChatClient'
import { sendChatMessage } from '@/app/actions/sendChatMessage'

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
})
