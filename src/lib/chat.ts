import { prisma } from "@/lib/db";
import { generate } from "@/lib/llm";
import { extractHealthFacts } from "@/lib/extraction";
import { caffeineStatus } from "@/lib/caffeine";
import { describeExercises } from "@/lib/dashboard";
import { startOfWeek, appTimeZone, nowLine } from "@/lib/time";
import { COACH_PREAMBLE } from "@/lib/voice";
import { attributeTokens, denialFor, recordUsage } from "@/lib/limits";
import { redactIdentifiers } from "@/lib/redact";
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

  // What goes to the model, with direct identifiers stripped. Kept separate
  // from cleanText because the user's own words are what get persisted and
  // quoted back in the receipts feed — the coach has no use for an email
  // address, but the person who typed it should still see what they wrote.
  //
  // Health data is NOT filtered. It is the entire input to this app; removing
  // it would leave nothing to read.
  const modelText = redactIdentifiers(cleanText);

  // Enforced here rather than in the routes so no future caller can bypass it:
  // the Telegram webhook, the v1 API and any later surface all land on this
  // function. Nothing is persisted and no model is called once over the cap —
  // an abusive client must not be able to grow the table either.
  const denial = await denialFor(userId, "chat");
  if (denial) {
    return { assistantReply: denial.userMessage };
  }

  // Recorded before the call: a timeout still costs money, and counting only
  // successes would let a failing loop run free.
  const usageEventId = await recordUsage(userId, "chat");

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
    return answerCheckInInConversation(userId, checkInField, cleanText, modelText);
  }

  const historyLines = history
    .reverse()
    .map((m) => `${m.role}: ${m.content}`);

  let coachPersona = nowLine() + " " + COACH_PREAMBLE + " ";

  // Extraction normally runs after the reply, so a failure cannot cost the
  // user their message. During onboarding it has to run first: the coach's
  // whole job that turn is to state the target it just worked out, and it
  // cannot state something that has not happened yet.
  const hadTargetBefore = (await prisma.dailyTarget.findUnique({ where: { userId } })) !== null;
  if (!hadTargetBefore) {
    try {
      await extractHealthFacts(userId, modelText);
    } catch {
      // A failed extraction must not cost the reply.
    }
  }

  const target = await prisma.dailyTarget.findUnique({
    where: { userId },
  });

  if (!target) {
    // Onboarding. Extraction runs before the reply in this case only — see
    // below — so by here the target may have just been set from what the user
    // said, and the coach can state it instead of promising it next turn.
    coachPersona +=
      '\nThey have no daily calorie or protein target yet. If this message ' +
      'states one, confirm it back. If it gives their height and weight, tell ' +
      'them the starting numbers you have set — say plainly that it is a rough ' +
      'starting point they can change any time. If it gives neither, ask ' +
      'again, briefly.\n';
  }

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

    // The actual lifts, so a suggestion can build on the last session instead
    // of being generic advice. A coach that cannot see what you squatted last
    // week cannot tell you what to squat this week.
    const recent = weekTraining
      .filter((t) => t.exercises)
      .slice(-3)
      .map((t) => describeExercises(t.exercises))
      .filter(Boolean);
    if (recent.length > 0) {
      coachPersona += `Recent sessions: ${recent.join(' | ')}.\n`;
    }
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
    `user: ${modelText}`,
  ].join("\n").replace(/\n\n/g, "\n");

  const reply = await generate(prompt, (usage) => {
    void attributeTokens(usageEventId, usage);
  });

  await persistExchange(userId, cleanText, reply);

  // Belt and braces on top of the orchestrator's own guard: extraction must
  // never break a reply. Skipped when onboarding already ran it above — twice
  // would log the same meal twice.
  if (hadTargetBefore) {
    try {
      await extractHealthFacts(userId, modelText);
    } catch {
      // ignore
    }
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
  /** The user's own words — persisted, and quoted back on Today. */
  userText: string,
  /** The same answer with direct identifiers stripped, for the model. */
  modelText: string
): Promise<{ assistantReply: string }> {
  // recordAnswer keeps the verbatim words even when its summariser fails, so
  // the answer is never lost to a model error.
  const updated = await recordAnswer(userId, field, userText);
  const nextField = nextUnansweredField(updated);

  let reply: string;
  try {
    reply = (await generate(buildProbePrompt(field, modelText, nextField))).trim();
  } catch (error) {
    // The answer is already saved. A failed reply must degrade the
    // conversation, not lose the record — the same rule the v1 route follows.
    console.error(error instanceof Error ? error.message : "Unknown error");
    reply = nextField
      ? QUESTIONS[nextField]
      : "That's the whole check-in. I'll ask again next week.";
  }

  await persistExchange(userId, userText, reply);

  // A check-in answer is still something the user said — "172 on the scale"
  // belongs on Today whether it arrived as an answer or as small talk.
  try {
    await extractHealthFacts(userId, modelText);
  } catch {
    // ignore
  }

  return { assistantReply: reply };
}

/**
 * Writes a question and its answer in an order the reader can rely on.
 *
 * Both rows used to be created inside a `Promise.all`, each defaulting
 * createdAt to now(). Concurrent inserts tie or invert at millisecond
 * resolution, so ordering by createdAt was a coin flip and the coach's reply
 * rendered above the message it was answering — on the web as well as iOS,
 * because both clients read the same history.
 *
 * The timestamps are explicit and one millisecond apart. Writing sequentially
 * is not enough on its own: two inserts inside the same millisecond still tie,
 * and the bug returns only sometimes, which is worse than always.
 */
async function persistExchange(userId: string, userText: string, reply: string): Promise<void> {
  const askedAt = new Date();

  await prisma.chatMessage.create({
    data: { userId, role: "user", content: userText, createdAt: askedAt },
  });
  await prisma.chatMessage.create({
    data: {
      userId,
      role: "assistant",
      content: reply,
      createdAt: new Date(askedAt.getTime() + 1),
    },
  });
}
