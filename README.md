# 💪 AI Telegram Fitness Bot

A Telegram bot that turns a topic into a ready-to-publish post. Send it a topic and it
researches fresh facts, writes a caption in a consistent fitness-channel voice, and attaches
a matching cover photo.

Under the hood it's a small system of sub-agents driven by an orchestrator:

| Agent | File | Pattern |
|-------|------|---------|
| Orchestrator | `src/orchestrator.ts` | Orchestrator / Router |
| Topic moderator | `src/agents/moderator.ts` | Moderation / Guardrails |
| Researcher | `src/agents/researcher.ts` | Research + Tool Calling (Google Search grounding) |
| Copywriter | `src/agents/copywriter.ts` | Copywriter + Memory (edits) |
| Cover artist | `src/agents/coverArtist.ts` | Ready-made stock photo (Pexels) |
| Judge | `src/agents/judge.ts` | Self-check |
| Post limit | `src/redis.ts` | Rate limiting (Upstash Redis) |

**Stack:** Node.js + TypeScript, Vercel (serverless webhook), Gemini API, Pexels, Upstash Redis.

---

## Features

- Accepts a topic in a private chat and returns a finished post (text + cover photo).
- Live web research via Gemini + Google Search grounding (falls back to the model's own
  knowledge if the search quota is unavailable).
- Post structure: hook → body with value → call to action → 3–5 hashtags.
- Understands edits ("shorter", "add an example", "make it simpler") and rewrites the last post.
- Moderates the incoming topic before generating.
- Self-check with a Judge agent, with one automatic rewrite if the post falls short.
- Free-tier limit of 2 posts per user via Upstash Redis, then a polite upgrade message.

---

## 1. Get your keys

- `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather) (`/newbot`).
- `TELEGRAM_WEBHOOK_SECRET` — any random string you make up.
- `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/apikey).
- `PEXELS_API_KEY` — [Pexels API](https://www.pexels.com/api/).
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — Upstash (easiest via the Vercel
  Marketplace: Storage → Upstash for Redis; the variables are added automatically).

All variables are listed in [`.env.example`](.env.example).

---

## 2. Deploy to Vercel

1. Push the project to GitHub and import it in Vercel, **or** install the CLI: `npm i -g vercel`.
2. Add all variables from `.env.example` to the Vercel project
   (**Settings → Environment Variables**) for the **Production** environment.
3. Deploy:

   ```bash
   vercel --prod
   ```

   The webhook will be available at:
   `https://<your-project>.vercel.app/api/telegram`

> Open that URL in a browser to check it's live — it responds with
> `AI Telegram fitness bot is running.`

---

## 3. Register the webhook

Run once (replace the token, domain and secret):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-project>.vercel.app/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Check the webhook status:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Remove the webhook if needed:

```bash
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

---

## 4. Use it in Telegram

1. Open your bot and send `/start`.
2. Send a topic, e.g. `how to start running from scratch`.
   → the bot streams status updates and returns a finished post with a cover photo.
3. Send an edit: `shorter` or `add an example` → the bot rewrites the post.
4. Generate more posts: the limit kicks in on the 3rd post (`FREE_POST_LIMIT=2`).
5. Send an obviously unsafe topic → the moderator politely declines.

---

## Local build check (without running the bot)

```bash
npm install
npm run typecheck
```

---

## How it works (flow)

```
Message → webhook (ack 200, then background via waitUntil)
  → classify: new topic or edit?
  New topic:
    limit (Redis) → moderation → research (grounding) → copywriter
      → judge (one retry on failure) → cover (Pexels) → +1 to counter
      → save to memory → send the post
  Edit:
    take the post from memory → rewrite → (new cover if the photo subject changed)
      → update memory → send (does not consume the limit)
```

---

## Configuration

- **Channel voice / style rules** live in `src/config.ts` (`CHANNEL_STYLE`). Edit them to
  change tone, length, emojis, structure and forbidden topics — or to switch niches.
- **Gemini model** is set via `GEMINI_MODEL` (default `gemini-flash-latest`). The wrapper
  automatically falls back across current models and retries on temporary overload.
- **Free limit** is set via `FREE_POST_LIMIT` (default `2`).
