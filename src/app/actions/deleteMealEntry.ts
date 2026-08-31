'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

export async function deleteMealEntry(id: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  let parsed: string;
  try {
    parsed = z.string().min(1).parse(id);
  } catch {
    throw new Error('Invalid meal id');
  }

  // deleteMany scoped by userId so a user can only delete their own rows.
  const result = await prisma.mealEntry.deleteMany({
    where: { id: parsed, userId: session.user.id },
  });

  if (result.count === 0) {
    throw new Error('Meal not found');
  }

  return { deleted: true };
}
