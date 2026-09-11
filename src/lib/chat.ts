import { prisma } from "@/lib/db";
import { generate } from "@/lib/llm";
import { extractHealthFacts } from "@/lib/extraction";
import { caffeineStatus } from "@/lib/caffeine";
import { describeExercises } from "@/lib/dashboard";
import { startOfWeek, appTimeZone, nowLine, startOfToday } from "@/lib/time";
import { COACH_PREAMBLE } from "@/lib/voice";
import { fatItemsFromJson, fatQualityLabel, wholeFoodFatShare } from "@/lib/fat";
import { naturalShare, processedItemsFromJson, processingLabel } from "@/lib/processing";
import { attributeTokens, denialFor, recordUsage, type DenialReason } from "@/lib/limits";
import { redactIdentifiers } from "@/lib/redact";
import { zoneFor } from "@/lib/userZone";
import {
  awaitingCheckInAnswer,
  buildProbePrompt,
  nextUnansweredField,
  recordAnswer,
  QUESTIONS,
} from "@/lib/checkin";
import { z } from "zod";

/**
 * The coach's answer, and — when there wasn't one — why.
 *
 * `denialReason` exists so the route can tell a spent cap from an absent
 * subscription. Both read as an ordinary coach reply to a person, but one is
 * answered by waiting until tomorrow and the other by a paywall, and prose
 * cannot be branched on. Undefined when the coach actually replied.
 */
export type CoachReply = { assistantReply: string; denialReason?: DenialReason };

