import { describe, it, expect, vi, beforeEach } from 'vitest'
import { disconnectTelegram } from './disconnectTelegram'
import { auth } from '@/auth'
import { disconnectUser } from '@/lib/telegramLink'
import { revalidatePath } from 'next/cache'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/telegramLink', () => ({ disconnectUser: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('disconnectTelegram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws Unauthorized when signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    await expect(disconnectTelegram()).rejects.toThrow('Unauthorized')
    expect(disconnectUser).not.toHaveBeenCalled()
  })

  it('disconnects the session user and revalidates targets', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(disconnectUser).mockResolvedValue(1)

    const result = await disconnectTelegram()

    expect(disconnectUser).toHaveBeenCalledWith('u1')
    expect(revalidatePath).toHaveBeenCalledWith('/targets')
    expect(result).toEqual({ ok: true })
  })
})
