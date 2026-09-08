import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { confirmPendingMeal } from '@/lib/meals'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/meals', () => ({ confirmPendingMeal: vi.fn() }))

const mockAuth = vi.mocked(authenticateBearer)
const mockConfirm = vi.mocked(confirmPendingMeal)

const params = { params: Promise.resolve({ id: 'meal-1' }) }

function request(body: unknown) {
  return new Request('http://test/api/v1/meals/meal-1/confirm', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/v1/meals/[id]/confirm', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without a valid bearer and never confirms', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST(request({}), params)

    expect(res.status).toBe(401)
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('confirms the meal scoped to the authenticated user', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockConfirm.mockResolvedValue(true)

    const res = await POST(request({}), params)

    expect(res.status).toBe(200)
    expect(mockConfirm).toHaveBeenCalledWith('user-1', 'meal-1', {})
  })

  it('applies totals the user corrected before logging', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockConfirm.mockResolvedValue(true)

    await POST(request({ totalCalories: 500, totalProtein: 40 }), params)

    expect(mockConfirm).toHaveBeenCalledWith('user-1', 'meal-1', {
      totalCalories: 500,
      totalProtein: 40,
    })
  })

  it('rejects a negative total rather than storing it', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(request({ totalCalories: -5 }), params)

    expect(res.status).toBe(400)
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('accepts a completely empty body as agreement with the estimate', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockConfirm.mockResolvedValue(true)

    // No body at all, not "{}" — a client with nothing to correct has nothing
    // to send, and JSON.parse('') would throw.
    const res = await POST(
      new Request('http://test/api/v1/meals/meal-1/confirm', { method: 'POST' }),
      params
    )

    expect(res.status).toBe(200)
    expect(mockConfirm).toHaveBeenCalledWith('user-1', 'meal-1', {})
  })

  it('returns 404 when the meal is no longer pending', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockConfirm.mockResolvedValue(false)

    const res = await POST(request({}), params)

    expect(res.status).toBe(404)
  })
})
