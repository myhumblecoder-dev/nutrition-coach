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

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>)
const mockPut = vi.mocked(put)

describe('uploadMealPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads the file and returns its url', async () => {
    // Arrange
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockPut.mockResolvedValue({ url: 'https://blob/x.jpg' } as any)

    const formData = new FormData()
    const file = new File([new TextEncoder().encode('fake-image-content')], 'x.jpg', { type: 'image/jpeg' })
    formData.append('file', file)

    // Act
    const result = await uploadMealPhoto(formData)

    // Assert
    expect(result).toEqual({ url: 'https://blob/x.jpg' })
    expect(mockPut).toHaveBeenCalledWith('x.jpg', file, {
      access: 'public',
      addRandomSuffix: true,
    })
  })

  it('rejects when signed out', async () => {
    // Arrange
    mockAuth.mockResolvedValue(null)
    const formData = new FormData()

    // Act & Assert
    await expect(uploadMealPhoto(formData)).rejects.toThrow('Unauthorized')
    expect(mockPut).not.toHaveBeenCalled()
  })

  it('rejects when no file is present', async () => {
    // Arrange
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const formData = new FormData()

    // Act & Assert
    await expect(uploadMealPhoto(formData)).rejects.toThrow('No file provided')
    expect(mockPut).not.toHaveBeenCalled()
  })

  it('rejects an unsupported image type', async () => {
    // Arrange
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const formData = new FormData()
    const file = new File([new TextEncoder().encode('fake-heic-content')], 'photo.heic', { type: 'image/heic' })
    formData.append('file', file)

    // Act & Assert
    await expect(uploadMealPhoto(formData)).rejects.toThrow('Unsupported image type')
    expect(mockPut).not.toHaveBeenCalled()
  })
})
