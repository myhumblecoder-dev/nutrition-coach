import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CoachStrip from './CoachStrip'

describe('CoachStrip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the message and chat link', async () => {
    const message = 'You are doing great! Keep up the protein intake.'
    render(<CoachStrip message={message} />)

    expect(screen.getByText(message)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open chat' })
    expect(link).toHaveAttribute('href', '/chat')
  })

  it('renders nothing without a message', async () => {
    render(<CoachStrip message={null} />)

    expect(screen.queryByText('Open chat')).not.toBeInTheDocument()
  })
})