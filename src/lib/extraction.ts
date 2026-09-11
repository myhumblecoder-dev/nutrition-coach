import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generate, type UsageReporter } from '@/lib/llm';
import { zoneFor } from '@/lib/userZone';
import { startOfToday } from '@/lib/time';
import { setTargetForUser, getTargetForUser } from '@/lib/targets';
import { estimateTargets } from '@/lib/onboarding';

// Round rather than reject fractional model estimates (same policy as analyzeMeal).
const roundedInt = z.number().nonnegative().transform(Math.round);

// Counts what a lenient array threw away, so a drop can be reported instead of
// vanishing. Reset per parse.
let discarded = 0;

/**
 * A bounded array that degrades item by item.
 *
 * `z.array(x).max(n).catch([])` looks like a cap but is a validation failure:
 * one extra item — or one bad field in one item — discards EVERY item. A
 * breakfast described as "eggs, toast, coffee and tea" is four meals, so the
 * whole meal list was being dropped while sleep and water came through. Here a
 * malformed item is skipped, its siblings survive, and the cap truncates.
 */
function lenientArray<T extends z.ZodTypeAny>(item: T, max: number) {
  return z.unknown().transform((raw) => {
    if (!Array.isArray(raw)) return [] as z.infer<T>[];
    const kept: z.infer<T>[] = [];
    for (const candidate of raw) {
      if (kept.length >= max) {
        discarded += raw.length - kept.length;
        break;
      }
      const parsed = item.safeParse(candidate);
      if (parsed.success) kept.push(parsed.data);
      else discarded++;
    }
    return kept;
  });
}

// Caps bound a runaway response; they are not editorial. A single meal
// description routinely names four or five things.
const factsSchema = z.object({
  meals: lenientArray(
    z.object({
      name: z.string().trim().min(1),
      portion: z.string().trim().min(1).catch('1 serving').default('1 serving'),
      calories: roundedInt,
      protein: roundedInt,
      fat: roundedInt.catch(0).default(0),
      // See `fat.ts`: where the fat came from, not whether it is saturated.
      fatSource: z.enum(['whole', 'refined']).nullable().catch(null).default(null),
      // NOVA 1-4. See `processing.ts` — a different question from fatSource.
      processingGroup: z
        .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
        .nullable()
        .catch(null)
        .default(null),
    }),
    8
  ),
  training: lenientArray(
    z.object({
      kind: z.enum(['resistance', 'hiit', 'core', 'neat']),
      minutes: z.number().int().nonnegative().optional(),
      steps: z.number().int().nonnegative().optional(),
      note: z.string().optional(),
      // What was actually done. Capped like every other array here: a runaway
      // response must not write a hundred exercises from one sentence.
      exercises: lenientArray(
        z.object({
          name: z.string().trim().min(1).max(80),
          sets: z.number().int().min(1).max(50).optional(),
          reps: z.number().int().min(1).max(1000).optional(),
          weightLb: z.number().min(0).max(2000).optional(),
        }),
        12
      ).optional(),
    }),
    5
  ),
  recovery: lenientArray(
    z.object({
      kind: z.enum(['sleep', 'water', 'caffeine']),
      value: z.number().nonnegative(),
    }),
    5
  ),
  mood: lenientArray(
    z.object({
      score: z.number().int().min(1).max(5),
      note: z.string().optional(),
    }),
    3
  ),
  // Height does not change, so it is a single value rather than a series.
  // Asked for only during onboarding, to estimate a starting target for
  // someone who does not know theirs.
  heightIn: z.number().min(36).max(96).nullish().catch(null),
  // A target is a standing instruction, not an event, so it is a single
  // optional object rather than an array — and it is the one field here that
  // overwrites rather than appends. That is why the prompt requires an
  // explicit instruction: mistaking "I'm aiming for 2,000 calories today" for
  // a permanent target would silently change every ring on Today.
  targets: z
    .object({
      calories: z.number().int().min(500).max(10000),
      protein: z.number().int().min(20).max(500),
    })
    .nullish()
    .catch(null),
  measurement: lenientArray(
    z.object({
      weightLb: z.number().nonnegative().optional(),
      waistIn: z.number().nonnegative().optional(),
    }),
    3
  ),
});

const EMPTY_FACTS = {
  meals: [],
  training: [],
  recovery: [],
  mood: [],
  measurement: [],
} as z.infer<typeof factsSchema>;

