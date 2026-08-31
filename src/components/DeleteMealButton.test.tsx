import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DeleteMealButton from './DeleteMealButton'
import { deleteMealEntry } from '@/app/actions/deleteMealEntry'

const refresh = vi.fn()

vi.mock('@/app/actions/deleteMealEntry', () => ({ deleteMealEntry: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

describe('DeleteMealButton', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the meal and refreshes', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteMealEntry).mockResolvedValue({ deleted: true })

    render(<DeleteMealButton mealId="meal-1" />)

    await user.click(screen.getByRole('button', { name: 'Delete meal' }))

    expect(deleteMealEntry).toHaveBeenCalledWith('meal-1')
    expect(refresh).toHaveBeenCalled()
  })

  it('a failed delete does not refresh', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(deleteMealEntry).mockRejectedValue(new Error('Meal not found'))

    render(<DeleteMealButton mealId="meal-1" />)

    await user.click(screen.getByRole('button', { name: 'Delete meal' }))

    expect(refresh).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
