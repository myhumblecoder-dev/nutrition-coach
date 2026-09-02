'use server';

import { auth } from '@/auth';
import { disconnectUser } from '@/lib/telegramLink';
import { revalidatePath } from 'next/cache';

export async function disconnectTelegram(): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await disconnectUser(session.user.id);
  revalidatePath('/targets');
  return { ok: true };
}
