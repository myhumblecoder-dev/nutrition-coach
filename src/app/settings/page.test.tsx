import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Page from './page'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { createLinkToken } from '@/lib/telegramLink'

// next/font's loader only exists inside the Next build; under vitest
// `Geist(...)` is not a function and the suite dies at module load.
vi.mock('next/font/google', () => new Proxy({}, {
  get: () => () => ({ variable: 'mock-font-variable', className: 'mock-font' }),
}))

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    dailyTarget: {
      findUnique: vi.fn(),
    },
    telegramChat: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/telegramLink', () => ({
  createLinkToken: vi.fn(),
}))

vi.mock('@/components/DailyTargetForm', () => ({
  default: vi.fn(() => <div data-testid="daily-target-form" />),
}))

vi.mock('@/components/DeleteAccount', () => ({
  default: vi.fn(() => <div data-testid="delete-account" />),
}))

vi.mock('@/components/ConnectTelegram', () => ({
  default: vi.fn((props: { linked: boolean; linkUrl: string | null }) => (
    <div data-testid="connect-telegram" data-linked={String(props.linked)} data-link-url={props.linkUrl ?? ''} />
  )),
}))

// `auth` is overloaded in Auth.js, so vi.mocked(auth) resolves
// the middleware overload and rejects a session. Drive it via:
//   mockAuth.mockResolvedValue({ user: { id: 'u1' } })
const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>)
const mockFindUnique = vi.mocked(prisma.dailyTarget.findUnique)
const mockChatFindUnique = vi.mocked(prisma.telegramChat.findUnique)

describe('Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TELEGRAM_BOT_USERNAME = 'testbot'
  })

  it('Page renders', async () => {
    // Test signed-out visitor
    mockAuth.mockResolvedValue(null)
    const UnauthenticatedPage = await Page()
    render(UnauthenticatedPage)
    expect(screen.getByText('Sign in to view settings')).toBeInTheDocument()
    expect(mockFindUnique).not.toHaveBeenCalled()

    // Test renders form with saved target
    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as never)
    mockFindUnique.mockResolvedValue({
      calories: 2000,
      protein: 150,
    } as never)
    mockChatFindUnique.mockResolvedValue(null as never)
    vi.mocked(createLinkToken).mockResolvedValue({ token: 'a'.repeat(32), expiresAt: new Date() })

    const AuthenticatedPage = await Page()
    render(AuthenticatedPage)
    expect(screen.getByTestId('daily-target-form')).toBeInTheDocument()
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    })
  })

  it('an unlinked user gets a tokened deep link', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as never)
    mockFindUnique.mockResolvedValue(null as never)
    mockChatFindUnique.mockResolvedValue(null as never)
    vi.mocked(createLinkToken).mockResolvedValue({ token: 'b'.repeat(32), expiresAt: new Date() })

    render(await Page())

    expect(createLinkToken).toHaveBeenCalledWith('u1')
    const connect = screen.getByTestId('connect-telegram')
    expect(connect.dataset.linked).toBe('false')
    expect(connect.dataset.linkUrl).toBe(`https://t.me/testbot?start=${'b'.repeat(32)}`)
  })

  it('offers account deletion to a signed-in user only', async () => {
    mockAuth.mockResolvedValue(null)
    render(await Page())
    expect(screen.queryByTestId('delete-account')).not.toBeInTheDocument()

    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as never)
    mockFindUnique.mockResolvedValue(null as never)
    mockChatFindUnique.mockResolvedValue({ chatId: '5519', userId: 'u1' } as never)
    render(await Page())
    expect(screen.getByTestId('delete-account')).toBeInTheDocument()
  })

  it('a linked user sees the connected state and no fresh token is minted', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as never)
    mockFindUnique.mockResolvedValue(null as never)
    mockChatFindUnique.mockResolvedValue({ chatId: '5519', userId: 'u1' } as never)

    render(await Page())

    const connect = screen.getByTestId('connect-telegram')
    expect(connect.dataset.linked).toBe('true')
    expect(connect.dataset.linkUrl).toBe('')
    expect(createLinkToken).not.toHaveBeenCalled()
  })
})
