// The local model. Overridden with OLLAMA_MODEL, which is deliberately
// separate from LLM_MODEL: one names the hosted model, the other the local
// one, and sharing a single variable meant flipping providers sent a Claude
// model name to Ollama.
const OLLAMA_DEFAULT_MODEL = 'gemma4:26b';

export async function generate(prompt: string): Promise<string> {
  const provider = process.env.LLM_PROVIDER;

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(res.statusText);
    }

    const data = await res.json();
    return data.content[0].text;
  }

  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      // OLLAMA_MODEL, not LLM_MODEL: the latter names the hosted model, and
      // sending "claude-..." to Ollama asks it for a model it cannot have.
      model: process.env.OLLAMA_MODEL ?? OLLAMA_DEFAULT_MODEL,
      prompt,
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(res.statusText);
  }

  const data = await res.json();
  return data.response;
}
/**
 * Vision: describe a photo the app has stored (Vercel Blob) via the LLM seam.
 *
 * Two fetches by design — the blob URL first, then the model — because both
 * providers take the image inline as base64 rather than by URL.
 *
 * The Ollama default is `gemma4:26b`, NOT llava: gemma4 is what is installed on
 * this machine and its vision was verified end-to-end (a real photo read in
 * ~17s). Production uses the Anthropic path, which was measured at ~2.4s and
 * read a macro figure correctly that the local model misread — accuracy is the
 * product here, so the cloud path is the default in prod.
 */
export async function analyzePhoto(
  imageUrl: string,
  systemPrompt: string
): Promise<string> {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error('Failed to fetch image');
  }
  const base64 = Buffer.from(await imageRes.arrayBuffer()).toString('base64');
  // Anthropic validates media_type against the actual bytes; a PNG declared
  // as image/jpeg is rejected, so pass through what the blob store served.
  const mediaType = (imageRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0];

  if (process.env.LLM_PROVIDER === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              { type: 'text', text: systemPrompt },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(res.statusText);
    }
    const data = await res.json();
    return data.content[0].text;
  }

  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? OLLAMA_DEFAULT_MODEL,
      prompt: systemPrompt,
      images: [base64],
      stream: false,
    }),
  });
  if (!res.ok) {
    throw new Error(res.statusText);
  }
  const data = await res.json();
  return data.response;
}
