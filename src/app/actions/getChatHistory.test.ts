import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getChatHistory } from './getChatHistory';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    chatMessage: {
      findMany: vi.fn(),
    },
  },
}));

describe('getChatHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws Unauthorized when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    await expect(getChatHistory()).rejects.toThrow('Unauthorized');
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
  });

  it('returns chronological mapped messages', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any);

    const date1 = new Date(Date.UTC(2023, 10, 1, 10, 0, 0));
    const date2 = new Date(Date.UTC(2023, 10, 1, 10, 5, 0));

    // findMany returns desc order (newest first)
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      {
        id: 'm2',
        userId: 'u1',
        role: 'assistant',
        content: 'second',
        createdAt: date2,
      },
      {
        id: 'm1',
        userId: 'u1',
        role: 'user',
        content: 'first',
        createdAt: date1,
      },
    ] as any);

    const result = await getChatHistory();

    // The function calls .reverse(), so it should be chronological (oldest first)
    expect(result).toEqual([
      { id: 'm1', role: 'user', content: 'first' },
      { id: 'm2', role: 'assistant', content: 'second' },
    ]);

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  });
});