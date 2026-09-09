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

describe('deleting a lot of photos', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('chunks rather than handing the store one huge array', async () => {
    // A long-standing account can have thousands. One oversized call would
    // throw, be swallowed, and leave every photo public — the exact outcome
    // this function exists to prevent, arriving silently.
    const urls = Array.from({ length: 250 }, (_, i) => `https://blob/${i}.jpg`)

    await deletePhotos(urls)

    expect(mockDel).toHaveBeenCalledTimes(3)
    expect(mockDel.mock.calls.flatMap((call) => call[0] as string[])).toHaveLength(250)
  })

  it('keeps going when one batch fails', async () => {
    const urls = Array.from({ length: 150 }, (_, i) => `https://blob/${i}.jpg`)
    mockDel.mockRejectedValueOnce(new Error('rate limited'))

    await deletePhotos(urls)

    // The second batch still runs; one bad chunk must not abandon the rest.
    expect(mockDel).toHaveBeenCalledTimes(2)
  })
})
