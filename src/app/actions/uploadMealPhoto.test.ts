import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadMealPhoto } from './uploadMealPhoto'
import { auth } from '@/auth'
import { put } from '@vercel/blob'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}))

const mockAuth = vi.mocked(auth as unknown as () => Promise<any>)
const mockPut = vi.mocked(put)

describe('uploadMealPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads the file and returns its url', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const blobUrl = 'https://blob/x.jpg'
    mockPut.mockResolvedValue({ url: blobUrl } as any)
    
    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' })
    const formData = new FormData()
    formData.append('file', file)

    const result = await uploadMealPhoto(formData)

    expect(result).toEqual({ url: blobUrl })
    expect(mockPut).toHaveBeenCalledWith(
      'test.jpg', 
      file, 
      { access: 'public', addRandomSuffix: true }
    )
  })

  it('rejects when signed out', async () => {
    mockAuth.mockResolvedValue(null)
    const formData = new FormData()

    await expect(uploadMealPhoto(formData)).rejects.toThrow('Unauthorized')
    expect(mockPut).not.toHaveBeenCalled()
  })

  it('rejects when no file is present', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const formData = new FormData()

    await expect(uploadMealPhoto(formData)).rejects.toThrow('No file provided')
    expect(mockPut).not.toHaveBeenCalled()
  })
})
