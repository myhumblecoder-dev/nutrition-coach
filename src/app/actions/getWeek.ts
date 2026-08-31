'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { startOfToday, startOfWeek } from '@/lib/time';

export async function getWeek() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const userId = session.user.id;
  const [trainingEntries, recoveryEntries, moodEntry, measurementRow] = await Promise.all([
    prisma.trainingEntry.findMany({
      where: { userId, loggedAt: { gte: startOfWeek(new Date()) } },
    }),
    prisma.recoveryEntry.findMany({
      where: { userId, loggedAt: { gte: startOfToday(new Date()) } },
    }),
    prisma.moodEntry.findFirst({
      where: { userId },
      orderBy: { loggedAt: 'desc' },
    }),
    prisma.measurement.findFirst({
      where: { userId },
      orderBy: { measuredAt: 'desc' },
    }),
  ]);

  const today = startOfToday(new Date());
  const training = {
    resistance: trainingEntries.filter((e) => e.kind === 'resistance').length,
    hiit: trainingEntries.filter((e) => e.kind === 'hiit').length,
    core: trainingEntries.filter((e) => e.kind === 'core').length,
    stepsToday: trainingEntries
      .filter((e) => e.kind === 'neat' && e.loggedAt >= today)
      .reduce((sum, e) => sum + (e.steps ?? 0), 0),
  };

  const recovery = {
    sleepHours: recoveryEntries.find((e) => e.kind === 'sleep')?.value ?? null,
    waterLiters: recoveryEntries.find((e) => e.kind === 'water')?.value ?? null,
    alcoholDrinks: recoveryEntries.find((e) => e.kind === 'alcohol')?.value ?? null,
  };

  return {
    training,
    recovery,
    mood: moodEntry ? { score: moodEntry.score, note: moodEntry.note ?? null } : null,
    measurement: measurementRow
      ? { weightLb: measurementRow.weightLb ?? null, waistIn: measurementRow.waistIn ?? null }
      : null,
  };
}