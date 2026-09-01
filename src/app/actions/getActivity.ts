'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { startOfToday } from '@/lib/time';

export async function getActivity() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const userId = session.user.id;
  const since = startOfToday(new Date());

  const [meals, trainings, recoveries, moods, measurements] = await Promise.all([
    prisma.mealEntry.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: { loggedAt: 'desc' },
      take: 5,
    }),
    prisma.trainingEntry.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: { loggedAt: 'desc' },
      take: 5,
    }),
    prisma.recoveryEntry.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: { loggedAt: 'desc' },
      take: 5,
    }),
    prisma.moodEntry.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: { loggedAt: 'desc' },
      take: 5,
    }),
    prisma.measurement.findMany({
      where: { userId, measuredAt: { gte: since } },
      orderBy: { measuredAt: 'desc' },
      take: 5,
    }),
  ]);

  const mappedMeals = meals.map((row) => {
    let label = 'Meal';
    try {
      const foodItems = JSON.parse(row.foodItems);
      if (Array.isArray(foodItems) && foodItems.length > 0) {
        const names = foodItems.map((item: { name: string }) => item.name).join(', ');
        label = names + ' · ' + row.totalCalories + ' kcal · ' + row.totalProtein + 'g';
      } else {
        label = 'Meal · ' + row.totalCalories + ' kcal · ' + row.totalProtein + 'g';
      }
    } catch (e) {
      label = 'Meal · ' + row.totalCalories + ' kcal · ' + row.totalProtein + 'g';
    }

    return {
      id: row.id,
      at: row.loggedAt,
      sourceText: row.sourceText || '',
      source: row.source,
      kind: 'meal',
      label: label,
      photoUrl: row.photoUrl && row.photoUrl.length > 0 ? row.photoUrl : null,
    };
  });

  const mappedTrainings = trainings.map((row) => {
    let label = row.kind;
    if (row.minutes) {
      label = label + ' · ' + row.minutes + ' min';
    }
    if (row.steps) {
      label = label + ' · ' + row.steps + ' steps';
    }
    return {
      id: row.id,
      at: row.loggedAt,
      sourceText: row.sourceText || '',
      source: row.source,
      kind: 'training',
      label: label,
      photoUrl: null,
    };
  });

  const mappedRecoveries = recoveries.map((row) => {
    return {
      id: row.id,
      at: row.loggedAt,
      sourceText: row.sourceText || '',
      source: row.source,
      kind: 'recovery',
      label: row.kind + ' ' + row.value,
      photo: null,
      photoUrl: null,
    };
  });

  const mappedMoods = moods.map((row) => {
    return {
      id: row.id,
      at: row.loggedAt,
      sourceText: row.sourceText || '',
      source: row.source,
      kind: 'mood',
      label: 'mood ' + row.score + '/5',
      photoUrl: null,
    };
  });

  const mappedMeasurements = measurements.map((row) => {
    const parts: string[] = [];
    if (row.weightLb) {
      parts.push(row.weightLb + ' lb');
    }
    if (row.waistIn) {
      parts.push(row.waistIn + ' in waist');
    }
    return {
      id: row.id,
      at: row.measuredAt,
      sourceText: row.sourceText || '',
      source: row.source,
      kind: 'measurement',
      label: parts.join(' · '),
      photoUrl: null,
    };
  });

  const allEntries = [
    ...mappedMeals,
    ...mappedTrainings,
    ...mappedRecoveries,
    ...mappedMoods,
    ...mappedMeasurements,
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return allEntries.slice(0, 8);
}