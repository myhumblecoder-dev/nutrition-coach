import { prisma } from "@/lib/db";
import { generate } from "@/lib/llm";
import { extractHealthFacts } from "@/lib/extraction";
import { caffeineStatus } from "@/lib/caffeine";
import { startOfWeek, appTimeZone, nowLine } from "@/lib/time";
import { COACH_PREAMBLE } from "@/lib/voice";
import { isOverLimit, recordUsage, todaySuccesses, limitMessage } from "@/lib/limits";
import {
  awaitingCheckInAnswer,
  buildProbePrompt,
  nextUnansweredField,
  recordAnswer,
  QUESTIONS,
} from "@/lib/checkin";
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

  // Enforced here rather than in the routes so no future caller can bypass it:
  // the Telegram webhook, the v1 API and any later surface all land on this
  // function. Nothing is persisted and no model is called once over the cap —
  // an abusive client must not be able to grow the table either.
  if (await isOverLimit(userId, "chat")) {
    return { assistantReply: limitMessage(await todaySuccesses(userId)) };
  }

  // Recorded before the call: a timeout still costs money, and counting only
  // successes would let a failing loop run free.
  await recordUsage(userId, "chat");

  const history = await prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Captured before the reverse below, which mutates the array.
  const lastMessage = history[0];

  // The weekly check-in is answered here, in the conversation, rather than on
  // a screen of its own — which is what makes it a coach that asks rather than
  // a form that waits. If the coach's last message was this week's question,
  // this message is the answer to it.
  const checkInField = await awaitingCheckInAnswer(
    userId,
    lastMessage?.role === "assistant" ? lastMessage.content : null
  );
  if (checkInField) {
    return answerCheckInInConversation(userId, checkInField, cleanText);
  }

  const historyLines = history
    .reverse()
    .map((m) => `${m.role}: ${m.content}`);

  let coachPersona = nowLine() + " " + COACH_PREAMBLE + " ";

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
/**
 * Records a check-in answer given conversationally, and replies in the coach's
 * voice with the next question.
 *
 * Both sides are written to the chat like any other exchange, so the check-in
 * reads as part of the conversation rather than as a separate mode the user
 * has been put into without being told.
 */
async function answerCheckInInConversation(
  userId: string,
  field: Awaited<ReturnType<typeof awaitingCheckInAnswer>> & string,
  userText: string
): Promise<{ assistantReply: string }> {
  // recordAnswer keeps the verbatim words even when its summariser fails, so
  // the answer is never lost to a model error.
  const updated = await recordAnswer(userId, field, userText);
  const nextField = nextUnansweredField(updated);

  let reply: string;
  try {
    reply = (await generate(buildProbePrompt(field, userText, nextField))).trim();
  } catch (error) {
    // The answer is already saved. A failed reply must degrade the
    // conversation, not lose the record — the same rule the v1 route follows.
    console.error(error instanceof Error ? error.message : "Unknown error");
    reply = nextField
      ? QUESTIONS[nextField]
      : "That's the whole check-in. I'll ask again next week.";
  }

  await Promise.all([
    prisma.chatMessage.create({ data: { userId, role: "user", content: userText } }),
    prisma.chatMessage.create({ data: { userId, role: "assistant", content: reply } }),
  ]);

  // A check-in answer is still something the user said — "172 on the scale"
  // belongs on Today whether it arrived as an answer or as small talk.
  try {
    await extractHealthFacts(userId, userText);
  } catch {
    // ignore
  }

  return { assistantReply: reply };
}
