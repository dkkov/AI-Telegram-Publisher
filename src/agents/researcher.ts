// Агент-ресёрчер (Research + Tool Calling): живой поиск фактов через Google Search grounding.
import { generateText } from '../gemini.js';
import type { ResearchResult } from '../types.js';

/**
 * Собирает свежие, проверяемые факты по теме с помощью Google Search grounding.
 * Возвращает компактную выжимку фактов и список источников.
 */
export async function research(topic: string): Promise<ResearchResult> {
  const prompt = [
    `Найди свежие и достоверные факты по теме для поста в фитнес-канал: "${topic}".`,
    'Используй актуальные данные из поиска. Дай 4–7 конкретных фактов:',
    'цифры, рекомендации, распространённые мифы и их опровержения.',
    'Пиши по-русски, кратко, по пунктам. Не выдумывай исследования — опирайся на найденное.',
  ].join('\n');

  const { text, sources } = await generateText(prompt, {
    grounded: true,
    temperature: 0.4,
  });

  return {
    facts: text.trim(),
    sources: sources.slice(0, 5),
  };
}
