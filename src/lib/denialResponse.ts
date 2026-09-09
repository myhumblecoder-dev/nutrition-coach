import { UsageLimitError } from '@/lib/limits'

/**
 * Turns a refusal from the spend gate into the right HTTP answer.
 *
 * The two refusals look the same to a person and must not look the same to a
 * client. A spent cap is **429** — the request was fine, there is just nothing
 * left today. An absent subscription is **402** — the request will never
 * succeed until something changes, and the app should raise a paywall rather
 * than print a sentence in the chat.
 *
 * The `code` is what the client actually branches on; the prose is written to
 * be read and may be reworded at any time.
 */
export function denialResponse(error: UsageLimitError): Response {
  const status = error.reason === 'subscription_required' ? 402 : 429

  return Response.json({ error: error.userMessage, code: error.reason }, { status })
}
