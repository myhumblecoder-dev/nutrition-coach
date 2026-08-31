import { prisma } from "@/lib/db";
import { generate } from "@/lib/llm";
import { extractHealthFacts } from "@/lib/extraction";
import { z } from "zod";

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

  let coachPersona = "You are a friendly daily nutrition and fitness coach...";

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