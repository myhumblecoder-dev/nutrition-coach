'use server';

import { auth } from '@/auth';
import { setTargetForUser, type DailyTargetInput } from '@/lib/targets';

// Session wrapper only. The write lives in src/lib/targets.ts so the native
// client's PUT /api/v1/targets and this form cannot disagree about what a
// valid target is.
export async function upsertDailyTarget(input: DailyTargetInput) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  try {
    await setTargetForUser(session.user.id, input);
  } catch {
    throw new Error('Invalid target data');
  }
}
