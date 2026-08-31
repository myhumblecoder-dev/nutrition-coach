import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import MealConfirmCard from './MealConfirmCard'
import { saveMealEntry } from '@/app/actions/saveMealEntry'

vi.mock('@/app/actions/saveMealEntry', () => ({
  saveMealEntry: vi.fn(),
}))

describe('MealConfirmCard', () => {
  const mockAnalysis = {
    photoUrl: 'https://example.com/meal.jpg',
    foodItems: [
      { name: 'Egg', portion: '2 large', calories: 140, protein: 12 },
      { name: 'Toast', portion: '1 slice', calories: 70, protein: 2 },
    ],
    totalCalories: 210,
    totalProtein: 14,
  }

  const mockOnSaved = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('MealConfirmCard renders', async () => {
    render(
      <MealConfirmCard
        analysis={mockAnalysis}
        onSaved={mockOnSaved}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.getByText('Egg')).toBeInTheDocument()
    expect(screen.getByText('Toast')).toBeInTheDocument()
    expect(screen.getByLabelText('Total Calories')).toHaveValue(210)
    expect(screen.getByLabelText('Total Protein (g)')).toHaveValue(14)
  })

  it('logs the edited totals', async () => {
    const user = userEvent.setup()
    render(
      <MealConfirmCard
        analysis={mockAnalysis}
        onSaved={mockOnSaved}
        onCancel={mockOnCancel}
      />
    )

    const caloriesInput = screen.getByLabelText('Total Calories')
    await user.clear(caloriesInput)
    await user.type(caloriesInput, '450')

    const logButton = screen.getByRole('button', { name: /log meal/i })
    await user.click(logButton)

    expect(saveMealEntry).toHaveBeenCalledWith({
      photoUrl: mockAnalysis.photoUrl,
      foodItems: mockAnalysis.foodItems,
      totalCalories: 450,
      totalProtein: 14,
    })
    expect(mockOnSaved).toHaveBeenCalled()
  })

  it('cancel does not save', async () => {
    const user = userEvent.setup()
    render(
      <MealConfirmCard
        analysis={mockAnalysis}
        onSaved={mockOnSaved}
        onCancel={mockOnCancel}
      />
    )

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    expect(mockOnCancel).toHaveBeenCalled()
    expect(saveMealEntry).not.toHaveBeenCalled()
  })

  it('shows a failed save inline and does not report', async () => {
    const user = userEvent.setup()
    vi.mocked(saveMealEntry).mockRejectedValue(new Error('Unauthorized'))

    render(
      <MealConfirmCard
        analysis={mockAnalysis}
        onSaved={mockOnSaved}
        onCancel={mockOnCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: /log meal/i }))

    expect(await screen.findByText('Unauthorized')).toBeInTheDocument()
    expect(mockOnSaved).not.toHaveBeenCalled()
  })
})