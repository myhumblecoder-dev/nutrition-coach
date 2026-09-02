import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, maxDuration } from './route';
import { prisma } from '@/lib/db';
import { generate } from '@/lib/llm';
import { sendTelegramMessage } from '@/lib/telegram';
import { sendPushNotification } from '@/lib/push';

vi.mock('@/lib/db', () => ({
  prisma: { user: { findMany: vi.fn() }, deviceToken: { deleteMany: vi.fn() } },
}));
vi.mock('@/lib/llm', () => ({ generate: vi.fn() }));
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: vi.fn() }));
vi.mock('@/lib/push', () => ({ sendPushNotification: vi.fn() }));

type Row = {
  id: string;
  name: string;
  telegramChat?: { chatId: string } | null;
  deviceTokens?: { token: string }[];
};

function userRow({ id, name, telegramChat = null, deviceTokens = [] }: Row) {
  return { id, name, telegramChat, deviceTokens };
}

function telegramUser(chatId: string, name: string) {
  return userRow({ id: `u-${chatId}`, name, telegramChat: { chatId } });
}

function makeRequest(auth?: string) {
  return new Request('http://localhost/api/cron', {
    method: 'GET',
    headers: auth ? { authorization: auth } : {},
  });
}

const ok = { ok: true, unregistered: false, status: 200 };
const gone = { ok: false, unregistered: true, status: 410 };

describe('route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(prisma.deviceToken.deleteMany).mockResolvedValue({ count: 1 } as never);
  });

  it('allows five minutes for the per-user LLM loop', () => {
    expect(maxDuration).toBe(300);
  });

  it('returns 401 without the bearer secret', async () => {
    const missing = await GET(makeRequest());
    expect(missing.status).toBe(401);

    const wrong = await GET(makeRequest('Bearer nope'));
    expect(wrong.status).toBe(401);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('sends one personalized check-in per linked chat through the telegram lib', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      telegramUser('101', 'Alice'),
      telegramUser('202', 'Bob'),
    ] as never);
    vi.mocked(generate).mockResolvedValue('stay healthy');
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

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

  it('pushes the check-in to every registered device', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      userRow({
        id: 'u1',
        name: 'Thomas',
        deviceTokens: [{ token: 'dev-a' }, { token: 'dev-b' }],
      }),
    ] as never);
    vi.mocked(generate).mockResolvedValue('how did you eat today?');
    vi.mocked(sendPushNotification).mockResolvedValue(ok);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(body).toEqual({ ok: true, sent: 2, failed: 0 });
    expect(sendPushNotification).toHaveBeenCalledWith('dev-a', {
      title: 'Nutrition Coach',
      body: 'how did you eat today?',
    });
    expect(sendPushNotification).toHaveBeenCalledWith('dev-b', expect.anything());
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('generates one message for a user reachable on both channels', async () => {
    // Two LLM calls for one person would be paying twice to say the same
    // thing — and could say two different things.
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      userRow({
        id: 'u1',
        name: 'Thomas',
        telegramChat: { chatId: '101' },
        deviceTokens: [{ token: 'dev-a' }],
      }),
    ] as never);
    vi.mocked(generate).mockResolvedValue('same message');
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined as never);
    vi.mocked(sendPushNotification).mockResolvedValue(ok);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(generate).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ ok: true, sent: 2, failed: 0 });
    expect(sendTelegramMessage).toHaveBeenCalledWith('101', 'same message');
    expect(sendPushNotification).toHaveBeenCalledWith('dev-a', {
      title: 'Nutrition Coach',
      body: 'same message',
    });
  });

  it('prunes a device token APNs reports as unregistered', async () => {
    // 410 means the app was deleted. Keeping the row would waste a request
    // every day forever.
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      userRow({ id: 'u1', name: 'Thomas', deviceTokens: [{ token: 'dead' }] }),
    ] as never);
    vi.mocked(generate).mockResolvedValue('hi');
    vi.mocked(sendPushNotification).mockResolvedValue(gone);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: 'dead' } });
    expect(body).toEqual({ ok: false, sent: 0, failed: 1 });
  });

  it('does not prune a token after an ordinary delivery failure', async () => {
    // A 503 is transient; deleting the token would silently unsubscribe a
    // live device.
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      userRow({ id: 'u1', name: 'Thomas', deviceTokens: [{ token: 'live' }] }),
    ] as never);
    vi.mocked(generate).mockResolvedValue('hi');
    vi.mocked(sendPushNotification).mockResolvedValue({ ok: false, unregistered: false, status: 503 });

    await GET(makeRequest('Bearer test-secret'));

    expect(prisma.deviceToken.deleteMany).not.toHaveBeenCalled();
  });

  it('a failed send counts without aborting the other users', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      telegramUser('101', 'Alice'),
      telegramUser('202', 'Bob'),
      telegramUser('303', 'Cara'),
    ] as never);
    vi.mocked(generate).mockResolvedValue('stay healthy');
    vi.mocked(sendTelegramMessage)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('Forbidden'))
      .mockResolvedValueOnce(undefined as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(body).toEqual({ ok: false, sent: 2, failed: 1 });
    expect(console.error).toHaveBeenCalled();
  });

  it('a failing LLM call for one user does not stop the others', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      telegramUser('101', 'Alice'),
      telegramUser('202', 'Bob'),
    ] as never);
    vi.mocked(generate)
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce('stay healthy');
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(body).toEqual({ ok: false, sent: 1, failed: 1 });
  });

  it('delivers to every user when there are more than one batch of five', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => telegramUser(String(i), `User${i}`));
    vi.mocked(prisma.user.findMany).mockResolvedValue(rows as never);
    vi.mocked(generate).mockResolvedValue('hello');
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(body).toEqual({ ok: true, sent: 7, failed: 0 });
    expect(sendTelegramMessage).toHaveBeenCalledTimes(7);
  });

  it('skips a user with no delivery channel rather than paying for a message', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      userRow({ id: 'u1', name: 'Nobody' }),
    ] as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(generate).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, sent: 0, failed: 0 });
  });
});
