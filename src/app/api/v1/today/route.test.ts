import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { getTodayForUser } from '@/lib/dashboard'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/dashboard', async (importOriginal) => ({
  // parseFoodItems is pure, so the real implementation is exercised here.
  ...(await importOriginal<typeof import('@/lib/dashboard')>()),
  getTodayForUser: vi.fn(),
}))

const mockAuth = vi.mocked(authenticateBearer)
const mockGetToday = vi.mocked(getTodayForUser)

const request = new Request('http://test/api/v1/today')

const LOGGED_AT = new Date('2026-09-02T15:04:05.000Z')

function todayFixture(overrides: Partial<Awaited<ReturnType<typeof getTodayForUser>>> = {}) {
  return {
    meals: [
      {
        id: 'm1',
        foodItems: '[{"name":"eggs","portion":"2","calories":140,"protein":12}]',
        totalCalories: 140,
        totalProtein: 12,
        photoUrl: 'https://blob/x.jpg',
        loggedAt: LOGGED_AT,
        source: 'manual',
      },
    ],
    target: { calories: 2000, protein: 150 },
    consumed: { calories: 140, protein: 12 },
    ...overrides,
  }
}

describe('GET /api/v1/today', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without a valid bearer and never queries', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await GET(request)

    expect(res.status).toBe(401)
    expect(mockGetToday).not.toHaveBeenCalled()
  })

  it('scopes the query to the authenticated user', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockGetToday.mockResolvedValue(todayFixture() as never)

    await GET(request)

    expect(mockGetToday).toHaveBeenCalledWith('user-1')
  })

  it('parses foodItems into structured fields rather than a JSON string', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockGetToday.mockResolvedValue(todayFixture() as never)

    const body = await (await GET(request)).json()

    expect(body.meals[0].foodItems).toEqual([
      { name: 'eggs', portion: '2', calories: 140, protein: 12 },
    ])
    expect(body.meals[0].loggedAt).toBe(LOGGED_AT.toISOString())
    expect(body.target).toEqual({ calories: 2000, protein: 150 })
  })

  it('survives a malformed foodItems row instead of failing the whole day', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockGetToday.mockResolvedValue(
      todayFixture({
        meals: [{ ...todayFixture().meals[0], foodItems: 'not json' }],
      }) as never
    )

    const res = await GET(request)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ meals: [{ foodItems: [] }] })
  })

  it('reports a chat-logged meal photo as null rather than an empty string', async () => {
    // Chat-extracted meals store photoUrl: '' — a native client should get an
    // explicit absence, not a falsy string to special-case.
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockGetToday.mockResolvedValue(
      todayFixture({ meals: [{ ...todayFixture().meals[0], photoUrl: '' }] }) as never
    )

    const body = await (await GET(request)).json()

    expect(body.meals[0].photoUrl).toBeNull()
  })
})
