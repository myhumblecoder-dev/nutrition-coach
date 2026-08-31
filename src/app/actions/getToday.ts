'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';

function startOfToday(now: Date): Date {
  const tz = process.env.APP_TIMEZONE ?? 'America/New_York';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '0';
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);
  const second = parseInt(getPart('second'), 10);
  const elapsedMs = (hour * 3600 + minute * 60 + second) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}

export async function getToday() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('Unauthorized');
  }

  const startOfDay = startOfToday(new Date());

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
      source: m.source,
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