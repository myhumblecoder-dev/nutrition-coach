import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, maxDuration } from './route';
import { prisma } from '@/lib/db';
import { generate } from '@/lib/llm';
import { sendTelegramMessage } from '@/lib/telegram';

vi.mock('@/lib/db', () => ({ prisma: { telegramChat: { findMany: vi.fn() } } }));
vi.mock('@/lib/llm', () => ({ generate: vi.fn() }));
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: vi.fn() }));

function chatRow(chatId: string, name: string) {
  return { id: `tc-${chatId}`, chatId, userId: `u-${chatId}`, user: { id: `u-${chatId}`, name } };
}

function makeRequest(auth?: string) {
  return new Request('http://localhost/api/cron', {
    method: 'GET',
    headers: auth ? { authorization: auth } : {},
  });
}

describe('route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('allows five minutes for the per-user LLM loop', () => {
    expect(maxDuration).toBe(300);
  });

  it('returns 401 without the bearer secret', async () => {
    const missing = await GET(makeRequest());
    expect(missing.status).toBe(401);

    const wrong = await GET(makeRequest('Bearer nope'));
    expect(wrong.status).toBe(401);

    expect(prisma.telegramChat.findMany).not.toHaveBeenCalled();
  });

  it('sends one personalized check-in per linked chat through the telegram lib', async () => {
    vi.mocked(prisma.telegramChat.findMany).mockResolvedValue([
      chatRow('101', 'Alice'),
      chatRow('202', 'Bob'),
    ] as never);
    vi.mocked(generate).mockResolvedValue('stay healthy');
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined as never);

    const response = await GET(makeRequest('Bearer test-secret'));
    const body = await response.json();

    expect(body).toEqual({ ok: true, sent: 2, failed: 0 });
    expect(generate).toHaveBeenCalledTimes(2);
    const prompts = vi.mocked(generate).mock.calls.map((c) => c[0]);
    expect(prompts.some((p) => p.includes('for Alice'))).toBe(true);
    expect(prompts.some((p) => p.includes('for Bob'))).toBe(true);
    expect(prompts[0]).toContain('Today is ');

    const sends = vi.mocked(sendTelegramMessage).mock.calls;
    expect(sends).toContainEqual(['101', 'stay healthy']);
    expect(sends).toContainEqual(['202', 'stay healthy']);
  });

  it('a failed send counts without aborting the other chats', async () => {
    vi.mocked(prisma.telegramChat.findMany).mockResolvedValue([
      chatRow('101', 'Alice'),
      chatRow('202', 'Bob'),
      chatRow('303', 'Cara'),
    ] as never);
    vi.mocked(generate).mockResolvedValue('stay healthy');
    vi.mocked(sendTelegramMessage)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('Forbidden'))
      .mockResolvedValueOnce(undefined as never);

    const response = await GET(makeRequest('Bearer test-secret'));
    const body = await response.json();

    expect(body).toEqual({ ok: false, sent: 2, failed: 1 });
    expect(console.error).toHaveBeenCalled();
  });

  it('delivers to every chat when there are more than one batch of five', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => chatRow(String(i), `User${i}`));
    vi.mocked(prisma.telegramChat.findMany).mockResolvedValue(rows as never);
    vi.mocked(generate).mockResolvedValue('hello');
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined as never);

    const response = await GET(makeRequest('Bearer test-secret'));
    const body = await response.json();

    expect(body).toEqual({ ok: true, sent: 7, failed: 0 });
    expect(sendTelegramMessage).toHaveBeenCalledTimes(7);
  });
});
