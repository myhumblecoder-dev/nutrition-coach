async function getBotToken(): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('Telegram not configured');
  }
  return token;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = await getBotToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!res.ok) {
    throw new Error('Telegram send failed: ' + res.statusText);
  }
}

export async function getTelegramFileUrl(fileId: string): Promise<string> {
  const token = await getBotToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);

  if (!res.ok) {
    throw new Error('Telegram getFile failed');
  }

  const data = await res.json();

  if (!data.ok || !data.result?.file_path) {
    throw new Error('Telegram getFile failed');
  }

  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}