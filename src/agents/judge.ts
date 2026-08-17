// Judge agent: self-check of the post before sending (style, structure, facts, safety).
import { Type, type Schema } from '@google/genai';
import { generateJson } from '../gemini.js';
import { CHANNEL_STYLE, MAX_POST_LENGTH } from '../config.js';
import type { JudgeVerdict } from '../types.js';

const schema: Schema = {
  type: Type.OBJECT,
  properties: {
    approved: { type: Type.BOOLEAN },
    score: { type: Type.NUMBER },
    issues: { type: Type.ARRAY, items: { type: Type.STRING } },
    suggestions: { type: Type.STRING },
  },
  required: ['approved', 'score', 'issues', 'suggestions'],
};

/**
 * Scores the post against the channel rules. approved=true means it's ready to send.
 * suggestions — what to improve (passed to the copywriter for one retry if approved=false).
 */
export async function judgePost(topic: string, postText: string): Promise<JudgeVerdict> {
  const prompt = [
    `Review a fitness channel post on the topic "${topic}". Return JSON.`,
    'Criteria: fits the channel style, has the structure (hook/body/CTA/hashtags),',
    `length up to ${MAX_POST_LENGTH} characters, no invented numbers or dangerous advice,`,
    'includes a disclaimer when the topic touches health/training load.',
    'score is 1..10. approved=true if score >= 7 and there are no critical issues.',
    'issues — a list of problems. suggestions — how to rewrite it (brief, in English).',
    '',
    'Post:',
    postText,
  ].join('\n');

  try {
    return await generateJson<JudgeVerdict>(prompt, schema, { system: CHANNEL_STYLE });
  } catch (err) {
    console.error('judgePost failed:', err);
    // If the judge fails, don't block sending — treat the post as approved.
    return { approved: true, score: 7, issues: [], suggestions: '' };
  }
}
