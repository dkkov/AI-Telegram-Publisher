// Telegram webhook: entry point of the Vercel serverless function.
// Replies 200 immediately and continues heavy work in the background via waitUntil.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { handleMessage } from '../src/orchestrator.js';
import type { TelegramUpdate } from '../src/types.js';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  // Simple GET to check the function is alive (from a browser).
  if (req.method !== 'POST') {
    res.status(200).send('AI Telegram fitness bot is running.');
    return;
  }

  // Verify the webhook secret token (protects against foreign requests).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    res.status(401).send('unauthorized');
    return;
  }

  const update = req.body as TelegramUpdate | undefined;

  // Register the background work BEFORE responding, then reply 200 to Telegram immediately.
  if (update?.message) {
    waitUntil(handleMessage(update.message));
  }
  res.status(200).json({ ok: true });
}
