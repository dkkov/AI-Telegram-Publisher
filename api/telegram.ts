// Webhook Telegram: точка входа serverless-функции на Vercel.
// Отвечает 200 сразу, а тяжёлую обработку продолжает в фоне через waitUntil.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { handleMessage } from '../src/orchestrator.js';
import type { TelegramUpdate } from '../src/types.js';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  // Простой GET для проверки, что функция жива (браузером).
  if (req.method !== 'POST') {
    res.status(200).send('AI Telegram fitness bot is running.');
    return;
  }

  // Проверка секретного токена вебхука (защита от чужих запросов).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    res.status(401).send('unauthorized');
    return;
  }

  const update = req.body as TelegramUpdate | undefined;

  // Регистрируем фоновую обработку ДО ответа, затем сразу отвечаем Telegram 200.
  if (update?.message) {
    waitUntil(handleMessage(update.message));
  }
  res.status(200).json({ ok: true });
}
