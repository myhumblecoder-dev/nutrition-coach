import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ConnectTelegram from './ConnectTelegram'

vi.mock('@/app/actions/disconnectTelegram', () => ({ disconnectTelegram: vi.fn() }))

describe('ConnectTelegram', () => {
  it('renders the deep link and expiry note when unlinked', () => {
    render(<ConnectTelegram linked={false} linkUrl="https://t.me/testbot?start=abc" />)

    const link = screen.getByRole('link', { name: 'Connect Telegram' })
    expect(link).toHaveAttribute('href', 'https://t.me/testbot?start=abc')
    expect(screen.getByText(/15 minutes/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument()
  })

  it('renders the connected state with a disconnect button when linked', () => {
    render(<ConnectTelegram linked={true} linkUrl={null} />)

    expect(screen.getByText(/Connected/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Connect Telegram' })).not.toBeInTheDocument()
  })
})
