import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { discardPendingMeal } from '@/lib/meals'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/meals', () => ({ discardPendingMeal: vi.fn() }))

const mockAuth = vi.mocked(authenticateBearer)
const mockDiscard = vi.mocked(discardPendingMeal)

const request = new Request('http://test/api/v1/meals/meal-1', { method: 'DELETE' })
const params = { params: Promise.resolve({ id: 'meal-1' }) }

describe('DELETE /api/v1/meals/[id]', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without a valid bearer and never deletes', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await DELETE(request, params)

    expect(res.status).toBe(401)
    expect(mockDiscard).not.toHaveBeenCalled()
  })

  it('discards the meal scoped to the authenticated user', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockDiscard.mockResolvedValue(true)

    const res = await DELETE(request, params)

    expect(res.status).toBe(200)
    expect(mockDiscard).toHaveBeenCalledWith('user-1', 'meal-1')
  })

  it('returns 404 when the meal is no longer pending', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    // Someone else's meal id, a double tap, or a meal already confirmed all
    // land here — and none of them should read as success.
    mockDiscard.mockResolvedValue(false)

    const res = await DELETE(request, params)

    expect(res.status).toBe(404)
  })
})
