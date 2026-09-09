import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import {
  getTodayForUser,
  getWeekForUser,
  getActivityForUser,
  getCoachMessageForUser,
} from '@/lib/dashboard'
import { zoneFor } from '@/lib/userZone'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/attest', () => ({ requireAttestation: vi.fn() }))
vi.mock('@/lib/onboarding', () => ({ ensureOpeningMessage: vi.fn() }))
vi.mock('@/lib/userZone', () => ({ zoneFor: vi.fn().mockResolvedValue('Europe/London') }))
vi.mock('@/lib/dashboard', async (importOriginal) => ({
  // parseFoodItems is pure and is exercised for real: the route's job is to
  // hand a native client structured items instead of a JSON string, and
  // mocking that away would test nothing.
  ...(await importOriginal<typeof import('@/lib/dashboard')>()),
  getTodayForUser: vi.fn(),
  getWeekForUser: vi.fn(),
  getActivityForUser: vi.fn(),
  getCoachMessageForUser: vi.fn(),
}))

const req = () =>
  new Request('http://test/api/v1/dashboard', { headers: { authorization: 'Bearer t' } })

const emptyWeek = {
  training: {
    resistance: 0, hiit: 0, core: 0, stepsToday: 0,
    days: { resistance: [], hiit: [], core: [] },
  },
  recovery: { sleepHours: null, waterLiters: null, caffeine: null },
  streak: [false, false, false, false, false, false, true],
  weights: [],
  mood: null,
  measurement: null,
}

