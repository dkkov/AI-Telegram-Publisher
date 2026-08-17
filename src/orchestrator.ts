// Orchestrator / Router: runs the sub-agent chain and sends status updates to the user.
import { sendMessage, sendPhoto, sendChatAction } from './telegram.js';
import { getPostCount, incrementPostCount, getMemory, saveMemory } from './redis.js';
import { FREE_POST_LIMIT, WELCOME_MESSAGE, LIMIT_MESSAGE } from './config.js';
import { moderateTopic } from './agents/moderator.js';
import { research } from './agents/researcher.js';
import { writePost, improvePost, revisePost } from './agents/copywriter.js';
import { findCover } from './agents/coverArtist.js';
import { judgePost } from './agents/judge.js';
import type { TelegramMessage, MemoryState, MessageIntent, DraftPost, Cover } from './types.js';

// Edit-intent hints (saves a Gemini call — we classify with a simple heuristic).
const EDIT_HINTS = [
  'shorter', 'longer', 'simpler', 'simplify', 'rewrite', 'reword', 'funnier',
  'punchier', 'more emoji', 'fewer emoji', 'less emoji', 'more serious',
  'more detail', 'add an example', 'add example', 'add more', 'make it',
  'expand', 'shorten', 'condense', 'tighten', 'another photo', 'different photo',
  'change the photo', 'without hashtags', 'redo', 'try again', 'again',
];

/**
 * If the user already has a post in memory, decide whether the new message is an
 * edit to it or a brand-new topic. A short message containing an edit hint → edit.
 * Without memory it is always a new topic.
 */
function classifyIntent(text: string, hasMemory: boolean): MessageIntent {
  if (!hasMemory) return 'new_topic';
  const lower = text.toLowerCase();
  const looksLikeEdit = text.length <= 60 && EDIT_HINTS.some((h) => lower.includes(h));
  return looksLikeEdit ? 'edit' : 'new_topic';
}

/** Builds the final caption: post text + photographer credit. */
function buildCaption(post: string, cover: Cover | null): string {
  if (!cover) return post;
  return `${post}\n\n📷 Photo: ${cover.photographer} / Pexels`;
}

/** Delivers the post to the user, with a cover photo when available. */
async function deliver(chatId: number, post: string, cover: Cover | null): Promise<void> {
  const caption = buildCaption(post, cover);
  if (cover && caption.length <= 1024) {
    await sendPhoto(chatId, cover.imageUrl, caption);
  } else if (cover) {
    // Too long for a caption — send the photo and the text separately.
    await sendPhoto(chatId, cover.imageUrl, `📷 Photo: ${cover.photographer} / Pexels`);
    await sendMessage(chatId, post);
  } else {
    await sendMessage(chatId, post);
  }
}

/** Full chain for a new topic. */
async function handleNewTopic(chatId: number, userId: number, topic: string): Promise<void> {
  // 1. Free post limit (rate limiting).
  const count = await getPostCount(userId);
  if (count >= FREE_POST_LIMIT) {
    await sendMessage(chatId, LIMIT_MESSAGE);
    return;
  }

  // 2. Topic moderation (guardrails).
  const verdict = await moderateTopic(topic);
  if (!verdict.allowed) {
    await sendMessage(chatId, `🚫 I can't write a post on this topic.\n${verdict.reason}`);
    return;
  }

  // 3. Research with live search.
  await sendChatAction(chatId, 'typing');
  await sendMessage(chatId, '🔎 Researching fresh facts on your topic…');
  const { facts } = await research(topic);

  // 4. Copywriter writes the post.
  await sendChatAction(chatId, 'typing');
  await sendMessage(chatId, '✍️ Writing the post in the channel style…');
  let draft: DraftPost = await writePost(topic, facts);

  // 5. Judge reviews it; on failure, one retry.
  const review = await judgePost(topic, draft.text);
  if (!review.approved) {
    draft = await improvePost(topic, facts, draft.text, review.suggestions);
  }

  // 6. Cover photo from Pexels.
  await sendChatAction(chatId, 'upload_photo');
  const cover = await findCover(draft.imageKeywords);

  // 7. Count the post against the limit and save memory for future edits.
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

  // 8. Deliver the result.
  await deliver(chatId, draft.text, cover);
}

/** Applies an edit to the last post (Memory). Does not consume the limit. */
async function handleEdit(chatId: number, userId: number, memory: MemoryState, instruction: string): Promise<void> {
  await sendChatAction(chatId, 'typing');
  await sendMessage(chatId, '🔁 Applying your edit…');

  const draft = await revisePost(memory, instruction);

  // If the keywords changed noticeably, fetch a new cover; otherwise reuse it.
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

/** Entry point for handling one message. Called from the webhook in the background. */
export async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = message.text?.trim();

  // Only handle private chats and text messages.
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
    await sendMessage(chatId, '😔 Something went wrong while generating. Please try again in a moment.');
  }
}
