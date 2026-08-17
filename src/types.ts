// Shared project types.

/** Incoming Telegram update (we only need private text messages). */
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

/** Result of the researcher agent. */
export interface ResearchResult {
  facts: string;
  sources: string[];
}

/** A finished post from the copywriter. */
export interface DraftPost {
  /** The full post text (hook + body + CTA + hashtags). */
  text: string;
  /** English keywords for the cover photo search. */
  imageKeywords: string;
}

/** A cover photo picked from Pexels. */
export interface Cover {
  imageUrl: string;
  photographer: string;
  pexelsUrl: string;
}

/** The judge's verdict on post quality. */
export interface JudgeVerdict {
  approved: boolean;
  score: number; // 1..10
  issues: string[];
  suggestions: string;
}

/** The moderator's verdict on the incoming topic. */
export interface ModerationVerdict {
  allowed: boolean;
  reason: string;
}

/** The user's last-post memory (for edits). */
export interface MemoryState {
  topic: string;
  facts: string;
  postText: string;
  imageKeywords: string;
  cover: Cover | null;
  updatedAt: number;
}

/** Classification of an incoming message. */
export type MessageIntent = 'new_topic' | 'edit';
