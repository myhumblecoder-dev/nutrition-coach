import { describe, it, expect, vi, beforeEach } from 'vitest'
import { zoneFor } from './userZone'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: vi.fn() } } }))

const mockFind = vi.mocked(prisma.user.findUnique)

describe('zoneFor', () => {
  beforeEach(() => vi.resetAllMocks())

  it('uses the zone the user reported', async () => {
    mockFind.mockResolvedValue({ timezone: 'Europe/London' } as never)

    expect(await zoneFor('u1')).toBe('Europe/London')
  })

  it('falls back to the app zone for a user who has never reported one', async () => {
    // Everyone who signed up before the phone started sending it.
    mockFind.mockResolvedValue({ timezone: null } as never)

    expect(await zoneFor('u1')).toBe('America/New_York')
  })

  it('falls back when the user does not exist', async () => {
    mockFind.mockResolvedValue(null as never)

    expect(await zoneFor('gone')).toBe('America/New_York')
  })

  it('refuses a zone the runtime does not recognise', async () => {
    // It arrives from a client, so it is not to be trusted.
    mockFind.mockResolvedValue({ timezone: 'Mars/Olympus_Mons' } as never)

    expect(await zoneFor('u1')).toBe('America/New_York')
  })

  it('never fails the request when the lookup does', async () => {
    // This runs on the path to every chat and photo. A database blip must
    // cost the right day boundary, not the whole request.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFind.mockRejectedValue(new Error('db down'))

    expect(await zoneFor('u1')).toBe('America/New_York')
  })
})
