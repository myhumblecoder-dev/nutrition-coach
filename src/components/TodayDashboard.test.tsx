import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TodayDashboard from './TodayDashboard'

vi.mock('@/components/DeleteMealButton', () => ({
  default: vi.fn(() => <button aria-label="Delete meal" />),
}))

describe('TodayDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('TodayDashboard renders', async () => {
    const props = {
      consumed: { calories: 800, protein: 60 },
      target: { calories: 2000, protein: 150 },
      meals: [
        {
          id: '1',
          // foodItems is stored as a JSON-encoded array (MealEntry schema)
          foodItems: JSON.stringify([
            { name: 'Oatmeal', portion: '1 bowl', calories: 300, protein: 10 },
            { name: 'Berries', portion: '1/2 cup', calories: 50, protein: 2 },
          ]),
          totalCalories: 350,
          totalProtein: 12,
        },
        {
          id: '2',
          foodItems: JSON.stringify([
            { name: 'Chicken Salad', portion: '1 plate', calories: 450, protein: 48 },
          ]),
          totalCalories: 450,
          totalProtein: 48,
        },
      ],
    }

    render(<TodayDashboard {...props} />)

    // Test shows consumed against target
    expect(screen.getByText('800 / 2000 cal')).toBeInTheDocument()
    expect(screen.getByText('60 / 150 g protein')).toBeInTheDocument()

    // Test shows the meal rows with joined item names, not raw JSON
    expect(screen.getByText('Oatmeal, Berries')).toBeInTheDocument()
    expect(screen.getByText('350 cal • 12g protein')).toBeInTheDocument()
    expect(screen.getByText('Chicken Salad')).toBeInTheDocument()
    expect(screen.getByText('450 cal • 48g protein')).toBeInTheDocument()
  })

  it('renders the fallback label for unparseable foodItems', () => {
    const props = {
      consumed: { calories: 100, protein: 5 },
      target: null,
      meals: [
        { id: '1', foodItems: 'not json', totalCalories: 100, totalProtein: 5 },
      ],
    }

    render(<TodayDashboard {...props} />)

    expect(screen.getByText('Meal')).toBeInTheDocument()
  })

  it('each meal row renders a delete button', () => {
    const props = {
      consumed: { calories: 800, protein: 60 },
      target: null,
      meals: [
        { id: '1', foodItems: '[]', totalCalories: 300, totalProtein: 20 },
        { id: '2', foodItems: '[]', totalCalories: 500, totalProtein: 40 },
      ],
    }

    render(<TodayDashboard {...props} />)

    expect(screen.getAllByRole('button', { name: 'Delete meal' })).toHaveLength(2)
  })

  it('TodayDashboard prompts when no target is set', async () => {
    const props = {
      consumed: { calories: 0, protein: 0 },
      target: null,
      meals: [],
    }

    render(<TodayDashboard {...props} />)

    // Test prompts when no target is set
    expect(screen.getByText('Set your daily targets')).toBeInTheDocument()
  })

  it('TodayDashboard shows the empty state', async () => {
    const props = {
      consumed: { calories: 0, protein: 0 },
      target: { calories: 2000, protein: 150 },
      meals: [],
    }

    render(<TodayDashboard {...props} />)

    // Test shows the empty state
    expect(screen.getByText('No meals logged today')).toBeInTheDocument()
  })
})
