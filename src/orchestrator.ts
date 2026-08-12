// Оркестратор (Orchestrator / Router): гоняет цепочку суб-агентов и шлёт пользователю статусы.
import { sendMessage, sendPhoto, sendChatAction } from './telegram.js';
import { getPostCount, incrementPostCount, getMemory, saveMemory } from './redis.js';
import { FREE_POST_LIMIT, WELCOME_MESSAGE, LIMIT_MESSAGE } from './config.js';
import { moderateTopic } from './agents/moderator.js';
import { research } from './agents/researcher.js';
import { writePost, improvePost, revisePost } from './agents/copywriter.js';
import { findCover } from './agents/coverArtist.js';
import { judgePost } from './agents/judge.js';
import type { TelegramMessage, MemoryState, MessageIntent, DraftPost, Cover } from './types.js';

// Слова-признаки правки (экономим запрос к Gemini — определяем эвристикой).
const EDIT_HINTS = [
  'короче', 'длиннее', 'подробн', 'добавь', 'убери', 'удали', 'проще', 'сложнее',
  'перепиши', 'переделай', 'измени', 'поменяй', 'замени', 'сократи', 'расширь',
  'дополни', 'смешн', 'серьёзн', 'серьезн', 'больше эмодзи', 'меньше эмодзи',
  'без хэштег', 'хэштег', 'сделай', 'ещё раз', 'еще раз',
];

/**
 * Если у пользователя уже есть пост в памяти, определяем: это правка к нему
 * или новая тема. Короткое сообщение со словом-признаком правки → правка.
 * Без памяти — всегда новая тема.
 */
function classifyIntent(text: string, hasMemory: boolean): MessageIntent {
  if (!hasMemory) return 'new_topic';
  const lower = text.toLowerCase();
  const looksLikeEdit = text.length <= 60 && EDIT_HINTS.some((h) => lower.includes(h));
  return looksLikeEdit ? 'edit' : 'new_topic';
}

/** Собирает финальную подпись: текст поста + кредит фотографу. */
function buildCaption(post: string, cover: Cover | null): string {
  if (!cover) return post;
  return `${post}\n\n📷 Фото: ${cover.photographer} / Pexels`;
}

/** Отправляет пост пользователю: с обложкой, если она есть. */
async function deliver(chatId: number, post: string, cover: Cover | null): Promise<void> {
  const caption = buildCaption(post, cover);
  if (cover && caption.length <= 1024) {
    await sendPhoto(chatId, cover.imageUrl, caption);
  } else if (cover) {
    // Слишком длинно для подписи — шлём фото и текст отдельно.
    await sendPhoto(chatId, cover.imageUrl, `📷 Фото: ${cover.photographer} / Pexels`);
    await sendMessage(chatId, post);
  } else {
    await sendMessage(chatId, post);
  }
}

/** Полная цепочка для новой темы. */
async function handleNewTopic(chatId: number, userId: number, topic: string): Promise<void> {
  // 1. Лимит бесплатных постов (Rate limiting).
  const count = await getPostCount(userId);
  if (count >= FREE_POST_LIMIT) {
    await sendMessage(chatId, LIMIT_MESSAGE);
    return;
  }

  // 2. Модерация темы (Guardrails).
  const verdict = await moderateTopic(topic);
  if (!verdict.allowed) {
    await sendMessage(chatId, `🚫 Не могу написать пост на эту тему.\n${verdict.reason}`);
    return;
  }

  // 3. Ресёрч живым поиском.
  await sendChatAction(chatId, 'typing');
  await sendMessage(chatId, '🔎 Ищу свежие факты по теме…');
  const { facts } = await research(topic);

  // 4. Копирайтер пишет пост.
  await sendChatAction(chatId, 'typing');
  await sendMessage(chatId, '✍️ Пишу пост в стиле канала…');
  let draft: DraftPost = await writePost(topic, facts);

  // 5. Judge проверяет; при провале — один повтор.
  const review = await judgePost(topic, draft.text);
  if (!review.approved) {
    draft = await improvePost(topic, facts, draft.text, review.suggestions);
  }

  // 6. Обложка с Pexels.
  await sendChatAction(chatId, 'upload_photo');
  const cover = await findCover(draft.imageKeywords);

  // 7. Учитываем лимит и сохраняем память для правок.
  await incrementPostCount(userId);
  const memory: MemoryState = {
    topic,
    facts,
    postText: draft.text,
    imageKeywords: draft.imageKeywords,
    cover,
    updatedAt: Date.now(),
  };
  await saveMemory(userId, memory);

  // 8. Отправляем результат.
  await deliver(chatId, draft.text, cover);
}

/** Применение правки к последнему посту (Memory). Лимит не тратится. */
async function handleEdit(chatId: number, userId: number, memory: MemoryState, instruction: string): Promise<void> {
  await sendChatAction(chatId, 'typing');
  await sendMessage(chatId, '🔁 Вношу правку…');

  const draft = await revisePost(memory, instruction);

  // Если ключевые слова заметно изменились — ищем новую обложку, иначе переиспользуем.
  let cover = memory.cover;
  if (draft.imageKeywords && draft.imageKeywords !== memory.imageKeywords) {
    cover = (await findCover(draft.imageKeywords)) ?? memory.cover;
  }

  await saveMemory(userId, {
    ...memory,
    postText: draft.text,
    imageKeywords: draft.imageKeywords,
    cover,
    updatedAt: Date.now(),
  });

  await deliver(chatId, draft.text, cover);
}

/** Точка входа обработки одного сообщения. Вызывается из webhook в фоне. */
export async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = message.text?.trim();

  // Обрабатываем только личку и только текст.
  if (!userId || !text || message.chat.type !== 'private') return;

  if (text === '/start' || text === '/help') {
    await sendMessage(chatId, WELCOME_MESSAGE);
    return;
  }

  try {
    const memory = await getMemory(userId);
    const intent = classifyIntent(text, memory !== null);

    if (intent === 'edit' && memory) {
      await handleEdit(chatId, userId, memory, text);
    } else {
      await handleNewTopic(chatId, userId, text);
    }
  } catch (err) {
    console.error('handleMessage failed:', err);
    await sendMessage(chatId, '😔 Что-то пошло не так при генерации. Попробуй ещё раз чуть позже.');
  }
}
