// Общие типы проекта.

/** Входящий апдейт Telegram (нам нужны только личные текстовые сообщения). */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
}

/** Результат работы ресёрчера. */
export interface ResearchResult {
  facts: string;
  sources: string[];
}

/** Готовый пост от копирайтера. */
export interface DraftPost {
  /** Текст поста целиком (хук + тело + призыв + хэштеги). */
  text: string;
  /** Ключевые слова (EN) для поиска обложки. */
  imageKeywords: string;
}

/** Обложка, подобранная на Pexels. */
export interface Cover {
  imageUrl: string;
  photographer: string;
  pexelsUrl: string;
}

/** Вердикт judge о качестве поста. */
export interface JudgeVerdict {
  approved: boolean;
  score: number; // 1..10
  issues: string[];
  suggestions: string;
}

/** Вердикт модератора по входящей теме. */
export interface ModerationVerdict {
  allowed: boolean;
  reason: string;
}

/** Память последнего поста пользователя (для правок). */
export interface MemoryState {
  topic: string;
  facts: string;
  postText: string;
  imageKeywords: string;
  cover: Cover | null;
  updatedAt: number;
}

/** Классификация входящего сообщения. */
export type MessageIntent = 'new_topic' | 'edit';
