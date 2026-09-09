import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deletePhotos } from './photoStore'
import { del } from '@vercel/blob'

vi.mock('@vercel/blob', () => ({ del: vi.fn() }))

const mockDel = vi.mocked(del)

describe('deletePhotos', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('deletes the urls it is given', async () => {
    await deletePhotos(['https://blob/a.jpg', 'https://blob/b.jpg'])

    expect(mockDel).toHaveBeenCalledWith(['https://blob/a.jpg', 'https://blob/b.jpg'])
  })

  it('ignores meals that never had a photo', async () => {
    // Chat-extracted meals store an empty photoUrl. Asking the blob store to
    // delete "" would fail the whole batch.
    await deletePhotos(['', 'https://blob/a.jpg', null, undefined])

    expect(mockDel).toHaveBeenCalledWith(['https://blob/a.jpg'])
  })

  it('does not call the store at all when there is nothing to delete', async () => {
    await deletePhotos(['', null])

    expect(mockDel).not.toHaveBeenCalled()
  })

  it('never throws when the store is unavailable', async () => {
    // A failed cleanup must not fail the delete the user actually asked for.
    // An orphaned blob is a cost problem; a failed account deletion is a
    // trust one.
    mockDel.mockRejectedValue(new Error('blob store down'))

    await expect(deletePhotos(['https://blob/a.jpg'])).resolves.toBeUndefined()
  })
})
