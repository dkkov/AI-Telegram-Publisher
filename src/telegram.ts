// Thin wrapper over the Telegram Bot API. Outgoing calls on behalf of the bot only.
import { requireEnv } from './config.js';

const API_BASE = 'https://api.telegram.org';

function botUrl(method: string): string {
  const token = requireEnv('TELEGRAM_BOT_TOKEN');
  return `${API_BASE}/bot${token}/${method}`;
}

async function call(method: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(botUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Log it, but don't crash the whole flow over one undelivered message.
    console.error(`Telegram ${method} failed: ${res.status} ${detail}`);
  }
}

/** Send a text message. */
export function sendMessage(chatId: number, text: string): Promise<void> {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

/** Send a photo with a caption (caption is limited to 1024 characters). */
export function sendPhoto(chatId: number, photoUrl: string, caption: string): Promise<void> {
  return call('sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    caption: caption.slice(0, 1024),
    parse_mode: 'HTML',
  });
}

/** Show the "typing…" indicator. */
export function sendChatAction(chatId: number, action: 'typing' | 'upload_photo'): Promise<void> {
  return call('sendChatAction', { chat_id: chatId, action });
}
