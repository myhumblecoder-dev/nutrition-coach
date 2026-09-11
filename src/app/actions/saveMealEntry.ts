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
    // Optional because the type has to accept a meal analysed before these
    // existed, but named here rather than left off: `logMealForUser` strips
    // anything its schema does not list, so a field missing from the type is
    // a field silently lost on the way to the database.
    fat?: number;
    fatSource?: 'whole' | 'refined' | null;
    processingGroup?: 1 | 2 | 3 | 4 | null;
  }>;
  totalCalories: number;
  totalProtein: number;
  totalFat?: number;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  return logMealForUser(session.user.id, input);
}
