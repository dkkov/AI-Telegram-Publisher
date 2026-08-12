// Агент-ресёрчер (Research + Tool Calling): живой поиск фактов через Google Search grounding.
import { generateText } from '../gemini.js';
import type { ResearchResult } from '../types.js';

/**
 * Собирает факты по теме. Основной режим — Google Search grounding (живой поиск).
 * Если поиск упирается в лимит/недоступен (429 и т.п.) — не падаем, а пишем факты
 * по знаниям модели без live-поиска, чтобы пост всё равно сгенерировался.
 */
export async function research(topic: string): Promise<ResearchResult> {
  const prompt = [
    `Найди свежие и достоверные факты по теме для поста в фитнес-канал: "${topic}".`,
    'Дай 4–7 конкретных фактов: цифры, рекомендации, распространённые мифы и их опровержения.',
    'Пиши по-русски, кратко, по пунктам. Не выдумывай исследования.',
  ].join('\n');

  try {
    const { text, sources } = await generateText(prompt, { grounded: true, temperature: 0.4 });
    return { facts: text.trim(), sources: sources.slice(0, 5) };
  } catch (err) {
    // Живой поиск недоступен (лимит/квота) — откатываемся к обычной генерации.
    console.error('research: grounded поиск не сработал, откат без grounding:', (err as Error)?.message ?? err);
    const { text } = await generateText(prompt, { grounded: false, temperature: 0.5 });
    return { facts: text.trim(), sources: [] };
  }
}
