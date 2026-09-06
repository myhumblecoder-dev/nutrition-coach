'use server';

import { auth } from '@/auth';
import { getTodayForUser } from '@/lib/dashboard';

export async function getToday() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('Unauthorized');
  }

  return getTodayForUser(userId);
}
