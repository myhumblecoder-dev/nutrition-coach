import { prisma } from "@/lib/db";
import { z } from "zod";

const foodItemSchema = z.object({
  name: z.string().trim().min(1),
  portion: z.string().trim().min(1),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
});

const saveMealEntrySchema = z.object({
  photoUrl: z.string().url(),
  foodItems: z.array(foodItemSchema).min(1),
  totalCalories: z.number().nonnegative(),
  totalProtein: z.number().nonnegative(),
});

export async function logMealForUser(userId: string, input: z.infer<typeof saveMealEntrySchema>, sourceText?: string, confirmed: boolean = true) {
  let parsed;
  try {
    parsed = saveMealEntrySchema.parse(input);
  } catch (err) {
    throw new Error("Invalid meal entry data");
  }

  const created = await prisma.mealEntry.create({
    data: {
      userId,
      photoUrl: parsed.photoUrl,
      foodItems: JSON.stringify(parsed.foodItems),
      totalCalories: parsed.totalCalories,
      totalProtein: parsed.totalProtein,
      confirmed,
      sourceText: sourceText ?? null,
      loggedAt: new Date(),
    },
  });

  return { id: created.id };
}