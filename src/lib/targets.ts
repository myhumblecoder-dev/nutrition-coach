import { z } from 'zod'
import { prisma } from '@/lib/db'

// The daily calorie and protein targets, shared by the web form, the native
// client and the coach. Following the pattern in src/lib/dashboard.ts: the
// server action supplies the session, the route handler supplies a bearer, and
// both call the same write.

// Bounds, not just positivity: a target of 5 kcal or 90,000 kcal is a typo or a
// misread by the extractor, and storing it would put a nonsense denominator
// under every ring on Today.
export const targetSchema = z.object({
  calories: z.number().int().min(500).max(10000),
  protein: z.number().int().min(20).max(500),
})

export type DailyTargetInput = z.infer<typeof targetSchema>

export async function setTargetForUser(userId: string, input: DailyTargetInput) {
  const parsed = targetSchema.parse(input)

  return prisma.dailyTarget.upsert({
    where: { userId },
    create: { userId, calories: parsed.calories, protein: parsed.protein },
    update: { calories: parsed.calories, protein: parsed.protein },
  })
}

export async function getTargetForUser(userId: string) {
  const target = await prisma.dailyTarget.findUnique({ where: { userId } })
  return target ? { calories: target.calories, protein: target.protein } : null
}
