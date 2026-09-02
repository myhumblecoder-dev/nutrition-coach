'use server';

import { auth, signOut } from '@/auth';
import { prisma } from '@/lib/db';

const CONFIRMATION = 'DELETE';

/**
 * Permanently removes the signed-in user. Every related table declares
 * onDelete: Cascade, so this single delete takes meals, chat history,
 * training, recovery, mood, measurements, targets, profile, the Telegram
 * link, and the OAuth accounts and sessions with it.
 */
export async function deleteAccount(confirmation: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  if (confirmation.trim() !== CONFIRMATION) {
    throw new Error(`Type ${CONFIRMATION} to confirm account deletion`);
  }

  await prisma.user.delete({ where: { id: session.user.id } });
  await signOut({ redirectTo: '/' });
}
