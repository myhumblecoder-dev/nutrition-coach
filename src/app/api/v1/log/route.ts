import { z } from 'zod'
import { authenticateBearer } from '@/lib/apiAuth'
import { requireAttestation } from '@/lib/attest'
import { extractHealthFacts } from '@/lib/extraction'
import { attributeTokens, denialFor, recordUsage, UsageLimitError } from '@/lib/limits'
import { denialResponse } from '@/lib/denialResponse'
import { redactIdentifiers } from '@/lib/redact'
import { persistExchange } from '@/lib/chat'
import { spokenResult } from '@/lib/spoken'

/**
 * Logging without a conversation, for Siri.
 *
 * `/api/v1/chat` cannot serve this: it makes two model calls under a
 * sixty-second budget, and Siri gives up around ten. So this runs extraction
 * alone — one call — and answers with a sentence to say rather than a reply to
 * read.
 *
 * Fifteen, not sixty. The server should give up before the client does;
 * finishing a request nobody is listening to is how a user gets told their
 * meal failed to log while it quietly lands.
 */
export const maxDuration = 15

// Shorter than chat's 4000: this is one dictated sentence, and a cap that
// generous would only ever be hit by something that is not speech.
const bodySchema = z.object({ text: z.string().trim().min(1).max(500) })

export async function POST(request: Request) {
  // Read the body once: the assertion is signed over exactly these bytes.
  const raw = await request.text()
  const { blocked } = await requireAttestation(request, raw)
  if (blocked) return blocked

  const user = await authenticateBearer(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let text: string
  try {
    text = bodySchema.parse(JSON.parse(raw)).text
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Both denials are a status here, unlike chat — which returns a spent cap as
  // an ordinary 200 reply because "come back tomorrow" reads as something the
  // coach said. There is no bubble to print into, so the client has to be able
  // to tell refusal from success.
  const denial = await denialFor(user.id, 'chat')
  if (denial) {
    return denialResponse(new UsageLimitError(denial.userMessage, denial.reason))
  }

  // Before the call, so a timeout still counts. One model call rather than
  // chat's two, so `ESTIMATED_USD.chat` over-prices this route — the safe
  // direction for a ceiling, and measured tokens correct it anyway.
  const usageEventId = await recordUsage(user.id, 'chat')

  // The same split `coachReply` uses: redacted text to the model, the real
  // words kept as the receipt. Dictation picks up phone numbers.
  const recorded = await extractHealthFacts(user.id, redactIdentifiers(text), {
    sourceText: text,
    onUsage: (usage) => void attributeTokens(usageEventId, usage),
  })

  if (recorded.failed) {
    // Distinct from "nothing in that was loggable". An assistant that reports
    // an empty message while the backend is down is lying with confidence, and
    // by voice there is no screen to check it against.
    return Response.json(
      { error: 'Something went wrong. Try again in a moment.' },
      { status: 503 }
    )
  }

  const spoken = spokenResult(recorded)

  // The app's claim is that every number traces back to something the user
  // told the coach. A meal logged by voice that never appears in the
  // conversation would break that, and extraction writes fact rows only.
  await persistExchange(user.id, text, spoken)

  return Response.json({ spoken, recorded })
}
