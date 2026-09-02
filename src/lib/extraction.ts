import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generate } from '@/lib/llm';
import { startOfToday } from '@/lib/time';

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
    }),
    8
  ),
  training: lenientArray(
    z.object({
      kind: z.enum(['resistance', 'hiit', 'core', 'neat']),
      minutes: z.number().int().nonnegative().optional(),
      steps: z.number().int().nonnegative().optional(),
      note: z.string().optional(),
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
    'EVERYTHING ELSE (training, mood, measurement, and the sleep and water recovery kinds): ONLY facts the ' +
    'user EXPLICITLY stated — never infer, never invent.\n' +
    'Return ONLY a JSON object with keys: "meals" (array of {"name","portion","calories","protein"} ' +
    'with integer calories/protein), "training" (array of {"kind": "resistance"|"hiit"|"core"|"neat", ' +
    '"minutes"?, "steps"?, "note"?}), "recovery" (array of {"kind": "sleep"|"water"|"caffeine", ' +
    '"value": number} — sleep in hours, water in liters, caffeine in milligrams), "mood" (array of ' +
    '{"score": 1-5, "note"?}), "measurement" (array of {"weightLb"?, "waistIn"?}).\n' +
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
  return {
    meals: facts.meals.length,
    training: facts.training.length,
    recovery: facts.recovery.length,
    mood: facts.mood.length,
    measurement: facts.measurement.filter(
      (m) => m.weightLb !== undefined || m.waistIn !== undefined
    ).length,
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
export async function extractHealthFacts(userId: string, userText: string) {
  try {
    const since = startOfToday(new Date());
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
    const facts = parseHealthFacts(await generate(buildExtractionPrompt(seeds, userText)));
    return await recordHealthFacts(userId, facts, userText.slice(0, 200));
  } catch {
    return { meals: 0, training: 0, recovery: 0, mood: 0, measurement: 0 };
  }
}
