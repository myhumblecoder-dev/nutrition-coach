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

/**
 * The two ends of a pending meal, shared by every surface that creates one.
 *
 * A photo-logged meal is written with `confirmed: false` and stays out of
 * every total until the user says yes — see the `confirmed: true` filters in
 * `dashboard.ts`. Confirming and discarding used to live inline in the
 * Telegram webhook; they are here because iOS needs exactly the same two
 * operations, and a second copy would be a second chance to forget the
 * `userId` scope.
 */
type MealTotals = { totalCalories?: number; totalProtein?: number }

// The meal id always arrives from a client — a Telegram `callback_data`
// string or an iOS request path — so it is never the only thing scoping the
// write. `confirmed: false` is part of the filter rather than a precondition
// check: it makes a double tap a no-op instead of a second write, and stops a
// confirmed meal being deleted by a stale Discard button.
const pendingScope = (userId: string, mealId: string) =>
  ({ id: mealId, userId, confirmed: false })

/** Returns false when there was no pending meal to confirm. */
export async function confirmPendingMeal(
  userId: string,
  mealId: string,
  overrides?: MealTotals,
): Promise<boolean> {
  const data: { confirmed: true } & MealTotals = { confirmed: true };
  // Assigned conditionally rather than spread: Prisma reads a key holding
  // undefined as "leave alone", so both shapes work today, but only this one
  // keeps the written data equal to what the caller actually asked for.
  if (overrides?.totalCalories !== undefined) data.totalCalories = overrides.totalCalories;
  if (overrides?.totalProtein !== undefined) data.totalProtein = overrides.totalProtein;

  const { count } = await prisma.mealEntry.updateMany({
    where: pendingScope(userId, mealId),
    data,
  });

  return count > 0;
}

/** Returns false when there was no pending meal to discard. */
export async function discardPendingMeal(userId: string, mealId: string): Promise<boolean> {
  const { count } = await prisma.mealEntry.deleteMany({
    where: pendingScope(userId, mealId),
  });

  return count > 0;
}
