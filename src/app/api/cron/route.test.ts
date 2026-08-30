import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { prisma } from '@/lib/db';
import { generate } from '@/lib/llm';

vi.mock('@/lib/db', () => ({ prisma: { user: { findMany: vi.fn() } } }));
vi.mock('@/lib/llm', () => ({ generate: vi.fn() }));

describe('route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    process.env.TELEGRAM_BOT_TOKEN = 'bot123';
    process.env.TELEGRAM_CHAT_ID = 'chat123';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('returns 401 when authorization header is missing', async () => {
    const request = new Request('http://localhost/api/cron', {
      method: 'GET',
      headers: {},
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when wrong secret is provided', async () => {
    const request = new Request('http://localhost/api/cron', {
      method: 'GET',
      headers: { authorization: 'Bearer wrong-secret' },
    });

    const response = await GET(maskRequest(request));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("calls generate once per user and returns ok with correct sent count: mock `prisma.user.findMany` to resolve `[{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]`, mock `generate` to resolve `'stay healthy'`; assert `generate` was called twice, first call with `'Daily nutrition coaching check-in: Alice, how do you plan to eat today?'`, second call with `'Daily nutrition coaching check-in: Bob, how do you plan to eat today?'`; assert response JSON is `{ ok: true, sent: 2 }`", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: '1', name: 'Alice' } as any,
      { id: '2', name: 'Bob' } as any,
    ]);
    vi.mocked(generate).mockResolvedValue('stay healthy');

    const request = new Request('http://localhost/api/cron', {
      method: 'GET',
      headers: { authorization: 'Bearer test-secret' },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenNthCalledWith(1, 'Daily nutrition coaching check-in: Alice, how do you plan to eat today?');
    expect(generate).toHaveBeenNthCalledWith(2, 'Daily nutrition coaching check-in: Bob, how do you plan to eat today?');
    expect(body).toEqual({ ok: true, sent: 2 });
    
    expect(fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot123/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: 'chat123', text: 'stay healthy' }),
      })
    );
  });
});

// Helper to avoid type issues with Request construction in some environments
function maskRequest(req: Request) {
  return req;
}