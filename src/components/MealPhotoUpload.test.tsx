import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import MealPhotoUpload from './MealPhotoUpload'
import { uploadMealPhoto } from '@/app/actions/uploadMealPhoto'
import { analyzeMeal } from '@/app/actions/analyzeMeal'

vi.mock('@/app/actions/uploadMealPhoto', () => ({ uploadMealPhoto: vi.fn() }))
vi.mock('@/app/actions/analyzeMeal', () => ({ analyzeMeal: vi.fn() }))

const analysis = {
  foodItems: [{ name: 'Grilled chicken', portion: '200g', calories: 330, protein: 62 }],
  totalCalories: 330,
  totalProtein: 62,
}

function selectFile() {
  const input = screen.getByLabelText(/photograph a meal/i)
  const file = new File(['x'], 'meal.jpg', { type: 'image/jpeg' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('MealPhotoUpload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uploads the photo, analyses it, and reports the result', async () => {
    vi.mocked(uploadMealPhoto).mockResolvedValue({ url: 'https://blob/meal.jpg' })
    vi.mocked(analyzeMeal).mockResolvedValue(analysis)
    const onAnalyzed = vi.fn()

    render(<MealPhotoUpload onAnalyzed={onAnalyzed} />)
    selectFile()

    await waitFor(() => expect(onAnalyzed).toHaveBeenCalled())
    expect(analyzeMeal).toHaveBeenCalledWith('https://blob/meal.jpg')
    expect(onAnalyzed).toHaveBeenCalledWith(
      expect.objectContaining({ photoUrl: 'https://blob/meal.jpg', totalCalories: 330 }))
  })

  it('shows the error and does not report when analysis fails', async () => {
    vi.mocked(uploadMealPhoto).mockResolvedValue({ url: 'https://blob/meal.jpg' })
    vi.mocked(analyzeMeal).mockRejectedValue(
      new Error('Vision API returned invalid JSON structure'))
    const onAnalyzed = vi.fn()

    render(<MealPhotoUpload onAnalyzed={onAnalyzed} />)
    selectFile()

    expect(await screen.findByText(/invalid JSON structure/i)).toBeInTheDocument()
    expect(onAnalyzed).not.toHaveBeenCalled()
  })
})
