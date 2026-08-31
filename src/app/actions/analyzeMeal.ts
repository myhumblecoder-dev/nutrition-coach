'use server';

import { analyzePhoto } from '@/lib/llm';
import { z } from 'zod';

const mealSchema = z.object({
  foodItems: z.array(
    z.object({
      name: z.string().trim().min(1),
      portion: z.string().trim().min(1),
      calories: z.number().int().nonnegative(),
      protein: z.number().int().nonnegative(),
    })
  ),
  totalCalories: z.number().int().nonnegative(),
  totalProtein: z.number().int().nonnegative(),
});

export async function analyzeMeal(photoUrl: string) {
  const systemPrompt = `Return ONLY valid JSON with no prose, in the exact shape: {
  "foodItems": [
    {
      "name": string,
      "portion": string,
      "calories": number,
      "protein": number
    }
  ],
  "totalCalories": number,
  "totalProtein": number
}`;

  const response = await analyzePhoto(photoUrl, systemPrompt);

  let parsed;
  try {
    parsed = JSON.parse(response);
  } catch (err) {
    throw new Error('Vision API returned invalid JSON structure');
  }

  try {
    return mealSchema.parse(parsed);
  } catch (err) {
    throw new Error('Vision API returned invalid JSON structure');
  }
}