describe('GET /api/v1/dashboard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(requireAttestation).mockResolvedValue({ blocked: null, keyId: null })
    vi.mocked(authenticateBearer).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(getTodayForUser).mockResolvedValue({ meals: [], target: null, consumed: { calories: 0, protein: 0 } } as never)
    vi.mocked(getWeekForUser).mockResolvedValue(emptyWeek as never)
    vi.mocked(getActivityForUser).mockResolvedValue([] as never)
    vi.mocked(getCoachMessageForUser).mockResolvedValue(null)
    // resetAllMocks clears implementations, not just calls — without this the
    // route gets `undefined` for the zone.
    vi.mocked(zoneFor).mockResolvedValue('Europe/London')
  })

  it('401s without a bearer and reads nothing', async () => {
    vi.mocked(authenticateBearer).mockResolvedValue(null)

    const res = await GET(req())

    expect(res.status).toBe(401)
    expect(getTodayForUser).not.toHaveBeenCalled()
  })

  it('returns the attestation refusal untouched', async () => {
    vi.mocked(requireAttestation).mockResolvedValue({
      blocked: Response.json({ error: 'Attestation required' }, { status: 401 }),
      keyId: null,
    })

    const res = await GET(req())

    expect(res.status).toBe(401)
    expect(authenticateBearer).not.toHaveBeenCalled()
  })

  it('serves the whole screen in one request, scoped to the bearer', async () => {
    // Four round trips is free in a server component and is not free on a
    // phone. All four reads must be for the same user.
    const res = await GET(req())
    const body = await res.json()

    expect(Object.keys(body).sort()).toEqual(['activity', 'coachMessage', 'today', 'week'])
    // The three day-scoped sections also receive the user's timezone; the
    // coach message has no day boundary of its own.
    for (const fn of [getTodayForUser, getWeekForUser, getActivityForUser]) {
      expect(fn).toHaveBeenCalledWith('u1', expect.any(String))
    }
    expect(getCoachMessageForUser).toHaveBeenCalledWith('u1')
  })

  it('parses foodItems into structured items rather than a JSON string', async () => {
    vi.mocked(getTodayForUser).mockResolvedValue({
      meals: [{
        id: 'm1',
        foodItems: '[{"name":"Baozi","portion":"5","calories":600,"protein":25}]',
        totalCalories: 600, totalProtein: 25, photoUrl: '', source: 'extracted',
        loggedAt: new Date('2026-09-06T13:17:00.000Z'),
      }],
      target: { calories: 2000, protein: 150 },
      consumed: { calories: 600, protein: 25 },
    } as never)

    const body = await (await GET(req())).json()

    expect(body.today.meals[0].foodItems).toEqual([
      { name: 'Baozi', portion: '5', calories: 600, protein: 25 },
    ])
    // An empty photoUrl is null, not "": a chat-logged meal has no photo, and
    // an empty string reads as a broken image rather than an absent one.
    expect(body.today.meals[0].photoUrl).toBeNull()
    expect(body.today.meals[0].loggedAt).toBe('2026-09-06T13:17:00.000Z')
  })

  it('keeps sourceText on every receipt, including when it is empty', async () => {
    // sourceText is the evidence that a number came from the conversation.
    // Dropping empty ones would make a manually-added row indistinguishable
    // from one whose words were lost.
    vi.mocked(getActivityForUser).mockResolvedValue([
      { id: 'a1', at: new Date('2026-09-06T16:32:00.000Z'), sourceText: 'went for a 45 minute walk', source: 'extracted', kind: 'training', label: 'neat · 45 min', photoUrl: null },
      { id: 'a2', at: new Date('2026-09-06T12:20:00.000Z'), sourceText: '', source: 'manual', kind: 'meal', label: 'salmon salad · 485 kcal · 37g', photoUrl: 'https://blob/x.jpg' },
    ] as never)

    const body = await (await GET(req())).json()

    expect(body.activity.map((a: { sourceText: string }) => a.sourceText))
      .toEqual(['went for a 45 minute walk', ''])
    expect(body.activity[1].photoUrl).toBe('https://blob/x.jpg')
  })

  it('serialises weight history as ISO dates for the sparkline', async () => {
    vi.mocked(getWeekForUser).mockResolvedValue({
      ...emptyWeek,
      weights: [{ at: new Date('2026-09-01T08:00:00.000Z'), weightLb: 173.4 }],
      measurement: { weightLb: 172, waistIn: null },
    } as never)

    const body = await (await GET(req())).json()

    expect(body.week.weights).toEqual([{ at: '2026-09-01T08:00:00.000Z', weightLb: 173.4 }])
  })

  it('passes the coach line through for the strip', async () => {
    vi.mocked(getCoachMessageForUser).mockResolvedValue('Protein is the lever today.')

    const body = await (await GET(req())).json()

    expect(body.coachMessage).toBe('Protein is the lever today.')
  })

  it('seeds the coach\'s opening question before Today reads it', async () => {
    // A new user lands on Today, not Chat. If only the chat read seeded the
    // opening message, the coach's question would sit in a tab they never
    // opened — which is exactly how it shipped.
    const { ensureOpeningMessage } = await import('@/lib/onboarding')

    await GET(req())

    expect(vi.mocked(ensureOpeningMessage)).toHaveBeenCalledWith('u1')
  })
})

describe('the whole screen agrees about when today started', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(requireAttestation).mockResolvedValue({ blocked: null, keyId: null })
    vi.mocked(authenticateBearer).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(zoneFor).mockResolvedValue('Europe/London')
    vi.mocked(getTodayForUser).mockResolvedValue({ meals: [], target: null, consumed: { calories: 0, protein: 0 } } as never)
    vi.mocked(getWeekForUser).mockResolvedValue(emptyWeek as never)
    vi.mocked(getActivityForUser).mockResolvedValue([] as never)
    vi.mocked(getCoachMessageForUser).mockResolvedValue(null)
  })

  it('resolves the timezone once and gives every section the same one', async () => {
    // Three lookups of the same value on the main screen load would be waste,
    // and sections disagreeing about the day boundary would show rings and
    // receipts from different days.

    await GET(req())

    expect(zoneFor).toHaveBeenCalledTimes(1)
    for (const fn of [getTodayForUser, getWeekForUser, getActivityForUser]) {
      expect(fn).toHaveBeenCalledWith('u1', 'Europe/London')
    }
  })
})
