// Researcher agent (Research + Tool Calling): live fact-finding via Google Search grounding.
import { generateText } from '../gemini.js';
import type { ResearchResult } from '../types.js';

/**
 * Gathers facts on the topic. Primary mode is Google Search grounding (live search).
 * If search hits a quota/limit (429 etc.) we don't fail — we write facts from the
 * model's own knowledge instead, so a post is still produced.
 */
export async function research(topic: string): Promise<ResearchResult> {
  const prompt = [
    `Find fresh, reliable facts for a fitness channel post on: "${topic}".`,
    'Give 4–7 concrete facts: numbers, recommendations, common myths and how to debunk them.',
    'Write in English, concise, as bullet points. Do not invent studies.',
  ].join('\n');

  try {
    const { text, sources } = await generateText(prompt, { grounded: true, temperature: 0.4 });
    return { facts: text.trim(), sources: sources.slice(0, 5) };
  } catch (err) {
    // Live search unavailable (quota/limit) — fall back to plain generation.
    console.error('research: grounded search failed, falling back to ungrounded:', (err as Error)?.message ?? err);
    const { text } = await generateText(prompt, { grounded: false, temperature: 0.5 });
    return { facts: text.trim(), sources: [] };
  }
}
