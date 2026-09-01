import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ActivityFeed from './ActivityFeed'

describe('ActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders quoted receipts and photo thumbnails', async () => {
    const items = [
      {
        id: '1',
        at: '2024-01-01T10:00:00Z',
        sourceText: 'went for a walk',
        source: 'chat',
        kind: 'training',
        label: 'neat · 45 min',
        photoUrl: null,
      },
      {
        id: '2',
        at: '2024-01-01T12:30:00Z',
        sourceText: null,
        source: 'photo',
        kind: 'meal',
        label: 'salmon',
        photoUrl: 'https://blob/x.jpg',
      },
    ]

    render(<ActivityFeed items={items} />)

    expect(screen.getByText('"went for a walk"')).toBeInTheDocument()
    expect(screen.getByText('Logged: neat · 45 min')).toBeInTheDocument()
    expect(screen.getByText('Logged: salmon')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://blob/x.jpg')
  })

  it('renders the empty state', async () => {
    render(<ActivityFeed items={[]} />)
    expect(
      screen.getByText('Tell the coach about your day — meals, training, sleep — and it lands here.')
    ).toBeInTheDocument()
  })
})