import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import HomeClient from './HomeClient'
import { uploadMealPhoto } from '@/app/actions/uploadMealPhoto'
import { analyzeMeal } from '@/app/actions/analyzeMeal'

vi.mock('@/app/actions/uploadMealPhoto', () => ({ uploadMealPhoto: vi.fn() }))
vi.mock('@/app/actions/analyzeMeal', () => ({ analyzeMeal: vi.fn() }))
vi.mock('@/app/actions/saveMealEntry', () => ({ saveMealEntry: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const today = {
  meals: [],
  target: { calories: 2000, protein: 150 },
  consumed: { calories: 800, protein: 60 },
}

describe('HomeClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the dashboard from props', () => {
    render(<HomeClient today={today} />)
    expect(screen.getByText(/800 \/ 2000 cal/i)).toBeInTheDocument()
  })

  it('shows the confirm card once a photo is analysed', async () => {
    vi.mocked(uploadMealPhoto).mockResolvedValue({ url: 'https://blob/m.jpg' })
    vi.mocked(analyzeMeal).mockResolvedValue({
      foodItems: [{ name: 'Eggs', portion: '2', calories: 140, protein: 12 }],
      totalCalories: 140,
      totalProtein: 12,
    })

    render(<HomeClient today={today} />)
    const file = new File(['x'], 'm.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/photograph a meal/i), {
      target: { files: [file] },
    })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /log meal/i })).toBeInTheDocument())
  })
})
