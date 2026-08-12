// Агент-копирайтер (Copywriter): пишет пост по фактам в стиле канала и применяет правки.
import { Type, type Schema } from '@google/genai';
import { generateJson } from '../gemini.js';
import { CHANNEL_STYLE, MAX_POST_LENGTH } from '../config.js';
import type { DraftPost, MemoryState } from '../types.js';

const schema: Schema = {
  type: Type.OBJECT,
  properties: {
    text: {
      type: Type.STRING,
      description: 'Готовый пост: хук, тело, призыв и 3–5 хэштегов. Обычный текст, без markdown-заголовков.',
    },
    imageKeywords: {
      type: Type.STRING,
      description: 'Короткий запрос на английском (2–4 слова) для поиска фото обложки на фотостоке.',
    },
  },
  required: ['text', 'imageKeywords'],
};

/** Написать новый пост по теме и собранным фактам. */
export async function writePost(topic: string, facts: string): Promise<DraftPost> {
  const prompt = [
    `Тема поста: "${topic}".`,
    '',
    'Факты из ресёрча (опирайся на них, не выдумывай):',
    facts,
    '',
    `Напиши пост для Telegram (до ${MAX_POST_LENGTH} символов) строго по правилам стиля канала.`,
    'Структура: цепляющий хук → тело с пользой → призыв к действию → 3–5 хэштегов.',
    'Также предложи imageKeywords — короткий запрос на английском для фото обложки по теме.',
    'Верни JSON.',
  ].join('\n');

  return generateJson<DraftPost>(prompt, schema, { system: CHANNEL_STYLE, temperature: 0.9 });
}

/** Доработать пост по замечаниям judge (один повтор внутри цепочки). */
export async function improvePost(
  topic: string,
  facts: string,
  postText: string,
  suggestions: string,
): Promise<DraftPost> {
  const prompt = [
    `Тема поста: "${topic}".`,
    '',
    'Факты из ресёрча:',
    facts,
    '',
    'Черновик поста:',
    postText,
    '',
    `Замечания рецензента: ${suggestions}`,
    `Исправь пост с учётом замечаний, сохрани стиль канала и лимит ${MAX_POST_LENGTH} символов.`,
    'Обнови imageKeywords при необходимости. Верни JSON.',
  ].join('\n');

  return generateJson<DraftPost>(prompt, schema, { system: CHANNEL_STYLE, temperature: 0.85 });
}

/** Переписать последний пост по инструкции-правке пользователя (Memory + итерация). */
export async function revisePost(memory: MemoryState, instruction: string): Promise<DraftPost> {
  const prompt = [
    `Тема: "${memory.topic}".`,
    '',
    'Текущий пост:',
    memory.postText,
    '',
    'Факты из ресёрча (можно использовать):',
    memory.facts,
    '',
    `Правка от пользователя: "${instruction}".`,
    `Перепиши пост с учётом правки, сохрани стиль канала и лимит ${MAX_POST_LENGTH} символов.`,
    'Обнови imageKeywords, только если правка меняет тему картинки; иначе оставь прежний смысл.',
    'Верни JSON.',
  ].join('\n');

  return generateJson<DraftPost>(prompt, schema, { system: CHANNEL_STYLE, temperature: 0.85 });
}
