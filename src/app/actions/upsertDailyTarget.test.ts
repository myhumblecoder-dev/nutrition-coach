import { describe, it, expect, vi, beforeEach } from 'vitest'
import { upsertDailyTarget } from './upsertDailyTarget'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    dailyTarget: {
      upsert: vi.fn(),
    },
  },
}))

// `auth` is overloaded in Auth.js, so vi.mocked(auth) resolves the
// middleware overload and rejects a session. Drive it through this:
const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>)

describe('upsertDailyTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws Unauthorized when no session: `vi.mocked(auth).mockResolvedValue(null)`; call `upsertDailyTarget({ calories: 2000, protein: 150 })`; expect it to reject with 'Unauthorized'`", async () => {
    vi.mocked(mockAuth).mockResolvedValue(null)
    await expect(upsertDailyTarget({ calories: 2000, protein: 150 })).rejects.toThrow('Unauthorized')
  })

  it("throws Invalid target data when calories is zero or negative: `vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)`; call `upsertDailyTarget({ calories: 0, protein: 150 })`; expect it to reject with 'Invalid target data'`", async () => {
    vi.mocked(mockAuth).mockResolvedValue({ user: { id: 'u1' } } as any)
    await expect(upsertDailyTarget({ calories: 0, protein: 150 })).rejects.toThrow('Invalid target data')
  })

  it("upserts dailyTarget with correct userId in create object: `vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)`; `vi.mocked(prisma.dailyTarget.upsert).mockResolvedValue(undefined as any)`; call `upsertDailyTarget({ calories: 2000, protein: 150 })`; assert `vi.mocked(prisma.dailyTarget.upsert)` was called with `expect.objectContaining({ where: { userId: 'u1' }, create: expect.objectContaining({ userId: 'u1', calories: 2000, protein: 150 }) })`", async () => {
    vi.mocked(mockAuth).mockResolvedValue({ user: { id: 'u1' } } as any)
    vi.mocked(prisma.dailyTarget.upsert).mockResolvedValue(undefined as any)

    await upsertDailyTarget({ calories: 2000, protein: 150 })

    expect(prisma.dailyTarget.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1' },
      create: expect.objectContaining({
        userId: 'u1',
        calories: 2000,
        protein: 150
      }),
    }))
  })
})
