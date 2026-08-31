'use server';

import { auth } from '@/auth';
import { logMealForUser } from '@/lib/meals';

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

  return logMealForUser(session.user.id, input);
}
