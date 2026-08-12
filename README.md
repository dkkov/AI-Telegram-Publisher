# 💪 AI Telegram Fitness Bot

Telegram-бот, которому пишешь тему — а он сам ресёрчит её живым поиском и присылает
готовый пост (текст + фото-обложка) в фирменном стиле фитнес-канала.

Внутри — система суб-агентов под управлением оркестратора:

| Агент | Файл | Паттерн |
|-------|------|---------|
| Оркестратор | `src/orchestrator.ts` | Orchestrator / Router |
| Модератор темы | `src/agents/moderator.ts` | Moderation / Guardrails |
| Ресёрчер | `src/agents/researcher.ts` | Research + Tool Calling (Google Search grounding) |
| Копирайтер | `src/agents/copywriter.ts` | Copywriter + Memory (правки) |
| Художник обложки | `src/agents/coverArtist.ts` | Готовое фото со стока (Pexels) |
| Judge | `src/agents/judge.ts` | Self-check |
| Лимит постов | `src/redis.ts` | Rate limiting (Upstash Redis) |

**Стек:** Node.js + TypeScript, Vercel (serverless webhook), Gemini API, Pexels, Upstash Redis.

---

## ⚠️ Разделение ролей

- **Ассистент (Claude/AI):** только пишет код и деплоит.
- **Ты сам:** заливаешь переменные окружения, регистрируешь webhook и проводишь **все**
  тесты в Telegram. Ассистент бота не запускает и Telegram API не дёргает.

---

## 1. Ключи (у тебя уже есть)

- `TELEGRAM_BOT_TOKEN` — от [@BotFather](https://t.me/BotFather) (`/newbot`).
- `TELEGRAM_WEBHOOK_SECRET` — придумай сам любую случайную строку.
- `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/apikey).
- `PEXELS_API_KEY` — [Pexels API](https://www.pexels.com/api/).
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — Upstash (удобно поставить через
  Vercel Marketplace: Storage → Upstash for Redis; переменные подставятся автоматически).

Список всех переменных — в [`.env.example`](.env.example).

---

## 2. Деплой на Vercel

1. Залей проект в Git (GitHub) и импортируй в Vercel, **или** поставь CLI: `npm i -g vercel`.
2. Добавь все переменные окружения из `.env.example` в проект Vercel
   (**Settings → Environment Variables**), для окружения **Production**.
3. Задеплой:

   ```bash
   vercel --prod
   ```

   После деплоя вебхук будет доступен по адресу:
   `https://<твой-проект>.vercel.app/api/telegram`

> Проверить, что функция жива, можно открыв этот URL в браузере — она ответит
> `AI Telegram fitness bot is running.`

---

## 3. Регистрация webhook (делаешь ты)

Одной командой (подставь свой токен, домен и секрет):

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://<твой-проект>.vercel.app/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Проверить статус вебхука:

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/getWebhookInfo"
```

Удалить вебхук (если понадобится):

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/deleteWebhook"
```

---

## 4. Тест в Telegram (делаешь ты)

1. Открой своего бота, напиши `/start`.
2. Пришли тему, например: `как начать бегать с нуля`.
   → бот пришлёт статусы и готовый пост с обложкой.
3. Пришли правку: `короче` или `добавь пример` → бот перепишет пост.
4. Сгенерируй ещё посты: на 3-м новом посте сработает лимит (`FREE_POST_LIMIT=2`).
5. Пришли заведомо запретную тему → модератор вежливо откажет.

---

## Локальная проверка сборки (без запуска бота)

```bash
npm install
npm run typecheck
```

---

## Как это работает (поток)

```
Сообщение → webhook (ack 200, дальше в фоне через waitUntil)
  → классификация: новая тема или правка?
  Новая тема:
    лимит (Redis) → модерация → ресёрч (grounding) → копирайтер
      → judge (при провале 1 повтор) → обложка (Pexels) → +1 к счётчику
      → сохранить в память → отправить пост
  Правка:
    взять пост из памяти → переписать → (при смене темы фото — новая обложка)
      → обновить память → отправить (лимит не тратится)
```
