import { sendTelegramMessage, getTelegramFileUrl, answerCallbackQuery } from '@/lib/telegram';
import { logMealForUser } from '@/lib/meals';

export const maxDuration = 60;
import { coachReply } from '@/lib/chat';
import { analyzeMeal } from '@/lib/analyzeMeal';
import { UsageLimitError } from '@/lib/limits';
import { consumeLinkToken, resolveUserByChat, disconnectUser } from '@/lib/telegramLink';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/db';

const APP_URL = process.env.APP_URL ?? 'https://nutrition-coach-omega.vercel.app';

const CONNECT_NUDGE =
  `This chat isn't linked to an account yet. Sign in at ${APP_URL}/settings and tap Connect Telegram to get your personal link.`;

function ok(extra?: Record<string, unknown>) {
  return Response.json({ ok: true, ...extra });
}

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
      const chat = cb.message?.chat;
      const cbChatId = String(chat?.id ?? '');
      const data = typeof cb.data === 'string' ? cb.data : '';
      const match = data.match(/^meal:(confirm|discard):(.+)$/);
      // Private chats only, and the tapper must BE the chat: in a group the
      // chat id identifies the room, not the person pressing the button.
      const tapperIsChat = String(cb.from?.id ?? '') === cbChatId;
      if (chat?.type !== 'private' || !tapperIsChat || !match) {
        await answerCallbackQuery(cb.id);
        return ok({ ignored: true });
      }
      const user = await resolveUserByChat(cbChatId);
      if (!user) {
        await answerCallbackQuery(cb.id);
        return ok({ ignored: true });
      }
      const [, action, mealId] = match;
      // Scoped by userId: callback_data is client-supplied and forgeable.
      const where = { id: mealId, userId: user.id, confirmed: false };
      const { count } =
        action === 'confirm'
          ? await prisma.mealEntry.updateMany({ where, data: { confirmed: true } })
          : await prisma.mealEntry.deleteMany({ where });
      await answerCallbackQuery(cb.id);
      if (count === 0) {
        await sendTelegramMessage(cbChatId, "That meal's no longer pending.");
      } else if (action === 'confirm') {
        await sendTelegramMessage(cbChatId, 'Logged ✓');
      } else {
        await sendTelegramMessage(cbChatId, 'Discarded — tell me or resend the photo if you want it logged differently.');
      }
      return ok();
    }

    const message = update?.message;

    // Groups break the chat-equals-identity model; the bot is private-only.
    if (!message || message.chat?.type !== 'private') {
      return ok({ ignored: true });
    }

    const chatId = String(message.chat.id);
    const text = typeof message.text === 'string' ? message.text : undefined;

    // Commands are handled statically, before any user resolution or LLM.
    if (text && /^\/start(\s|$)/.test(text)) {
      const payload = text.slice('/start'.length).trim();
      if (payload) {
        const user = await consumeLinkToken(payload, chatId);
        if (user) {
          await sendTelegramMessage(
            chatId,
            `Connected to the account for ${user.email ?? 'your account'} — not you? Send /disconnect.\n\nI'm your nutrition coach: tell me what you eat, how you train, and how you sleep.`
          );
        } else {
          await sendTelegramMessage(chatId, "That link expired — get a fresh one from the app's Settings page.");
        }
        return ok();
      }
      const user = await resolveUserByChat(chatId);
      await sendTelegramMessage(
        chatId,
        user
          ? "You're connected. Tell me what you eat, how you train, and how you sleep — or send a meal photo."
          : CONNECT_NUDGE
      );
      return ok();
    }

    if (text === '/disconnect') {
      const user = await resolveUserByChat(chatId);
      if (user) {
        await disconnectUser(user.id);
        await sendTelegramMessage(chatId, 'Disconnected — this chat is no longer linked.');
      } else {
        await sendTelegramMessage(chatId, CONNECT_NUDGE);
      }
      return ok();
    }

    const user = await resolveUserByChat(chatId);
    if (!user) {
      // Static nudge for text only; anything else from a stranger is dropped.
      // Never coachReply here — the bot is publicly discoverable.
      if (text) {
        await sendTelegramMessage(chatId, CONNECT_NUDGE);
        return ok();
      }
      return ok({ ignored: true });
    }

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
        analysis = await analyzeMeal(user.id, blob.url, caption);
      } catch (err) {
        console.error(err);
        // A cap is not a bad photo. Telling someone to take a clearer shot
        // when the real answer is "that's enough for today" sends them round
        // a loop retaking a picture that was fine.
        await sendTelegramMessage(
          chatId,
          err instanceof UsageLimitError
            ? err.userMessage
            : "I couldn't read that as a meal photo — try a clearer, closer shot of the food."
        );
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

      return ok();
    }

    // TEXT branch
    if (text && text.length > 0) {
      const { assistantReply } = await coachReply(user.id, text);
      await sendTelegramMessage(chatId, assistantReply);
      return ok();
    }

    return ok({ ignored: true });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false }, { status: 200 });
  }
}
