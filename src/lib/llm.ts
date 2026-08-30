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
        model: 'claude-3-5-haiku-20241022',
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
      model: 'gemma4:26b',
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

  if (process.env.LLM_PROVIDER === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
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

  const baseUrl = process.env.LLM_URL ?? 'http://localhost:11434';
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? 'gemma4:26b',
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
