'use server';

import { auth } from '@/auth';
import { getWeekForUser } from '@/lib/dashboard';

// The session-bearing wrapper. The query lives in src/lib/dashboard.ts so the
// bearer-authenticated route serves the native client exactly what this serves
// the web — the iOS Today screen is a mirror of the web one, and two copies of
// this query would drift apart.
export async function getWeek() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  return getWeekForUser(session.user.id);
}
