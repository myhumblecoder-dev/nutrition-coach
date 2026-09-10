'use server';

import { auth } from '@/auth';
import { getChatHistoryForUser } from '@/lib/dashboard';

export async function getChatHistory() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // `recent`, not day-scoped: the web has no history screen, so opening
  // fresh each morning would take past conversations away with no way back.
  // iOS day-scopes because it has somewhere to browse to.
  const messages = await getChatHistoryForUser(session.user.id, { recent: true, take: 20 });

  return messages.map((m) => ({ id: m.id, role: m.role, content: m.content }));
}