export function buildExtractionPrompt(
  seeds: { meals: string[]; training: string[]; recovery: string[] },
  userText: string
): string {
  const list = (items: string[]) => (items.length > 0 ? items.join(', ') : 'none');
  return (
    'Extract facts from the message (empty arrays when nothing qualifies). List each distinct item ' +
    'separately — a breakfast of eggs, toast and coffee is three meal items, not one.\n' +
    'MEALS: when the user says they ate or drank something caloric, include it and, as a nutrition ' +
    'coach, ESTIMATE its calories and protein as integers — use any numbers the user stated, estimate ' +
    'the rest from typical portions. Do not skip a meal just because macros were not stated.\n' +
    'CAFFEINE: users name drinks, not milligrams, so ESTIMATE the milligrams from what they describe — ' +
    'roughly brewed coffee 95 per cup, espresso 65 per shot, black tea 47, green tea 28, energy drink 80, ' +
    'decaf 3 — multiplied by the number of servings stated.\n' +
    'EXERCISES: when they name lifts, record each one. "3x8 squats at 185" is ' +
    '{"name":"squat","sets":3,"reps":8,"weightLb":185}; "squats and rows" is two ' +
    'entries with a name only. Never invent sets, reps or weight they did not say.\n' +
    'EVERYTHING ELSE (training, mood, measurement, and the sleep and water recovery kinds): ONLY facts the ' +
    'user EXPLICITLY stated — never infer, never invent.\n' +
    'Return ONLY a JSON object with keys: "meals" (array of {"name","portion","calories","protein",' +
    '"fat","fatSource"} with integer calories/protein/fat and fatSource "whole"|"refined"|null ' +
    '— "whole" for fat from a whole food (avocado, nuts, eggs, dairy, butter, olive oil, meat, ' +
    'oily fish), "refined" for fat from an industrially processed product (anything deep fried, ' +
    'crisps, fast food, margarine, commercial baked goods), null when there is no real fat. ' +
    'Butter is "whole"; crisps are "refined" despite being mostly unsaturated), "training" (array of {"kind": "resistance"|"hiit"|"core"|"neat", ' +
    '"minutes"?, "steps"?, "note"?, "exercises"?: [{"name","sets"?,"reps"?,"weightLb"?}]}), "recovery" (array of {"kind": "sleep"|"water"|"caffeine", ' +
    '"value": number} — sleep in hours, water in liters, caffeine in milligrams), "mood" (array of ' +
    '{"score": 1-5, "note"?}), "measurement" (array of {"weightLb"?, "waistIn"?}), ' +
    '"targets" ({"calories": int, "protein": int} or null), ' +
    '"heightIn" (number or null).\n' +
    'HEIGHT: in inches, converting if they give feet and inches — "5\'10" is ' +
    '70. Only when they state it; never guess it from anything else.\n' +
    'TARGETS: set this ONLY when the user explicitly asks to set, change or ' +
    'correct their daily goal — "set my target to 2000 calories and 150g protein", ' +
    '"make my protein goal 160". It overwrites a standing setting, so a passing ' +
    'remark about what they plan to eat today is NOT a target. Both numbers are ' +
    'required; if the user gives only one, return null and the coach will ask.\n' +
    'Already logged today — do not repeat: meals: ' + list(seeds.meals) + '\n' +
    'Already logged today — do not repeat: training: ' + list(seeds.training) + '\n' +
    'Already logged today — do not repeat: recovery: ' + list(seeds.recovery) + '\n' +
    'Message: ' + userText
  );
}

export async function recordHealthFacts(
  userId: string,
  facts: z.infer<typeof factsSchema>,
  sourceText?: string
) {
  for (const meal of facts.meals) {
    // Chat-described meals have no photo; logMealForUser's schema requires a
    // url, so this writes directly with an empty photoUrl.
    await prisma.mealEntry.create({
      data: {
        userId,
        photoUrl: '',
        foodItems: JSON.stringify([meal]),
        totalCalories: meal.calories,
        totalProtein: meal.protein,
        totalFat: meal.fat,
        confirmed: true,
        source: 'extracted',
        sourceText: sourceText ?? null,
      },
    });
  }
  for (const t of facts.training) {
    await prisma.trainingEntry.create({
      data: {
        userId,
        kind: t.kind,
        minutes: t.minutes,
        steps: t.steps,
        // Stored as JSON in a column, like MealEntry.foodItems. Null rather
        // than "[]" when nothing was named, so an absent list and an empty one
        // are not the same value.
        exercises:
          t.exercises && t.exercises.length > 0 ? JSON.stringify(t.exercises) : null,
        note: t.note,
        source: 'extracted',
        sourceText: sourceText ?? null,
      },
    });
  }
  for (const r of facts.recovery) {
    await prisma.recoveryEntry.create({
      data: { userId, kind: r.kind, value: r.value, source: 'extracted', sourceText: sourceText ?? null },
    });
  }
  for (const m of facts.mood) {
    await prisma.moodEntry.create({
      data: { userId, score: m.score, note: m.note, source: 'extracted', sourceText: sourceText ?? null },
    });
  }
  for (const m of facts.measurement) {
    if (m.weightLb === undefined && m.waistIn === undefined) continue;
    await prisma.measurement.create({
      data: { userId, weightLb: m.weightLb, waistIn: m.waistIn, source: 'extracted', sourceText: sourceText ?? null },
    });
  }
  if (facts.heightIn) {
    await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, heightIn: facts.heightIn },
      update: { heightIn: facts.heightIn },
    });
  }

  // Last, and upserted rather than appended: unlike everything above, a target
  // replaces a standing setting instead of adding an event.
  if (facts.targets) {
    await setTargetForUser(userId, facts.targets);
  } else {
    // Onboarding's fallback: someone who does not know their targets gives
    // height and weight instead, and gets a starting point. Only when no
    // target exists — this must never quietly overwrite one the user chose.
    await estimateTargetsIfMissing(userId, facts.heightIn ?? null);
  }

  return {
    meals: facts.meals.length,
    training: facts.training.length,
    recovery: facts.recovery.length,
    mood: facts.mood.length,
    measurement: facts.measurement.filter(
      (m) => m.weightLb !== undefined || m.waistIn !== undefined
    ).length,
    targets: facts.targets ? 1 : 0,
  };
}

