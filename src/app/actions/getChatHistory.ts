'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function getChatHistory() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const messages = await prisma.chatMessage.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return messages
    .reverse()
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));
}