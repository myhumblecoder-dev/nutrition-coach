import { sendTelegramMessage, getTelegramFileUrl } from '@/lib/telegram';
import { logMealForUser } from '@/lib/meals';

export const maxDuration = 60;
import { coachReply } from '@/lib/chat';
import { analyzeMeal } from '@/app/actions/analyzeMeal';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const requestSecret = request.headers.get('x-telegram-bot-api-secret-token');

  if (!webhookSecret || requestSecret !== webhookSecret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const update = await request.json();
    const message = update?.message;

    if (!message || String(message.chat?.id) !== process.env.TELEGRAM_CHAT_ID) {
      return Response.json({ ok: true, ignored: true });
    }

    const user = await prisma.user.findFirst();
    if (!user) {
      return Response.json({ ok: true, ignored: true });
    }

    const chatId = String(message.chat.id);

    // PHOTO branch
    if (message.photo && message.photo.length > 0) {
      const fileId = message.photo[message.photo.length - 1].file_id;
      const fileUrl = await getTelegramFileUrl(fileId);
      
      const res = await fetch(fileUrl);
      if (!res.ok) {
        throw new Error('Failed to download photo');
      }

      const blob = await put('telegram-meal.jpg', await res.blob(), {
        access: 'public',
        addRandomSuffix: true,
      });

      let analysis;
      try {
        analysis = await analyzeMeal(blob.url);
      } catch (err) {
        console.error(err);
        await sendTelegramMessage(chatId, "I couldn't read that as a meal photo — try a clearer, closer shot of the food.");
        return Response.json({ ok: false }, { status: 200 });
      }

      await logMealForUser(user.id, {
        photoUrl: blob.url,
        foodItems: analysis.foodItems,
        totalCalories: analysis.totalCalories,
        totalProtein: analysis.totalProtein,
      });

      const foodList = analysis.foodItems.map((i: { name: string }) => i.name).join(', ');
      await sendTelegramMessage(
        chatId,
        `Logged: ${foodList} — ${analysis.totalCalories} cal, ${analysis.totalProtein}g protein.`
      );

      return Response.json({ ok: true });
    }

    // TEXT branch
    if (typeof message.text === 'string' && message.text.length > 0) {
      const { assistantReply } = await coachReply(user.id, message.text);
      await sendTelegramMessage(chatId, assistantReply);
      return Response.json({ ok: true });
    }

    return Response.json({ ok: true, ignored: true });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false }, { status: 200 });
  }
}