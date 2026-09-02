import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DeleteAccount from './DeleteAccount'
import { deleteAccount } from '@/app/actions/deleteAccount'

vi.mock('@/app/actions/deleteAccount', () => ({ deleteAccount: vi.fn() }))

describe('DeleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the destructive action behind a confirmation step', () => {
    render(<DeleteAccount />)

    // Nothing dangerous is one click away: no input until the user opts in.
    expect(screen.queryByLabelText(/type DELETE/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument()
  })

  it('requires the typed phrase before the confirm button enables', () => {
    render(<DeleteAccount />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    const confirmButton = screen.getByRole('button', { name: 'Permanently delete' })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/type DELETE/i), { target: { value: 'nope' } })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/type DELETE/i), { target: { value: 'DELETE' } })
    expect(confirmButton).toBeEnabled()
  })

  it('calls the action with the confirmation once confirmed', async () => {
    vi.mocked(deleteAccount).mockResolvedValue(undefined)
    render(<DeleteAccount />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.change(screen.getByLabelText(/type DELETE/i), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Permanently delete' }))

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('DELETE'))
  })

  it('surfaces a failure instead of leaving the user guessing', async () => {
    vi.mocked(deleteAccount).mockRejectedValue(new Error('Unauthorized'))
    render(<DeleteAccount />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.change(screen.getByLabelText(/type DELETE/i), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Permanently delete' }))

    expect(await screen.findByText('Unauthorized')).toBeInTheDocument()
  })

  it('can be backed out of', () => {
    render(<DeleteAccount />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText(/type DELETE/i)).not.toBeInTheDocument()
    expect(deleteAccount).not.toHaveBeenCalled()
  })
})
