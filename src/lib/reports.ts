import { z } from 'zod'
import { prisma } from '@/lib/db'

// Reporting a coach reply. Guideline 1.2 expects a way to flag generated
// content; more usefully, it is how anyone finds out the model said something
// it should not have.

export const reportSchema = z.object({
  // The text is carried in the request rather than looked up by id: the reply
  // may have been generated moments ago, and what the user saw is what should
  // be recorded, not what the row says later.
  content: z.string().trim().min(1).max(4000),
  messageId: z.string().trim().max(64).optional(),
  reason: z.string().trim().max(500).optional(),
})

export type ReportInput = z.infer<typeof reportSchema>

export async function recordReport(userId: string, input: ReportInput) {
  const parsed = reportSchema.parse(input)

  const report = await prisma.contentReport.create({
    data: {
      userId,
      content: parsed.content,
      messageId: parsed.messageId ?? null,
      reason: parsed.reason ?? null,
    },
  })

  // Logged so a report is visible without anyone querying the table. A
  // reported reply is rare and worth a human reading; silently filing it where
  // nobody looks would make the feature a formality.
  console.warn(`content report ${report.id} from user ${userId}`)

  return report
}
