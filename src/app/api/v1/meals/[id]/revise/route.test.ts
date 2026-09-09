import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { analyzeMeal } from '@/lib/analyzeMeal'
import { getPendingMeal, updatePendingMealAnalysis } from '@/lib/meals'
import { UsageLimitError } from '@/lib/limits'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/analyzeMeal', () => ({ analyzeMeal: vi.fn() }))
vi.mock('@/lib/meals', () => ({
  getPendingMeal: vi.fn(),
  updatePendingMealAnalysis: vi.fn(),
}))

const mockAuth = vi.mocked(authenticateBearer)
const mockAnalyze = vi.mocked(analyzeMeal)
const mockGet = vi.mocked(getPendingMeal)
const mockUpdate = vi.mocked(updatePendingMealAnalysis)

const REVISED = {
  foodItems: [{ name: 'chicken', portion: '2 cups', calories: 700, protein: 60 }],
  totalCalories: 700,
  totalProtein: 60,
}

const params = { params: Promise.resolve({ id: 'meal-1' }) }

function request(body: unknown) {
  return new Request('http://test/api/v1/meals/meal-1/revise', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/v1/meals/[id]/revise', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGet.mockResolvedValue({ photoUrl: 'https://blob/x.jpg', sourceText: 'burrito bowl' })
    mockAnalyze.mockResolvedValue(REVISED as never)
    mockUpdate.mockResolvedValue(true)
  })

  it('returns 401 without a valid bearer and never spends a vision call', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST(request({ correction: 'that is chicken' }), params)

    expect(res.status).toBe(401)
    expect(mockAnalyze).not.toHaveBeenCalled()
  })

  it('re-reads the same photo with the correction appended to what was said before', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(request({ correction: 'double portion' }), params)

    expect(res.status).toBe(200)
    // The earlier words are kept: "double portion" alone would lose what the
    // food actually is, and the model needs both.
    expect(mockAnalyze).toHaveBeenCalledWith(
      'user-1', 'https://blob/x.jpg', 'burrito bowl. double portion'
    )
    expect(await res.json()).toEqual({ mealId: 'meal-1', photoUrl: 'https://blob/x.jpg', ...REVISED })
  })

  it('uses the correction alone when nothing was said before', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockGet.mockResolvedValue({ photoUrl: 'https://blob/x.jpg', sourceText: null })

    await POST(request({ correction: 'that is chicken' }), params)

    expect(mockAnalyze).toHaveBeenCalledWith('user-1', 'https://blob/x.jpg', 'that is chicken')
  })

  it('writes the revision back but leaves the meal pending', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    await POST(request({ correction: 'double portion' }), params)

    expect(mockUpdate).toHaveBeenCalledWith(
      'user-1', 'meal-1', REVISED, 'burrito bowl. double portion'
    )
  })

  it('returns 404 when there is no pending meal to correct', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockGet.mockResolvedValue(null)

    const res = await POST(request({ correction: 'x' }), params)

    expect(res.status).toBe(404)
    expect(mockAnalyze).not.toHaveBeenCalled()
  })

  it('returns 404 when the meal stops being pending mid-correction', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockUpdate.mockResolvedValue(false)

    const res = await POST(request({ correction: 'x' }), params)

    expect(res.status).toBe(404)
  })

  it('answers a lapsed subscription with 402, not 429', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockAnalyze.mockRejectedValue(
      new UsageLimitError('that needs a subscription', 'subscription_required')
    )

    const res = await POST(request({ correction: 'x' }), params)

    // 429 means come back tomorrow; 402 means this costs money now. The client
    // shows an inline message for one and a paywall for the other, and cannot
    // tell them apart from the prose.
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual({
      error: 'that needs a subscription',
      code: 'subscription_required',
    })
  })

  it('passes the daily cap message through with a 429', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockAnalyze.mockRejectedValue(new UsageLimitError("That's plenty of photos for today."))

    const res = await POST(request({ correction: 'x' }), params)

    // A correction costs a vision call like any other read, so it can hit the
    // same cap and must say the same thing.
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe("That's plenty of photos for today.")
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects an empty correction rather than burning a call on nothing', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(request({ correction: '   ' }), params)

    expect(res.status).toBe(400)
    expect(mockAnalyze).not.toHaveBeenCalled()
  })
})
