/**
 * How much of the conversation the coach carries.
 *
 * It was ten messages, which is why the coach felt forgetful inside a single
 * day: a talkative afternoon lost its own morning. The daily cap is 30 turns,
 * so a full day runs to about 60 messages.
 *
 * Raising the count alone would have cost more than it needed to. Measured
 * against production, assistant messages average 138 tokens and user messages
 * 11 — the coach's own prose was twelve times the cost of the words it
 * actually needs. So replies are clipped, which buys the reach cheaply.
 *
 * What the coach needs from its own past replies is roughly what it said. What
 * it needs from the user's is exactly what they said.
 */
export const CHAT_WINDOW = 30

/** Enough of a reply to recall the gist, not enough to recite it. */
const ASSISTANT_LIMIT = 240

/**
 * A ceiling on the whole window, not just per message.
 *
 * Per-message clipping is not a bound: the chat route accepts 4,000 characters
 * a message, so fifteen of those would be some fifteen thousand tokens in
 * every subsequent prompt. Real messages average 45 characters, so this is
 * never reached in practice — it exists so that it cannot be.
 *
 * Roughly 1,500 tokens. Measured in characters because that is what is to hand
 * without a tokeniser, and four-to-one is close enough for a ceiling.
 */
const WINDOW_CHAR_BUDGET = 6_000

type Turn = { role: string; content: string }

/**
 * Formats history for the prompt, oldest first.
 *
 * Filled newest-backwards and then reversed, so when the budget runs out it is
 * the oldest turns that fall off. Losing the start of a long day is the right
 * trade; losing the last thing said is not.
 */
export function historyLinesFor(history: Turn[]): string[] {
  const lines: string[] = []
  let spent = 0

  for (const message of [...history].reverse()) {
    const line = `${message.role}: ${clip(message)}`

    if (spent + line.length > WINDOW_CHAR_BUDGET && lines.length > 0) break

    lines.push(line)
    spent += line.length
  }

  return lines.reverse()
}

function clip(message: Turn): string {
  if (message.role !== 'assistant' || message.content.length <= ASSISTANT_LIMIT) {
    return message.content
  }

  return `${message.content.slice(0, ASSISTANT_LIMIT).trimEnd()}…`
}