export async function coachReply(userId: string, userText: string): Promise<CoachReply> {
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

  // The user's own day. Resolved once here and threaded down, so the meals
  // seeded into the prompt, the caffeine still in them, and the caps all agree
  // about when today started.
  const timeZone = await zoneFor(userId);

  // Enforced here rather than in the routes so no future caller can bypass it:
  // the Telegram webhook, the v1 API and any later surface all land on this
  // function. Nothing is persisted and no model is called once over the cap —
  // an abusive client must not be able to grow the table either.
  const denial = await denialFor(userId, "chat");
  if (denial) {
    return { assistantReply: denial.userMessage, denialReason: denial.reason };
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
    return answerCheckInInConversation(userId, checkInField, cleanText, modelText, usageEventId);
  }

  const historyLines = history
    .reverse()
    .map((m) => `${m.role}: ${m.content}`);

  let coachPersona = nowLine() + " " + COACH_PREAMBLE + " ";

  // Extraction runs first, before anything below reads the day's state.
  //
  // It used to run *after* the reply, which made "Logged." theatre: the model
  // said it because a statement gets a statement back, with no idea whether a
  // row had been written. "Log 40g healthy fats" got a confident "Logged." and
  // stored nothing, because fat is a property of a meal and there was no meal
  // in that sentence. An app whose whole claim is that every number came from
  // the conversation cannot invent having saved one.
  //
  // One call, unconditional. It used to be two — an onboarding copy that ran
  // early because the coach has to state the target it just worked out, and a
  // post-reply copy guarded so the same meal was not logged twice. Now that
  // both want the same position, the guards are gone and with them the bug
  // they caused: the onboarding branch dropped its result, so on exactly the
  // turn that wrote a measurement and a target the prompt said both "state the
  // numbers you have set" and "nothing was saved".
  //
  // Still wrapped. A failed extraction must never cost the user their reply,
  // and leaving the counts at zero tells the coach nothing was saved rather
  // than leaving it free to guess.
  let recorded = { meals: 0, training: 0, recovery: 0, mood: 0, measurement: 0 };
  try {
    // Coalesced rather than assigned: a throw is caught below, but a call
    // that resolves to nothing is not, and it would leave `recorded`
    // undefined for `storageNote` to index.
    recorded =
      (await extractHealthFacts(userId, modelText, {
        sourceText: cleanText,
        onUsage: (usage) => void attributeTokens(usageEventId, usage),
      })) ?? recorded;
  } catch {
    // Deliberately silent — see above.
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
    const today = startOfToday(new Date(), timeZone);
    const meals = await prisma.mealEntry.findMany({
      where: {
        userId,
        loggedAt: { gte: today },
      },
    });

    const consumedCal = meals.reduce((sum, m) => sum + m.totalCalories, 0);
    const consumedProtein = meals.reduce((sum, m) => sum + m.totalProtein, 0);
    const consumedFat = meals.reduce((sum, m) => sum + (m.totalFat ?? 0), 0);

    coachPersona += `\nToday so far: ${consumedCal} of ${target.calories} cal, ${consumedProtein}g of ${target.protein}g protein, ${consumedFat}g fat.\n`;

    // The coach is told the two quality readings, and told they are its job to
    // interpret rather than the screen's. The gauge can only show a position;
    // it cannot say that a protein shake is ultra-processed *and* fine, which
    // is exactly the case where a bare marker would contradict the coach's own
    // advice to hit a protein target.
    const fatShare = wholeFoodFatShare(meals.flatMap((m) => fatItemsFromJson(m.foodItems)));
    const natural = naturalShare(meals.flatMap((m) => processedItemsFromJson(m.foodItems)));

    if (fatShare !== null) {
      coachPersona +=
        `Fat quality: ${fatQualityLabel(fatShare)} — whole-food fat versus refined, ` +
        'not saturated versus unsaturated. Avocado and butter are whole; crisps and ' +
        'fried takeaway are refined.\n';
    }

    if (natural !== null) {
      coachPersona +=
        `How processed today was: ${processingLabel(natural)}.\n` +
        'Be sensible about this rather than dogmatic. Ultra-processed is not a verdict: ' +
        'protein powder and supermarket bread are both ultra-processed and both fine, ' +
        'and you are the one who tells them to hit a protein target. Comment on what ' +
        'the food actually was. Never imply they should feel bad about it.\n';
    }
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
    where: { userId, kind: 'caffeine', loggedAt: { gte: startOfToday(new Date(), timeZone) } },
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

  // Extraction runs BEFORE the reply, not after it.
  //
  // It used to run after, which made "Logged." theatre: the model said it
  // because a statement gets a statement back, with no idea whether a row had
  // actually been written. Asking the coach to "log 40g of fat" got a
  // confident "Logged." and stored nothing, because fat is a property of a
  // meal and there was no meal in that sentence. An app whose whole claim is
  // that every number came from the conversation cannot invent having saved
  // one.
  //
  // Same two model calls in the same order of magnitude of time — only the
  // order changed — and still wrapped, because extraction must never break a
  // reply. Skipped when onboarding already ran it above; twice would log the
  // same meal twice.
  coachPersona += storageNote(recorded);

  const prompt = [
    coachPersona,
    ...historyLines,
    `user: ${modelText}`,
  ].join("\n").replace(/\n\n/g, "\n");

  const reply = await generate(prompt, (usage) => {
    void attributeTokens(usageEventId, usage);
  });

  // After the reply, so a failed `generate` does not leave a user message with
  // nothing answering it — at the cost that a failure leaves an extracted row
  // with no exchange in the chat history. That is the better trade: the row
  // carries its own `sourceText`, the user's own words, which is exactly what
  // the activity feed shows, so the meal explains itself. Persisting the user
  // message first would only swap an unexplained row for a duplicated message
  // on the retry.
  await persistExchange(userId, cleanText, reply);

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
  modelText: string,
  /**
   * The usage row this turn was recorded against, so the two model calls this
   * branch makes land on it rather than vanishing from the month's spend.
   */
  usageEventId: string | null
): Promise<{ assistantReply: string }> {
  // recordAnswer keeps the verbatim words even when its summariser fails, so
  // the answer is never lost to a model error.
  const updated = await recordAnswer(userId, field, userText);
  const nextField = nextUnansweredField(updated);

  let reply: string;
  try {
    reply = (
      await generate(buildProbePrompt(field, modelText, nextField), (usage) =>
        void attributeTokens(usageEventId, usage)
      )
    ).trim();
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
    await extractHealthFacts(userId, modelText, {
      sourceText: userText,
      onUsage: (usage) => void attributeTokens(usageEventId, usage),
    });
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


/**
 * Tells the coach what this message actually wrote to the database.
 *
 * The point is the negative case. Without it the model says "Logged." to
 * anything that looks like a statement, which is a lie whenever nothing could
 * be extracted — and the thing most often not extractable is a request to log
 * a bare number, because every row here hangs off a named food, session or
 * measurement.
 */
function storageNote(recorded: Record<string, number> | undefined): string {
  // An explicit map, not Object.entries over whatever came back.
  // `recordHealthFacts` returns a sixth key — `targets` — which TypeScript
  // erases at the assignment and which a blind iteration picked up at runtime,
  // so asking to change a calorie goal told the coach "1 targets" was
  // recorded. The labels also carry their own plurals: "1 meals" is the kind
  // of thing a model will faithfully repeat.
  const LABELS: Array<[string, [string, string]]> = [
    ['meals', ['meal', 'meals']],
    ['training', ['training session', 'training sessions']],
    ['recovery', ['recovery entry', 'recovery entries']],
    ['mood', ['mood note', 'mood notes']],
    ['measurement', ['measurement', 'measurements']],
    ['targets', ['daily target', 'daily targets']],
  ];

  const written = LABELS.flatMap(([key, [one, many]]) => {
    const count = recorded?.[key] ?? 0;
    return count > 0 ? [`${count} ${count === 1 ? one : many}`] : [];
  });

  if (written.length > 0) {
    return `\nRecorded from this message: ${written.join(', ')}. You may say it is logged.\n`;
  }

  return (
    '\nNothing in this message was recorded — no meal, training, measurement, ' +
    'recovery value or mood was extracted from it. Do NOT say "logged" and do ' +
    'not imply anything was saved. If they asked you to log something, say ' +
    'plainly that you cannot and what you need instead.\n' +
    'Fat is recorded as part of a meal, worked out from what the meal was. ' +
    'There is no way to log fat on its own, so if they ask, tell them to name ' +
    'the food and you will take it from there.\n'
  );
}
