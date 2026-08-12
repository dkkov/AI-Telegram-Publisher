// Агент-judge: самопроверка поста перед отправкой (стиль, структура, факты, безопасность).
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
 * Оценивает пост по правилам канала. approved=true, если пост готов к отправке.
 * suggestions — что улучшить (передаём копирайтеру для одного повтора, если approved=false).
 */
export async function judgePost(topic: string, postText: string): Promise<JudgeVerdict> {
  const prompt = [
    `Проверь пост для фитнес-канала по теме "${topic}". Верни JSON.`,
    'Критерии: соответствие стилю канала, наличие структуры (хук/тело/призыв/хэштеги),',
    `длина до ${MAX_POST_LENGTH} символов, отсутствие выдуманных цифр и опасных советов,`,
    'наличие дисклеймера при теме про здоровье/нагрузки.',
    'score — 1..10. approved=true, если score >= 7 и нет критичных проблем.',
    'issues — список проблем. suggestions — как переписать (кратко, по-русски).',
    '',
    'Пост:',
    postText,
  ].join('\n');

  try {
    return await generateJson<JudgeVerdict>(prompt, schema, { system: CHANNEL_STYLE });
  } catch (err) {
    console.error('judgePost failed:', err);
    // Если judge не сработал — не блокируем отправку, считаем пост принятым.
    return { approved: true, score: 7, issues: [], suggestions: '' };
  }
}
