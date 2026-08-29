export async function generate(prompt: string) {
  const provider = process.env.LLM_PROVIDER;
  const isAnthropic = provider === 'anthropic';

  const url = isAnthropic
    ? 'https://api.anthropic.com/v1/messages'
    : `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/generate`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  let body: Record<string, unknown>;

  if (isAnthropic) {
    headers['x-api-key'] = process.env.ANTHROPIC_API_KEY || '';
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    };
  } else {
    body = {
      model: 'gemma4:2mal-26b',
      prompt,
      stream: false,
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(res.statusText);
  }

  const data = await res.json();
  return isAnthropic ? data.content[0].text : data.response;
}