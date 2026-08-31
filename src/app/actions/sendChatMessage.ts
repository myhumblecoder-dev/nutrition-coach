'use server';

import { auth } from '@/auth';
import { coachReply } from '@/lib/chat';

export async function sendChatMessage(userText: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  return coachReply(session.user.id, userText);
}