export function parseHealthFacts(response: string) {
  const start = response.indexOf('{');
  const end = response.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return EMPTY_FACTS;
  }
  try {
    const parsed = JSON.parse(response.slice(start, end + 1));
    discarded = 0;
    const result = factsSchema.safeParse(parsed);
    if (discarded > 0) {
      // Extraction is fail-silent by design, which once hid a bug that threw
      // away whole meal lists. Dropping anything is now on the record.
      console.warn(`extraction: discarded ${discarded} malformed or over-cap item(s)`);
    }
    return result.success ? result.data : EMPTY_FACTS;
  } catch {
    return EMPTY_FACTS;
  }
}

// Extraction must never break or delay a coach reply: the whole body is
// guarded, and a failure resolves to zero counts.
export async function extractHealthFacts(
  userId: string,
  /** What goes to the model — identifiers already stripped. */
  userText: string,
  options: {
    /**
     * What gets stored as the receipt and quoted back on Today. Defaults to
     * `userText`; the chat path passes the user's own words, because a
     * receipts feed showing "[redacted]" as the source of a meal tells the
     * person who typed it nothing.
     */
    sourceText?: string
    onUsage?: UsageReporter
  } = {}
) {
  try {
    const since = startOfToday(new Date(), await zoneFor(userId));
    const [meals, training, recovery] = await Promise.all([
      prisma.mealEntry.findMany({ where: { userId, loggedAt: { gte: since } } }),
      prisma.trainingEntry.findMany({ where: { userId, loggedAt: { gte: since } } }),
      prisma.recoveryEntry.findMany({ where: { userId, loggedAt: { gte: since } } }),
    ]);
    const mealNames = meals.flatMap((m) => {
      try {
        const items = JSON.parse(m.foodItems);
        return Array.isArray(items) ? items.map((i) => String(i.name)) : [];
      } catch {
        return [];
      }
    });
    const seeds = {
      meals: mealNames,
      training: training.map((t) => t.kind),
      recovery: recovery.map((r) => r.kind),
    };
    const facts = parseHealthFacts(
      await generate(buildExtractionPrompt(seeds, userText), options.onUsage)
    );
    return await recordHealthFacts(userId, facts, (options.sourceText ?? userText).slice(0, 200));
  } catch {
    return { meals: 0, training: 0, recovery: 0, mood: 0, measurement: 0 };
  }
}

/**
 * Sets a starting target from height and weight, for a user who has neither.
 *
 * Height may have arrived in this message or in an earlier one, and weight may
 * have come from any measurement the user has ever given — someone answering
 * "5'10" to a coach that already knows their weight should not have to repeat
 * it.
 *
 * Silent when anything is missing: the coach asks again rather than the app
 * inventing a number.
 */
async function estimateTargetsIfMissing(userId: string, heightFromThisMessage: number | null) {
  if (await getTargetForUser(userId)) return;

  const [profile, measurement] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.measurement.findFirst({
      where: { userId, weightLb: { not: null } },
      orderBy: { measuredAt: 'desc' },
    }),
  ]);

  const heightIn = heightFromThisMessage ?? profile?.heightIn ?? null;
  const weightLb = measurement?.weightLb ?? null;
  if (!heightIn || !weightLb) return;

  await setTargetForUser(userId, estimateTargets({ heightIn, weightLb }));
}
