'use server';

import { auth } from '@/auth';
import { analyzeMeal as analyzeMealCore } from '@/lib/analyzeMeal';
import { UsageLimitError } from '@/lib/limits';

// Server actions are public POST endpoints: without this gate anyone could
// burn vision-LLM budget. The sessionless Telegram webhook imports the core
// lib directly instead of this wrapper.
export async function analyzeMeal(photoUrl: string, hint?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  try {
    return await analyzeMealCore(session.user.id, photoUrl, hint);
  } catch (error) {
    // The cap's copy is written to be read by the user, so surface it rather
    // than letting the client show a generic failure.
    if (error instanceof UsageLimitError) throw new Error(error.userMessage);
    throw error;
  }
}
