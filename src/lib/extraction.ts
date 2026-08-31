import { z } from 'zod';
import { prisma } from '@/lib/db';

// Round rather than reject fractional model estimates (same policy as analyzeMeal).
const roundedInt = z.number().nonnegative().transform(Math.round);

const factsSchema = z.object({
  meals: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        portion: z.string().trim().min(1),
        calories: roundedInt,
        protein: roundedInt,
      })
    )
    .max(3)
    .catch([]),
  training: z
    .array(
      z.object({
        kind: z.enum(['resistance', 'hiit', 'core', 'neat']),
        minutes: z.number().int().nonnegative().optional(),
        steps: z.number().int().nonnegative().optional(),
        note: z.string().optional(),
      })
    )
    .max(3)
    .catch([]),
  recovery: z
    .array(
      z.object({
        kind: z.enum(['sleep', 'water', 'alcohol']),
        value: z.number().nonnegative(),
      })
    )
    .max(3)
    .catch([]),
  mood: z
    .array(
      z.object({
        score: z.number().int().min(1).max(5),
        note: z.string().optional(),
      })
    )
    .max(3)
    .catch([]),
  measurement: z
    .array(
      z.object({
        weightLb: z.number().nonnegative().optional(),
        waistIn: z.number().nonnegative().optional(),
      })
    )
    .max(3)
    .catch([]),
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
    'Extract ONLY facts the user EXPLICITLY stated in the message ' +
    '(never infer, never invent; empty arrays when nothing qualifies; at most 3 items per key).\n' +
    'Return ONLY a JSON object with keys: "meals" (array of {"name","portion","calories","protein"} ' +
    'with integer calories/protein), "training" (array of {"kind": "resistance"|"hiit"|"core"|"neat", ' +
    '"minutes"?, "steps"?, "note"?}), "recovery" (array of {"kind": "sleep"|"water"|"alcohol", ' +
    '"value": number} — sleep in hours, water in liters, alcohol in drinks), "mood" (array of ' +
    '{"score": 1-5, "note"?}), "measurement" (array of {"weightLb"?, "waistIn"?}).\n' +
    'Already logged today — do not repeat: meals: ' + list(seeds.meals) + '\n' +
    'Already logged today — do not repeat: training: ' + list(seeds.training) + '\n' +
    'Already logged today — do not repeat: recovery: ' + list(seeds.recovery) + '\n' +
    'Message: ' + userText
  );
}

export async function recordHealthFacts(
  userId: string,
  facts: z.infer<typeof factsSchema>
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
      },
    });
  }
  for (const r of facts.recovery) {
    await prisma.recoveryEntry.create({
      data: { userId, kind: r.kind, value: r.value, source: 'extracted' },
    });
  }
  for (const m of facts.mood) {
    await prisma.moodEntry.create({
      data: { userId, score: m.score, note: m.note, source: 'extracted' },
    });
  }
  for (const m of facts.measurement) {
    if (m.weightLb === undefined && m.waistIn === undefined) continue;
    await prisma.measurement.create({
      data: { userId, weightLb: m.weightLb, waistIn: m.waistIn, source: 'extracted' },
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
    const result = factsSchema.safeParse(parsed);
    return result.success ? result.data : EMPTY_FACTS;
  } catch {
    return EMPTY_FACTS;
  }
}
