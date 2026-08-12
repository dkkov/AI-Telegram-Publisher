// Агент-модератор (Moderation / Guardrails): проверяет входящую тему до запуска цепочки.
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
 * Пропускаем нормальные темы про фитнес/ЗОЖ/питание/мотивацию и общечеловеческие темы,
 * которые можно раскрыть безопасно. Отклоняем опасное и запретное.
 */
export async function moderateTopic(topic: string): Promise<ModerationVerdict> {
  const prompt = [
    'Оцени тему для поста в фитнес-канал. Верни JSON.',
    'Разреши (allowed=true) обычные, безопасные темы: тренировки, питание, сон,',
    'мотивация, привычки, восстановление, общий образ жизни.',
    'Отклони (allowed=false), если тема про: рецептурные препараты и дозировки,',
    'анаболические стероиды, экстремальные голодания, «лечение» болезней и диагнозы,',
    'опасные челленджи, вред себе, ненависть, откровенный/незаконный контент, спам-бессмыслицу.',
    'В reason коротко (1 предложение, по-русски) объясни решение.',
    '',
    `Тема пользователя: "${topic}"`,
  ].join('\n');

  try {
    return await generateJson<ModerationVerdict>(prompt, schema, { system: CHANNEL_STYLE });
  } catch (err) {
    console.error('moderateTopic failed:', err);
    // При сбое (например, лимит Gemini) не блокируем пользователя — пропускаем тему.
    // Настоящую фильтрацию модерация делает, когда Gemini доступен.
    return { allowed: true, reason: '' };
  }
}
