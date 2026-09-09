import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { authenticateBearer } from '@/lib/apiAuth'
import { analyzeMeal } from '@/lib/analyzeMeal'
import { logMealForUser } from '@/lib/meals'
import { UsageLimitError } from '@/lib/limits'
import { put } from '@vercel/blob'

vi.mock('@/lib/apiAuth', () => ({ authenticateBearer: vi.fn() }))
vi.mock('@/lib/analyzeMeal', () => ({ analyzeMeal: vi.fn() }))
vi.mock('@/lib/meals', () => ({ logMealForUser: vi.fn() }))
vi.mock('@vercel/blob', () => ({ put: vi.fn() }))

const mockAuth = vi.mocked(authenticateBearer)
const mockAnalyze = vi.mocked(analyzeMeal)
const mockLog = vi.mocked(logMealForUser)
const mockPut = vi.mocked(put)

// A one-pixel JPEG is enough: the route never decodes the image, it only moves
// the bytes. What matters is that they arrive at the blob unchanged.
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9])
const IMAGE = JPEG_BYTES.toString('base64')

const ANALYSIS = {
  foodItems: [{ name: 'eggs', portion: '2 large', calories: 140, protein: 12 }],
  totalCalories: 140,
  totalProtein: 12,
}

function request(body: unknown) {
  return new Request('http://test/api/v1/meals/photo', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/v1/meals/photo', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockPut.mockResolvedValue({ url: 'https://blob/meal.jpg' } as never)
    mockAnalyze.mockResolvedValue(ANALYSIS as never)
    mockLog.mockResolvedValue({ id: 'meal-1' } as never)
  })

  it('returns 401 without a valid bearer and never spends money', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST(request({ image: IMAGE, mimeType: 'image/jpeg' }))

    expect(res.status).toBe(401)
    // Vision is the most expensive call in the app, and the blob store is
    // billed too. An unauthenticated request must reach neither.
    expect(mockPut).not.toHaveBeenCalled()
    expect(mockAnalyze).not.toHaveBeenCalled()
  })

  it('stores the decoded bytes and analyses the stored URL', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(request({ image: IMAGE, mimeType: 'image/jpeg', hint: 'two eggs' }))

    expect(res.status).toBe(200)
    const [, body, options] = mockPut.mock.calls[0]
    expect(Buffer.from(body as Uint8Array)).toEqual(JPEG_BYTES)
    expect(options).toMatchObject({ access: 'public', addRandomSuffix: true })
    // The hint is the caption's counterpart: ground truth for what the food
    // is, while the photo judges the portion.
    expect(mockAnalyze).toHaveBeenCalledWith('user-1', 'https://blob/meal.jpg', 'two eggs')
  })

  it('logs the meal as pending so an abandoned analysis never counts', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(request({ image: IMAGE, mimeType: 'image/jpeg' }))

    const [userId, input, sourceText, confirmed] = mockLog.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(input.photoUrl).toBe('https://blob/meal.jpg')
    expect(input.totalCalories).toBe(140)
    expect(sourceText).toBeUndefined()
    expect(confirmed).toBe(false)

    expect(await res.json()).toEqual({
      mealId: 'meal-1',
      photoUrl: 'https://blob/meal.jpg',
      ...ANALYSIS,
    })
  })

  it('rejects an image type the blob store would not accept', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    // HEIC is the iPhone camera default and is not in the allowlist, so the
    // client transcodes to JPEG. If one ever arrives, say so here rather than
    // letting it fail deeper in the pipeline.
    const res = await POST(request({ image: IMAGE, mimeType: 'image/heic' }))

    expect(res.status).toBe(400)
    expect(mockPut).not.toHaveBeenCalled()
  })

  it('rejects a body too large for the platform to carry', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(
      request({ image: Buffer.alloc(5 * 1024 * 1024).toString('base64'), mimeType: 'image/jpeg' })
    )

    expect(res.status).toBe(413)
    expect(mockPut).not.toHaveBeenCalled()
  })

  it('passes the daily cap message through with a 429', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockAnalyze.mockRejectedValue(new UsageLimitError("That's plenty of photos for today."))

    const res = await POST(request({ image: IMAGE, mimeType: 'image/jpeg' }))

    expect(res.status).toBe(429)
    // A cap is not a bad photo. Telling someone to retake a picture that was
    // fine sends them round a loop.
    expect((await res.json()).error).toBe("That's plenty of photos for today.")
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('asks for a clearer shot when the vision output is unusable', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)
    mockAnalyze.mockRejectedValue(new Error('Vision API returned invalid JSON structure'))

    const res = await POST(request({ image: IMAGE, mimeType: 'image/jpeg' }))

    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/clearer/)
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('rejects a string that decodes to no bytes', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    // Non-base64 punctuation decodes to nothing. Without this guard it would
    // store a zero-byte blob and spend a vision call reading it.
    const res = await POST(request({ image: '!!!!', mimeType: 'image/jpeg' }))

    expect(res.status).toBe(400)
    expect(mockPut).not.toHaveBeenCalled()
    expect(mockAnalyze).not.toHaveBeenCalled()
  })

  it('rejects a body with no image at all', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(request({ mimeType: 'image/jpeg' }))

    expect(res.status).toBe(400)
    expect(mockPut).not.toHaveBeenCalled()
  })
})
