import { z } from 'zod'
import { put } from '@vercel/blob'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { analyzeMeal } from '@/lib/analyzeMeal'
import { logMealForUser } from '@/lib/meals'
import { UsageLimitError } from '@/lib/limits'
import { denialResponse } from '@/lib/denialResponse'

// A vision call plus a blob write. Matches the Telegram webhook's budget,
// which does the same work for the same reason.
export const maxDuration = 60

// The same allowlist the web upload enforces. HEIC is absent on purpose: the
// blob store and the vision API both reject it, and it is the iPhone camera
// default — so the iOS client transcodes to JPEG before it gets here.
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'] as const

// Vercel caps a request body at 4.5 MB, and base64 adds a third on top of the
// bytes. Refusing at 4 MB decoded gives a client a straight answer instead of
// a truncated body failing somewhere less obvious.
const MAX_BYTES = 4 * 1024 * 1024

// The image arrives base64-encoded inside JSON rather than as a multipart or
// binary body, because App Attest signs the request body and verifies it as
// text on this side. A binary body would mean reworking attestation on both
// clients to save a third of the bytes.
const bodySchema = z.object({
  image: z.string().min(1),
  mimeType: z.enum(ALLOWED),
  hint: z.string().trim().min(1).max(1000).optional(),
})

export async function POST(request: Request) {
  const raw = await request.text()
  const { blocked } = await requireAttestation(request, raw)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let parsed
  try {
    parsed = bodySchema.parse(JSON.parse(raw))
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const bytes = Buffer.from(parsed.image, 'base64')
  if (bytes.length === 0) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (bytes.length > MAX_BYTES) {
    return Response.json({ error: 'That photo is too large.' }, { status: 413 })
  }

  const blob = await put('ios-meal.jpg', bytes, {
    access: 'public',
    addRandomSuffix: true,
    contentType: parsed.mimeType,
  })

  let analysis
  try {
    analysis = await analyzeMeal(user.id, blob.url, parsed.hint)
  } catch (error) {
    console.error(error)
    // A cap is not a bad photo, and the two need different answers: one says
    // come back tomorrow, the other says take the shot again. Collapsing them
    // sends someone round a loop retaking a picture that was fine.
    if (error instanceof UsageLimitError) {
      return denialResponse(error)
    }
    return Response.json(
      { error: "I couldn't read that as a meal photo — try a clearer, closer shot of the food." },
      { status: 422 }
    )
  }

  // Pending until the user confirms, so an analysis they walk away from never
  // reaches a total — the same contract the Telegram photo flow works to.
  const { id: mealId } = await logMealForUser(
    user.id,
    {
      photoUrl: blob.url,
      foodItems: analysis.foodItems,
      totalCalories: analysis.totalCalories,
      totalProtein: analysis.totalProtein,
    },
    parsed.hint,
    false
  )

  return Response.json({
    mealId,
    photoUrl: blob.url,
    foodItems: analysis.foodItems,
    totalCalories: analysis.totalCalories,
    totalProtein: analysis.totalProtein,
  })
}
