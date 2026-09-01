import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import HomeClient from './HomeClient'
import { uploadMealPhoto } from '@/app/actions/uploadMealPhoto'
import { analyzeMeal } from '@/app/actions/analyzeMeal'

vi.mock('@/app/actions/uploadMealPhoto', () => ({ uploadMealPhoto: vi.fn() }))
vi.mock('@/app/actions/analyzeMeal', () => ({ analyzeMeal: vi.fn() }))
vi.mock('@/app/actions/saveMealEntry', () => ({ saveMealEntry: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/TrainingCard', () => ({ default: vi.fn(() => <div data-testid="training-card" />) }))
vi.mock('@/components/RecoveryCard', () => ({ default: vi.fn(() => <div data-testid="recovery-card" />) }))
vi.mock('@/components/RemainingCard', () => ({ default: vi.fn(() => <div data-testid="remaining-card" />) }))
vi.mock('@/components/CoachStrip', () => ({ default: vi.fn(() => <div data-testid="coach-strip" />) }))
vi.mock('@/components/ActivityFeed', () => ({ default: vi.fn(() => <div data-testid="activity-feed" />) }))

const today = {
  meals: [],
  target: { calories: 2000, protein: 150 },
  consumed: { calories: 800, protein: 60 },
}

const noDays = [false, false, false, false, false, false, false]
const week = {
  training: {
    resistance: 0, hiit: 0, core: 0, stepsToday: 0,
    days: { resistance: noDays, hiit: noDays, core: noDays },
  },
  recovery: { sleepHours: null, waterLiters: null, alcoholDrinks: null },
  mood: null,
  measurement: null,
  streak: noDays,
  weights: [],
}

describe('HomeClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the dashboard from props', () => {
    render(<HomeClient today={today} week={week} activity={[]} coachMessage={null} />)
    expect(screen.getByText('of 2000 kcal')).toBeInTheDocument()
    expect(screen.getByText(/800 kcal in/)).toBeInTheDocument()
    const expectedDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric',
    })
    expect(screen.getByText(new RegExp(expectedDate))).toBeInTheDocument()
  })

  it('renders the training and recovery cards', () => {
    render(<HomeClient today={today} week={week} activity={[]} coachMessage={null} />)
    expect(screen.getByTestId('training-card')).toBeInTheDocument()
    expect(screen.getByTestId('recovery-card')).toBeInTheDocument()
    expect(screen.getByTestId('remaining-card')).toBeInTheDocument()
    expect(screen.getByTestId('coach-strip')).toBeInTheDocument()
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument()
  })

  it('shows the confirm card once a photo is analysed', async () => {
    vi.mocked(uploadMealPhoto).mockResolvedValue({ url: 'https://blob/m.jpg' })
    vi.mocked(analyzeMeal).mockResolvedValue({
      foodItems: [{ name: 'Eggs', portion: '2', calories: 140, protein: 12 }],
      totalCalories: 140,
      totalProtein: 12,
    })

    render(<HomeClient today={today} week={week} activity={[]} coachMessage={null} />)
    const file = new File(['x'], 'm.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/photograph a meal/i), {
      target: { files: [file] },
    })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /log meal/i })).toBeInTheDocument())
  })
})
