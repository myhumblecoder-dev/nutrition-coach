'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { deletePhotos } from '@/lib/photoStore';
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

  // Read the photo before the row goes, or the blob is orphaned with nothing
  // left pointing at it. This is the in-app "delete this meal" action, so it
  // is the commonest way a logged photo becomes garbage.
  const meal = await prisma.mealEntry.findFirst({
    where: { id: parsed, userId: session.user.id },
    select: { photoUrl: true },
  });

  // deleteMany scoped by userId so a user can only delete their own rows.
  const result = await prisma.mealEntry.deleteMany({
    where: { id: parsed, userId: session.user.id },
  });

  if (result.count === 0) {
    throw new Error('Meal not found');
  }

  await deletePhotos([meal?.photoUrl]);

  return { deleted: true };
}
