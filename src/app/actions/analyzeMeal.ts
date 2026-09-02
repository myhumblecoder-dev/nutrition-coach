'use server';

import { auth } from '@/auth';
import { analyzeMeal as analyzeMealCore } from '@/lib/analyzeMeal';

// Server actions are public POST endpoints: without this gate anyone could
// burn vision-LLM budget. The sessionless Telegram webhook imports the core
// lib directly instead of this wrapper.
export async function analyzeMeal(photoUrl: string, hint?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  return analyzeMealCore(photoUrl, hint);
}
