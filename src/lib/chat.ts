import { prisma } from "@/lib/db";
import { generate } from "@/lib/llm";
import { extractHealthFacts } from "@/lib/extraction";
import { caffeineStatus } from "@/lib/caffeine";
import { startOfWeek, appTimeZone, nowLine } from "@/lib/time";
import { z } from "zod";

function startOfToday(now: Date): Date {
  const tz = appTimeZone();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  const elapsedMs = (parseInt(partMap.hour, 10) * 3600000) + (parseInt(partMap.minute, 10) * 60000) + (parseInt(partMap.second, 10) * 1000) + now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}

export async function coachReply(userId: string, userText: string): Promise<{ assistantReply: string }> {
  const validation = z.string().trim().min(1).safeParse(userText);
  if (!validation.success) {
    throw new Error("Message cannot be empty");
  }

  const cleanText = validation.data;

  const history = await prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const historyLines = history
    .reverse()
    .map((m) => `${m.role}: ${m.content}`);

  // Both the web ChatClient and Telegram render raw text, so markdown litters both.
  let coachPersona = nowLine() + " You are a friendly daily nutrition and fitness coach... Reply in plain conversational text — no markdown, no #, no *, no bullet lists. ";

  const target = await prisma.dailyTarget.findUnique({
    where: { userId },
  });

  if (target) {
    const today = startOfToday(new Date());
    const meals = await prisma.mealEntry.findMany({
      where: {
        userId,
        loggedAt: { gte: today },
      },
    });

    const consumedCal = meals.reduce((sum, m) => sum + m.totalCalories, 0);
    const consumedProtein = meals.reduce((sum, m) => sum + m.totalProtein, 0);

    coachPersona += `\nToday so far: ${consumedCal} of ${target.calories} cal, ${consumedProtein}g of ${target.protein}g protein.\n`;
  }

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (profile?.equipment) {
    coachPersona += `\nHome gym equipment: ${profile.equipment}.\n`;
  }
  if (profile?.notes) {
    coachPersona += `\nAbout the user: ${profile.notes}\n`;
  }

  const weekTraining = await prisma.trainingEntry.findMany({
    where: { userId, loggedAt: { gte: startOfWeek(new Date()) } },
  });
  if (weekTraining.length > 0) {
    const count = (kind: string) => weekTraining.filter((t) => t.kind === kind).length;
    coachPersona += `\nThis week: ${count('resistance')} resistance, ${count('hiit')} hiit, ${count('core')} core sessions.\n`;
  }

  const latest = await prisma.measurement.findFirst({
    where: { userId },
    orderBy: { measuredAt: 'desc' },
  });
  if (latest && (latest.weightLb != null || latest.waistIn != null)) {
    const bits = [];
    if (latest.weightLb != null) bits.push(`${latest.weightLb} lb`);
    if (latest.waistIn != null) bits.push(`${latest.waistIn} in waist`);
    coachPersona += `\nLatest measurement: ${bits.join(', ')}.\n`;
  }

  // Caffeine still in the system shapes sleep and training advice, so the
  // coach gets the live level rather than the raw doses.
  const caffeineRows = await prisma.recoveryEntry.findMany({
    where: { userId, kind: 'caffeine', loggedAt: { gte: startOfToday(new Date()) } },
  });
  if (caffeineRows.length > 0) {
    const status = caffeineStatus(
      caffeineRows.map((r) => ({ mg: r.value, at: r.loggedAt })),
      new Date()
    );
    if (status.currentMg > 0) {
      coachPersona += `\nCaffeine: about ${status.currentMg} mg still active from ${status.totalMg} mg today, effects fading over roughly ${status.hoursUntilEffectsFade} more hours (fully clear in about ${status.hoursUntilNegligible}). Factor this into sleep and training advice when relevant.\n`;
    }
  }

  const prompt = [
    coachPersona,
    ...historyLines,
    `user: ${cleanText}`,
  ].join("\n").replace(/\n\n/g, "\n");

  const reply = await generate(prompt);

  await Promise.all([
    prisma.chatMessage.create({
      data: { userId, role: "user", content: cleanText },
    }),
    prisma.chatMessage.create({
      data: { userId, role: "assistant", content: reply },
    }),
  ]);

  // Belt and braces on top of the orchestrator's own guard: extraction must
  // never break a reply.
  try {
    await extractHealthFacts(userId, cleanText);
  } catch {
    // ignore
  }

  return { assistantReply: reply };
}