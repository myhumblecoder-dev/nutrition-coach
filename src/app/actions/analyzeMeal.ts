'use server';

import { analyzePhoto } from '@/lib/llm';
import { z } from 'zod';

// Vision models return fractional estimates despite integer instructions;
// round rather than reject.
const roundedInt = z.number().nonnegative().transform(Math.round);

const mealSchema = z.object({
  foodItems: z.array(
    z.object({
      name: z.string().trim().min(1),
      portion: z.string().trim().min(1),
      calories: roundedInt,
      protein: roundedInt,
    })
  ),
  totalCalories: roundedInt,
  totalProtein: roundedInt,
});

// Models often wrap JSON in markdown fences or preamble despite "no prose";
// extract the outermost object before parsing.
function extractJson(response: string): string {
  const start = response.indexOf('{');
  const end = response.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return response;
  }
  return response.slice(start, end + 1);
}

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
    parsed = JSON.parse(extractJson(response));
  } catch (err) {
    throw new Error('Vision API returned invalid JSON structure');
  }

  try {
    return mealSchema.parse(parsed);
  } catch (err) {
    throw new Error('Vision API returned invalid JSON structure');
  }
}