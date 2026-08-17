// Copywriter agent: writes the post from facts in the channel style and applies edits.
import { Type, type Schema } from '@google/genai';
import { generateJson } from '../gemini.js';
import { CHANNEL_STYLE, MAX_POST_LENGTH } from '../config.js';
import type { DraftPost, MemoryState } from '../types.js';

const schema: Schema = {
  type: Type.OBJECT,
  properties: {
    text: {
      type: Type.STRING,
      description: 'The finished post: hook, body, call to action and 3–5 hashtags. Plain text, no markdown headings.',
    },
    imageKeywords: {
      type: Type.STRING,
      description: 'A short English query (2–4 words) to search for a cover photo on a stock service.',
    },
  },
  required: ['text', 'imageKeywords'],
};

/** Write a new post from the topic and gathered facts. */
export async function writePost(topic: string, facts: string): Promise<DraftPost> {
  const prompt = [
    `Post topic: "${topic}".`,
    '',
    'Research facts (rely on these, do not invent):',
    facts,
    '',
    `Write a Telegram post (up to ${MAX_POST_LENGTH} characters) strictly following the channel style rules.`,
    'Structure: catchy hook → body with value → call to action → 3–5 hashtags.',
    'Also propose imageKeywords — a short English query for a cover photo on the topic.',
    'Return JSON.',
  ].join('\n');

  return generateJson<DraftPost>(prompt, schema, { system: CHANNEL_STYLE, temperature: 0.9 });
}

/** Improve the post based on the judge's notes (one retry inside the chain). */
export async function improvePost(
  topic: string,
  facts: string,
  postText: string,
  suggestions: string,
): Promise<DraftPost> {
  const prompt = [
    `Post topic: "${topic}".`,
    '',
    'Research facts:',
    facts,
    '',
    'Draft post:',
    postText,
    '',
    `Reviewer notes: ${suggestions}`,
    `Fix the post per the notes, keep the channel style and the ${MAX_POST_LENGTH}-character limit.`,
    'Update imageKeywords if needed. Return JSON.',
  ].join('\n');

  return generateJson<DraftPost>(prompt, schema, { system: CHANNEL_STYLE, temperature: 0.85 });
}

/** Rewrite the last post per the user's edit instruction (Memory + iteration). */
export async function revisePost(memory: MemoryState, instruction: string): Promise<DraftPost> {
  const prompt = [
    `Topic: "${memory.topic}".`,
    '',
    'Current post:',
    memory.postText,
    '',
    'Research facts (you may use them):',
    memory.facts,
    '',
    `User edit: "${instruction}".`,
    `Rewrite the post per the edit, keep the channel style and the ${MAX_POST_LENGTH}-character limit.`,
    'Only update imageKeywords if the edit changes the image subject; otherwise keep it.',
    'Return JSON.',
  ].join('\n');

  return generateJson<DraftPost>(prompt, schema, { system: CHANNEL_STYLE, temperature: 0.85 });
}
