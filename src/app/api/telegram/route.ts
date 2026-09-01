import { sendTelegramMessage, getTelegramFileUrl, answerCallbackQuery } from '@/lib/telegram';
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

    // Button taps on a pending meal's Log it / Discard keyboard.
    const cb = update?.callback_query;
    if (cb) {
      const cbChatId = String(cb.message?.chat?.id ?? '');
      const data = typeof cb.data === 'string' ? cb.data : '';
      const match = data.match(/^meal:(confirm|discard):(.+)$/);
      if (cbChatId !== process.env.TELEGRAM_CHAT_ID || !match) {
        return Response.json({ ok: true, ignored: true });
      }
      const [, action, mealId] = match;
      if (action === 'confirm') {
        await prisma.mealEntry.updateMany({
          where: { id: mealId, confirmed: false },
          data: { confirmed: true },
        });
        await answerCallbackQuery(cb.id);
        await sendTelegramMessage(cbChatId, 'Logged ✓');
      } else {
        await prisma.mealEntry.deleteMany({ where: { id: mealId, confirmed: false } });
        await answerCallbackQuery(cb.id);
        await sendTelegramMessage(cbChatId, 'Discarded — tell me or resend the photo if you want it logged differently.');
      }
      return Response.json({ ok: true });
    }

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

        const body = await res.text().catch(() => '');

        console.error('photo download failed', res.status, body.slice(0, 200));

        throw new Error('Failed to download photo: HTTP ' + res.status);

      }

      const blob = await put('telegram-meal.jpg', await res.blob(), {
        access: 'public',
        addRandomSuffix: true,
      });

      // The caption is ground truth for WHAT the food is; the photo judges portions.
      const caption =
        typeof message.caption === 'string' && message.caption.trim().length > 0
          ? message.caption.trim()
          : undefined;

      let analysis;
      try {
        analysis = await analyzeMeal(blob.url, caption);
      } catch (err) {
        console.error(err);
        await sendTelegramMessage(chatId, "I couldn't read that as a meal photo — try a clearer, closer shot of the food.");
        return Response.json({ ok: false }, { status: 200 });
      }

      // Pending until the user taps Log it — excluded from totals meanwhile.
      const { id: mealId } = await logMealForUser(
        user.id,
        {
          photoUrl: blob.url,
          foodItems: analysis.foodItems,
          totalCalories: analysis.totalCalories,
          totalProtein: analysis.totalProtein,
        },
        caption,
        false
      );

      const foodList = analysis.foodItems.map((i: { name: string }) => i.name).join(', ');
      await sendTelegramMessage(
        chatId,
        `I see: ${foodList} — ~${analysis.totalCalories} cal, ${analysis.totalProtein}g protein. Log it?`,
        {
          inline_keyboard: [
            [
              { text: '✓ Log it', callback_data: `meal:confirm:${mealId}` },
              { text: '✕ Discard', callback_data: `meal:discard:${mealId}` },
            ],
          ],
        }
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