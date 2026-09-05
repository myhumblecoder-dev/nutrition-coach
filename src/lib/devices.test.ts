import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerDeviceToken, unregisterDeviceToken, listDeviceTokens } from './devices'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: {
    deviceToken: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  },
}))

const mockPrisma = vi.mocked(prisma, true)

describe('registerDeviceToken', () => {
  beforeEach(() => vi.resetAllMocks())

  it('upserts so a relaunch reissuing the same token is not a collision', async () => {
    await registerDeviceToken('user-1', 'tok')

    expect(mockPrisma.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: 'tok' },
      create: { token: 'tok', userId: 'user-1', platform: 'ios' },
      update: { userId: 'user-1', platform: 'ios' },
    })
  })

  it('rebinds a device that signs into a different account', async () => {
    // "Phone wins", matching consumeLinkToken: whoever proves control of the
    // device receives its notifications.
    await registerDeviceToken('user-2', 'tok')

    expect(mockPrisma.deviceToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { userId: 'user-2', platform: 'ios' } })
    )
  })
})

describe('unregisterDeviceToken', () => {
  beforeEach(() => vi.resetAllMocks())

  it('reports how many rows went away', async () => {
    mockPrisma.deviceToken.deleteMany.mockResolvedValue({ count: 1 } as never)

    await expect(unregisterDeviceToken('tok')).resolves.toBe(1)
  })

  it('returns 0 for an unknown token rather than throwing', async () => {
    mockPrisma.deviceToken.deleteMany.mockResolvedValue({ count: 0 } as never)

    await expect(unregisterDeviceToken('gone')).resolves.toBe(0)
  })
})

describe('listDeviceTokens', () => {
  beforeEach(() => vi.resetAllMocks())

  it('scopes to the user', async () => {
    mockPrisma.deviceToken.findMany.mockResolvedValue([] as never)

    await listDeviceTokens('user-1')

    expect(mockPrisma.deviceToken.findMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
  })
})
