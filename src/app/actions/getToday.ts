'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function getToday() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('Unauthorized');
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [meals, target] = await Promise.all([
    prisma.mealEntry.findMany({
      where: {
        userId,
        loggedAt: {
          gte: startOfDay,
        },
      },
      orderBy: {
        loggedAt: 'desc',
      },
    }),
    prisma.dailyTarget.findUnique({
      where: { userId },
    }),
  ]);

  const consumed = meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + meal.totalCalories,
      protein: acc.protein + meal.totalProtein,
    }),
    { calories: 0, protein: 0 }
  );

  return {
    meals: meals.map((m) => ({
      id: m.id,
      foodItems: m.foodItems,
      totalCalories: m.totalCalories,
      totalProtein: m.totalProtein,
      photoUrl: m.photoUrl,
      loggedAt: m.loggedAt,
    })),
    target: target
      ? {
          calories: target.calories,
          protein: target.protein,
        }
      : null,
    consumed,
  };
}