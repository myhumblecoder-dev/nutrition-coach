import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Home from './page'
import { auth } from '@/auth'
import { getToday } from '@/app/actions/getToday'
import { getWeek } from '@/app/actions/getWeek'
import { getActivity } from '@/app/actions/getActivity'
import { prisma } from '@/lib/db'

vi.mock('@/auth', () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('@/app/actions/getToday', () => ({ getToday: vi.fn() }))
vi.mock('@/app/actions/getWeek', () => ({ getWeek: vi.fn() }))
vi.mock('@/app/actions/getActivity', () => ({ getActivity: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { chatMessage: { findFirst: vi.fn() } } }))
vi.mock('@/components/RemainingCard', () => ({ default: vi.fn(() => <div data-testid="remaining-card" />) }))
vi.mock('@/components/CoachStrip', () => ({ default: vi.fn(() => <div data-testid="coach-strip" />) }))
vi.mock('@/components/ActivityFeed', () => ({ default: vi.fn(() => <div data-testid="activity-feed" />) }))
vi.mock('@/components/TrainingCard', () => ({ default: vi.fn(() => <div data-testid="training-card" />) }))
vi.mock('@/components/RecoveryCard', () => ({ default: vi.fn(() => <div data-testid="recovery-card" />) }))
vi.mock('@/app/actions/uploadMealPhoto', () => ({ uploadMealPhoto: vi.fn() }))
vi.mock('@/app/actions/analyzeMeal', () => ({ analyzeMeal: vi.fn() }))
vi.mock('@/app/actions/saveMealEntry', () => ({ saveMealEntry: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const noDays = [false, false, false, false, false, false, false]
    vi.mocked(getWeek).mockResolvedValue({
      training: {
        resistance: 0, hiit: 0, core: 0, stepsToday: 0,
        days: { resistance: noDays, hiit: noDays, core: noDays },
      },
      recovery: { sleepHours: null, waterLiters: null, alcoholDrinks: null },
      mood: null,
      measurement: null,
      streak: noDays,
      weights: [],
    } as never)
    vi.mocked(getActivity).mockResolvedValue([] as never)
    vi.mocked(prisma.chatMessage.findFirst).mockResolvedValue(null as never)
  })

  it('prompts a signed-out visitor and does not read the database', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    render(await Home())

    expect(screen.getByText(/sign in to start logging/i)).toBeInTheDocument()
    expect(getToday).not.toHaveBeenCalled()
    expect(getWeek).not.toHaveBeenCalled()
    expect(getActivity).not.toHaveBeenCalled()
  })

  it('renders the app for a signed-in user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(getToday).mockResolvedValue({
      meals: [], target: null, consumed: { calories: 0, protein: 0 },
    } as never)

    render(await Home())

    expect(screen.getByText(/no meals logged today/i)).toBeInTheDocument()
    expect(getWeek).toHaveBeenCalled()
    expect(getActivity).toHaveBeenCalled()
  })

  it('a signed-out visitor sees the sign-in button', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    render(await Home())

    expect(
      screen.getByRole('button', { name: 'Sign in with GitHub' })
    ).toBeInTheDocument()
  })

  it('a signed-in user does not get an inline sign-out (it lives in the nav)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(getToday).mockResolvedValue({
      meals: [], target: null, consumed: { calories: 0, protein: 0 },
    } as never)

    render(await Home())

    expect(screen.queryByText('Sign out')).not.toBeInTheDocument()
  })
})
