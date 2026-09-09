import { analyzePhoto } from '@/lib/llm'
import { redactIdentifiers } from '@/lib/redact'
import { z } from 'zod'
import { attributeTokens, denialFor, recordUsage, UsageLimitError } from '@/lib/limits'

// Vision models return fractional estimates despite integer instructions;
// round rather than reject.
const roundedInt = z.number().nonnegative().transform(Math.round)

const mealSchema = z.object({
  foodItems: z.array(
    z.object({
      name: z.string().trim().min(1),
      portion: z.string().trim().min(1),
      calories: roundedInt,
      protein: roundedInt,
    })
  ),
  totalCalories: roundedInt,
  totalProtein: roundedInt,
})

// Models often wrap JSON in markdown fences or preamble despite "no prose";
// extract the outermost object before parsing.
function extractJson(response: string): string {
  const start = response.indexOf('{')
  const end = response.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    return response
  }
  return response.slice(start, end + 1)
}

/**
 * Vision is the most expensive call in the app, so the cap is enforced here
 * rather than at the call sites: the server action, the Telegram webhook and
 * any later surface all land on this function, and a gate in the routes could
 * be forgotten by the next one.
 */
export async function analyzeMeal(userId: string, photoUrl: string, hint?: string) {
  // Entitlement and cap in one question. The thrown reason is what lets a
  // route answer 402 rather than 429 — a paywall and "come back tomorrow" are
  // not the same refusal.
  const denial = await denialFor(userId, 'vision')
  if (denial) {
    throw new UsageLimitError(denial.userMessage, denial.reason)
  }

  // Recorded before the call, not after: a timeout or a 500 still cost money,
  // and counting only successes would let a failing loop run free.
  const usageEventId = await recordUsage(userId, 'vision')

  // The caption goes to the model, so direct identifiers come out of it first.
  // What was typed is still stored verbatim as the meal's sourceText.
  const modelHint = hint ? redactIdentifiers(hint) : undefined
  const hintBlock = modelHint
    ? `The user says this meal is: "${modelHint}". Trust their description of what the food IS; use the photo to judge portions; any numbers the user states win.\n`
    : ''
  const systemPrompt = `${hintBlock}Return ONLY valid JSON with no prose, in the exact shape: {
  "foodItems": [
    {
      "name": string,
      "portion": string,
      "calories": number,
      "protein": number
    }
  ],
  "totalCalories": number,
  "totalProtein": number
}`

  // The tokens come back with the reply, so the row written above gets its
  // real cost filled in. Fire-and-forget: attributeTokens never throws, and
  // the estimate stands in if it never lands.
  const response = await analyzePhoto(photoUrl, systemPrompt, (usage) => {
    void attributeTokens(usageEventId, usage)
  })

  let parsed
  try {
    parsed = JSON.parse(extractJson(response))
  } catch {
    throw new Error('Vision API returned invalid JSON structure')
  }

  try {
    return mealSchema.parse(parsed)
  } catch {
    throw new Error('Vision API returned invalid JSON structure')
  }
}
