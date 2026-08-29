import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

export async function upsertDailyTarget(input: { calories: number; protein: number }) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const schema = z.object({
    calories: z.number().int().positive(),
    protein: z.number().int().positive(),
  });

  let parsed;
  try {
    parsed = schema.parse(input);
  } catch (err) {
    throw new Error('Invalid target data');
  }

  await prisma.dailyTarget.upsert({
    where: { userId: session.user.id },
    create: {
      calories: parsed.calories,
      protein: parsed.protein,
      userId: session.user.id,
    },
    update: {
      calories: parsed.calories,
      protein: parsed.protein,
    },
  });
}