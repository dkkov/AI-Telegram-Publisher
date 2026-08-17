// Moderator agent (Moderation / Guardrails): checks the incoming topic before the chain runs.
import { Type, type Schema } from '@google/genai';
import { generateJson } from '../gemini.js';
import { CHANNEL_STYLE } from '../config.js';
import type { ModerationVerdict } from '../types.js';

const schema: Schema = {
  type: Type.OBJECT,
  properties: {
    allowed: { type: Type.BOOLEAN },
    reason: { type: Type.STRING },
  },
  required: ['allowed', 'reason'],
};

/**
 * Allows normal fitness/wellness/nutrition/motivation topics and general topics
 * that can be covered safely. Rejects dangerous and forbidden ones.
 */
export async function moderateTopic(topic: string): Promise<ModerationVerdict> {
  const prompt = [
    'Evaluate a topic for a fitness channel post. Return JSON.',
    'Allow (allowed=true) normal, safe topics: workouts, nutrition, sleep,',
    'motivation, habits, recovery, general lifestyle.',
    'Reject (allowed=false) if the topic is about: prescription drugs and dosages,',
    'anabolic steroids, extreme fasting, diagnosing or "curing" diseases,',
    'dangerous challenges, self-harm, hate, explicit/illegal content, or spam nonsense.',
    'In "reason", briefly explain the decision in one English sentence.',
    '',
    `User topic: "${topic}"`,
  ].join('\n');

  try {
    return await generateJson<ModerationVerdict>(prompt, schema, { system: CHANNEL_STYLE });
  } catch (err) {
    console.error('moderateTopic failed:', err);
    // On failure (e.g. Gemini quota) do not block the user — let the topic through.
    // Real filtering happens whenever Gemini is available.
    return { allowed: true, reason: '' };
  }
}
