import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DailyTargetForm from './DailyTargetForm'
import { useRouter } from 'next/navigation'
import { upsertDailyTarget } from '@/app/actions/upsertDailyTarget'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    refresh: vi.fn(),
  })),
}))

vi.mock('@/app/actions/upsertDailyTarget', () => ({
  upsertDailyTarget: vi.fn(),
}))

describe('DailyTargetForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('DailyTargetForm renders', async () => {
    render(<DailyTargetForm initial={{ calories: 2000, protein: 150 }} />)
    expect(screen.getByLabelText('Daily calories')).toHaveValue(2000)
    expect(screen.getByLabelText('Daily protein (g)')).toHaveValue(150)
  })

  it('saves the entered targets', async () => {
    const user = userEvent.setup()
    render(<DailyTargetForm initial={null} />)

    const caloriesInput = screen.getByLabelText('Daily calories')
    const proteinInput = screen.getByLabelText('Daily protein (g)')
    const saveButton = screen.getByRole('button', { name: 'Save targets' })

    await user.clear(caloriesInput)
    await user.type(caloriesInput, '2000')
    await user.clear(proteinInput)
    await user.type(proteinInput, '150')

    await user.click(saveButton)

    expect(upsertDailyTarget).toHaveBeenCalledWith({ calories: 2000, protein: 150 })
  })

  it('shows confirmation after saving', async () => {
    const user = userEvent.setup()
    render(<DailyTargetForm initial={null} />)

    const saveButton = screen.getByRole('button', { name: 'Save targets' })
    await user.click(saveButton)

    expect(await screen.findByText('Targets saved')).toBeInTheDocument()
  })
})
