import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TodayDashboard from './TodayDashboard'

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
          foodItems: 'Oatmeal with Berries',
          totalCalories: 350,
          totalProtein: 12,
        },
        {
          id: '2',
          foodItems: 'Chicken Salad',
          totalCalories: 450,
          totalProtein: 48,
        },
      ],
    }

    render(<TodayDashboard {...props} />)

    // Test shows consumed against target
    expect(screen.getByText('800 / 2000 cal')).toBeInTheDocument()
    expect(screen.getByText('60 / 150 g protein')).toBeInTheDocument()

    // Test shows the meal rows
    expect(screen.getByText('Oatmeal with Berries')).toBeInTheDocument()
    expect(screen.getByText('350 cal • 12g protein')).toBeInTheDocument()
    expect(screen.getByText('Chicken Salad')).toBeInTheDocument()
    expect(screen.getByText('450 cal • 48g protein')).toBeInTheDocument()
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
