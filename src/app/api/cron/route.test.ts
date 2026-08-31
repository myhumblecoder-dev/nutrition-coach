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
    // Mock console.error to keep test output clean
    vi.spyOn(console, 'error').mockImplementation(() => {});
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

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('a telegram send failure is isolated per user', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: '1', name: 'Alice' } as any,
      { id: '2', name: 'Bob' } as any,
    ]);
    vi.mocked(generate).mockResolvedValue('stay healthy');
    
    // First call succeeds, second call fails
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as any)
      .mockResolvedValueOnce({ ok: false, statusText: 'Forbidden' } as any);

    const request = new Request('http://localhost/api/cron', {
      method: 'GET',
      headers: { authorization: 'Bearer test-secret' },
    });

    const response = await GET(request);
    const body = await response.json();

    // Alice succeeds, Bob fails. Total: sent 1, failed 1.
    expect(body).toEqual({ ok: false, sent: 1, failed: 1 });
    expect(console.error).toHaveBeenCalled();
  });

  it('missing telegram config counts as a failure', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: '1', name: 'Alice' } as any,
    ]);
    vi.mocked(generate).mockResolvedValue('stay healthy');
    
    delete process.env.TELEGRAM_BOT_TOKEN;

    const request = new Request('http://cal.com/api/cron', {
      method: 'GET',
      headers: { authorization: 'Bearer test-secret' },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(body).toEqual({ ok: false, sent: 0, failed: 1 });
    expect(console.error).toHaveBeenCalled();
  });

  it("calls generate once per user and returns ok with correct sent count: mock `prisma.user.findMany` to resolve `[{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]`, mock `generate` to resolve `'stay healthy'`; assert `generate` was called twice, first call with `'Write a short, friendly daily nutrition check-in message for Alice. Ask how they plan to eat today. Reply with the message only.'`, second call with `'Write a short, friendly daily nutrition check-in message for Bob. Ask how they plan to eat today. Reply with the message only.'`; assert response JSON is `{ ok: true, sent: 2, failed: 0 }`", async () => {
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
    expect(generate).toHaveBeenNthCalledWith(1, 'Write a short, friendly daily nutrition check-in message for Alice. Ask how they plan to eat today. Reply with the message only.');
    expect(generate).toHaveBeenNthCalledWith(2, 'Write a short, friendly daily nutrition check-in message for Bob. Ask how they plan to eat today. Reply with the message only.');
    expect(body).toEqual({ ok: true, sent: 2, failed: 0 });
    
    expect(fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot123/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: 'chat123', text: 'stay healthy' }),
      })
    );
  });
});