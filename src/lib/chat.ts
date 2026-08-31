import { prisma } from "@/lib/db";
import { generate } from "@/lib/llm";
import { z } from "zod";

export async function coachReply(userId: string, userText: string): Promise<{ assistantReply: string }> {
  const validation = z.string().trim().min(1).safeParse(userText);
  if (!validation.success) {
    throw new Error("Message cannot be empty");
  }

  const cleanText = validation.data;

  const history = await prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const historyLines = history
    .reverse()
    .map((m) => `${m.role}: ${m.content}`);

  const prompt = [
    "You are a friendly daily nutrition and fitness coach...",
    ...historyLines,
    `user: ${cleanText}`,
  ].join("\n");

  const reply = await generate(prompt);

  await Promise.all([
    prisma.chatMessage.create({
      data: { userId, role: "user", content: cleanText },
    }),
    prisma.chatMessage.create({
      data: { userId, role: "assistant", content: reply },
    }),
  ]);

  return { assistantReply: reply };
}