import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { generate } from '@/lib/llm';
import { z } from 'zod';

export async function sendChatMessage(userText: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  let parsed: string;
  try {
    parsed = z.string().trim().min(1).parse(userText);
  } catch (err) {
    throw new Error('Message cannot be empty');
  }

  const history = await prisma.chatMessage.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const chronologicalHistory = history.reverse();
  const historyString = chronologicalHistory
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join('\n');

  const prompt = `You are a friendly daily nutrition and fitness coach. Here is the recent conversation:\n${
    historyString ? historyString + '\n' : ''
  }user: ${parsed}\nAssistant:`;

  const reply = await generate(prompt);

  await Promise.all([
    prisma.chatMessage.create({
      data: { userId: session.user.id, role: 'user', content: parsed },
    }),
    prisma.chatMessage.create({
      data: { userId: session.user.id, role: 'assistant', content: reply },
    }),
  ]);

  return { assistantReply: reply };
}