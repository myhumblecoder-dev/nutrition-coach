'use server';

import { auth } from '@/auth';
import { getActivityForUser } from '@/lib/dashboard';

// Session wrapper only — see getWeek.ts for why the query lives in
// src/lib/dashboard.ts.
export async function getActivity() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  return getActivityForUser(session.user.id);
}
