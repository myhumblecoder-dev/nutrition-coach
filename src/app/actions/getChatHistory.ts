'use server';

import { auth } from '@/auth';
import { getChatHistoryForUser } from '@/lib/dashboard';

export async function getChatHistory() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const messages = await getChatHistoryForUser(session.user.id);

  return messages.map((m) => ({ id: m.id, role: m.role, content: m.content }));
}
