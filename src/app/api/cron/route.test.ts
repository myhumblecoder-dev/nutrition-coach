import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
// deliver is exercised for real so the route keeps being tested against
// actual telegram/push calls rather than a stub of its own delivery layer.

type Row = {
  id: string;
  name: string;
  telegramChat?: { chatId: string } | null;
  deviceTokens?: { token: string }[];
  subscription?: {
    status: string;
    expiresAt: Date;
    isTrial: boolean;
    environment: string;
  } | null;
};

/// Paid by default, because the nudge is a paid feature and every other test
/// in this file is about the delivery mechanics rather than entitlement.
const PAID = {
  status: 'active',
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  isTrial: false,
  environment: 'Production',
};

function userRow({ id, name, telegramChat = null, deviceTokens = [], subscription = PAID }: Row) {
  return { id, name, telegramChat, deviceTokens, subscription };
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

    expect(body).toEqual({ ok: true, sent: 2, failed: 0, reasons: [] });
    expect(generate).toHaveBeenCalledTimes(2);
    const prompts = vi.mocked(generate).mock.calls.map((c) => c[0]);
    expect(prompts.some((p) => p.includes('for Alice'))).toBe(true);
    expect(prompts.some((p) => p.includes('for Bob'))).toBe(true);
    expect(prompts[0]).toContain('Today is ');

    const sends = vi.mocked(sendTelegramMessage).mock.calls;
    expect(sends).toContainEqual(['101', 'stay healthy']);
    expect(sends).toContainEqual(['202', 'stay healthy']);
  });

  it('does not push the daily nudge — the phone schedules its own', async () => {
    // iOS now schedules three local reminders at the user's own nine, one and
    // seven. A push from a fixed UTC cron would be a fourth notification, at
    // the wrong hour for everyone outside APP_TIMEZONE.
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      userRow({
        id: 'u1',
        name: 'Thomas',
        telegramChat: { chatId: '101' },
        deviceTokens: [{ token: 'dev-a' }, { token: 'dev-b' }],
      }),
    ] as never);
    vi.mocked(generate).mockResolvedValue('how did you eat today?');
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(sendPushNotification).not.toHaveBeenCalled();
    expect(sendTelegramMessage).toHaveBeenCalledWith('101', 'how did you eat today?');
    expect(body).toEqual({ ok: true, sent: 1, failed: 0, reasons: [] });
  });

  it('spends nothing on an account with no Telegram to send to', async () => {
    // An iOS-only account gets its nudges locally and free. Loading it here
    // would be a model call spent on a message with nowhere to go.
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(generate).not.toHaveBeenCalled();
    expect(body.sent).toBe(0);
    // The query itself excludes them, rather than filtering after the fact.
    const where = vi.mocked(prisma.user.findMany).mock.calls[0][0]?.where as Record<string, unknown>;
    expect(where).toEqual({ telegramChat: { isNot: null } });
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

    expect(body).toEqual({ ok: false, sent: 2, failed: 1, reasons: ["Forbidden"] });
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

    expect(body).toEqual({ ok: false, sent: 1, failed: 1, reasons: ["rate limited"] });
  });

  it('delivers to every user when there are more than one batch of five', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => telegramUser(String(i), `User${i}`));
    vi.mocked(prisma.user.findMany).mockResolvedValue(rows as never);
    vi.mocked(generate).mockResolvedValue('hello');
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(body).toEqual({ ok: true, sent: 7, failed: 0, reasons: [] });
    expect(sendTelegramMessage).toHaveBeenCalledTimes(7);
  });

  it('skips a user with no delivery channel rather than paying for a message', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      userRow({ id: 'u1', name: 'Nobody' }),
    ] as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(generate).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, sent: 0, failed: 0, reasons: [] });
  });

  it('holds the daily nudge while a weekly check-in is unanswered', async () => {
    // Both crons fire on the same morning. Asking about breakfast while the
    // coach is still waiting on the weekly review is two notifications from
    // one bot, and the product is supposed to ask one thing at a time.
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        ...telegramUser('101', 'Alice'),
        weeklyCheckIns: [{ bodyAnswer: null, strengthAnswer: null, sleepAnswer: null, moodAnswer: null }],
      },
    ] as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(generate).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, sent: 0, failed: 0, reasons: [] });
  });

  it('resumes the daily nudge once the week is answered', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        ...telegramUser('101', 'Alice'),
        weeklyCheckIns: [
          { bodyAnswer: 'a', strengthAnswer: 'b', sleepAnswer: 'c', moodAnswer: 'd' },
        ],
      },
    ] as never);
    vi.mocked(generate).mockResolvedValue('stay healthy');
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(body).toEqual({ ok: true, sent: 1, failed: 0, reasons: [] });
  });
});

describe('the daily nudge is a paid feature', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    // These assert what enforcement does. It ships off, so it has to be turned
    // on here or the tests would pass for the wrong reason.
    vi.stubEnv('SUBSCRIPTIONS_ENFORCED', 'true');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('spends nothing on an account whose subscription has lapsed', async () => {
    // This ran one model call per user per day regardless of engagement or
    // payment, so a churned account kept costing money forever — a floor that
    // scaled with total signups rather than subscribers.
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      userRow({ id: 'u-lapsed', name: 'Alice', telegramChat: { chatId: '101' }, subscription: null }),
    ] as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(generate).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(body.sent).toBe(0);
  });

  it('still nudges someone on the free trial', async () => {
    // A trial is a full entitlement — the nudge is part of what they are
    // trying out.
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      userRow({
        id: 'u-trial',
        name: 'Bob',
        telegramChat: { chatId: '202' },
        subscription: { ...PAID, isTrial: true },
      }),
    ] as never);
    vi.mocked(generate).mockResolvedValue('stay healthy');
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined as never);

    const body = await (await GET(makeRequest('Bearer test-secret'))).json();

    expect(body.sent).toBe(1);
  });
});
