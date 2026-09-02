import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deleteAccount } from './deleteAccount'
import { auth, signOut } from '@/auth'
import { prisma } from '@/lib/db'

vi.mock('@/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { user: { delete: vi.fn() } } }))

describe('deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('the module source begins with the use server directive', () => {
    const firstLine = readFileSync(join(process.cwd(), 'src/app/actions/deleteAccount.ts'), 'utf8').split('\n')[0]
    expect(firstLine).toMatch(/^['"]use server['"];?\s*$/)
  })

  it('throws Unauthorized when signed out and deletes nothing', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    await expect(deleteAccount('DELETE')).rejects.toThrow('Unauthorized')
    expect(prisma.user.delete).not.toHaveBeenCalled()
  })

  it('refuses without the exact confirmation phrase', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)

    for (const bad of ['', 'delete me', 'DELET', 'yes']) {
      await expect(deleteAccount(bad)).rejects.toThrow(/confirm/i)
    }
    expect(prisma.user.delete).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('deletes the signed-in user and signs them out', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(prisma.user.delete).mockResolvedValue({ id: 'u1' } as never)

    await deleteAccount('DELETE')

    // One delete, scoped to the session user — every related table cascades.
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } })
    expect(signOut).toHaveBeenCalledWith({ redirectTo: '/' })
  })

  it('tolerates surrounding whitespace in the confirmation', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(prisma.user.delete).mockResolvedValue({ id: 'u1' } as never)

    await deleteAccount('  DELETE  ')

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } })
  })
})
