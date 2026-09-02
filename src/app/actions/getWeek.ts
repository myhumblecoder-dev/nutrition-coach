'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { startOfToday, startOfWeek } from '@/lib/time';
import { caffeineStatus } from '@/lib/caffeine';

export async function getWeek() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const userId = session.user.id;
  const now = new Date();
  const weekStart = startOfWeek(now);
  const today = startOfToday(now);
  const streakStart = new Date(today.getTime() - 6 * 86400000);
  const [trainingEntries, recoveryEntries, moodEntry, measurementRow, streakMeals, weightRows] =
    await Promise.all([
      prisma.trainingEntry.findMany({
        where: { userId, loggedAt: { gte: weekStart } },
      }),
      prisma.recoveryEntry.findMany({
        where: { userId, loggedAt: { gte: today } },
      }),
      prisma.moodEntry.findFirst({
        where: { userId, loggedAt: { gte: today } },
        orderBy: { loggedAt: 'desc' },
      }),
      prisma.measurement.findFirst({
        where: { userId },
        orderBy: { measuredAt: 'desc' },
      }),
      prisma.mealEntry.findMany({
        where: { userId, confirmed: true, loggedAt: { gte: streakStart } },
      }),
      prisma.measurement.findMany({
        where: { userId, weightLb: { not: null } },
        orderBy: { measuredAt: 'desc' },
        take: 30,
      }),
    ]);

  // Bucket by whole local days since an anchor midnight (0–6, clamped).
  const dayIndex = (at: Date, anchor: Date) =>
    Math.min(6, Math.max(0, Math.floor((at.getTime() - anchor.getTime()) / 86400000)));

  const daysFor = (kind: string) => {
    const days = [false, false, false, false, false, false, false];
    for (const e of trainingEntries.filter((t) => t.kind === kind)) {
      days[dayIndex(e.loggedAt, weekStart)] = true;
    }
    return days;
  };

  const streak = [false, false, false, false, false, false, false];
  for (const m of streakMeals) {
    streak[dayIndex(m.loggedAt, streakStart)] = true;
  }
  const training = {
    resistance: trainingEntries.filter((e) => e.kind === 'resistance').length,
    hiit: trainingEntries.filter((e) => e.kind === 'hiit').length,
    core: trainingEntries.filter((e) => e.kind === 'core').length,
    stepsToday: trainingEntries
      .filter((e) => e.kind === 'neat' && e.loggedAt >= today)
      .reduce((sum, e) => sum + (e.steps ?? 0), 0),
    days: {
      resistance: daysFor('resistance'),
      hiit: daysFor('hiit'),
      core: daysFor('core'),
    },
  };

  // Each caffeine row is a dose with its own timestamp: the level still in the
  // user's system depends on WHEN it was drunk, not just how much.
  const caffeineDoses = recoveryEntries
    .filter((e) => e.kind === 'caffeine')
    .map((e) => ({ mg: e.value, at: e.loggedAt }));

  const recovery = {
    sleepHours: recoveryEntries.find((e) => e.kind === 'sleep')?.value ?? null,
    waterLiters: recoveryEntries.find((e) => e.kind === 'water')?.value ?? null,
    caffeine: caffeineDoses.length > 0 ? caffeineStatus(caffeineDoses, new Date()) : null,
  };

  return {
    training,
    recovery,
    streak,
    weights: weightRows
      .slice()
      .reverse()
      .map((w) => ({ at: w.measuredAt, weightLb: w.weightLb as number })),
    mood: moodEntry ? { score: moodEntry.score, note: moodEntry.note ?? null } : null,
    measurement: measurementRow
      ? { weightLb: measurementRow.weightLb ?? null, waistIn: measurementRow.waistIn ?? null }
      : null,
  };
}