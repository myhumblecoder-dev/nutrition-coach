'use server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

export async function saveMealEntry(input: {
  photoUrl: string;
  foodItems: Array<{
    name: string;
    portion: string;
    calories: number;
    protein: number;
  }>;
  totalCalories: number;
  totalProtein: number;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const schema = z.object({
    photoUrl: z.string().url(),
    foodItems: z.array(
      z.object({
        name: z.string().trim().min(1),
        portion: z.string().trim().min(1),
        calories: z.number().int().nonnegative(),
        protein: z.number().int().nonnegative(),
      })
    ).min(1),
    totalCalories: z.number().int().nonnegative(),
    totalProtein: z.number().int().nonnegative(),
  });

  let parsed;
  try {
    parsed = schema.parse(input);
  } catch (err) {
    if (err instanceof Error) {
      // Zod error handling
      throw new Error('Invalid meal entry data');
    }
    throw new Error('Invalid meal entry data');
  }

  const created = await prisma.mealEntry.create({
    data: {
      userId: session.user.id,
      photoUrl: parsed.photoUrl,
      foodItems: JSON.stringify(parsed.foodItems),
      totalCalories: parsed.totalCalories,
      totalProtein: parsed.totalProtein,
      confirmed: true,
    },
  });

  return { id: created.id };
}