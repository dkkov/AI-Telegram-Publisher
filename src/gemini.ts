// Обёртка над Gemini API (@google/genai): текст, живой поиск и JSON-ответы.
import { GoogleGenAI, type Schema } from '@google/genai';
import { GEMINI_MODEL, requireEnv } from './config.js';

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: requireEnv('GEMINI_API_KEY') });
  }
  return client;
}

export interface GroundedText {
  text: string;
  sources: string[];
}

/**
 * Обычная генерация текста. Если grounded=true — включаем Google Search grounding
 * (живой поиск) и возвращаем список источников.
 */
export async function generateText(
  prompt: string,
  opts: { system?: string; grounded?: boolean; temperature?: number } = {},
): Promise<GroundedText> {
  const response = await ai().models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: opts.system,
      temperature: opts.temperature ?? 0.8,
      ...(opts.grounded ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });

  const text = response.text ?? '';
  const sources: string[] = [];
  if (opts.grounded) {
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    for (const chunk of chunks) {
      const uri = chunk.web?.uri;
      const title = chunk.web?.title;
      if (uri) sources.push(title ? `${title} — ${uri}` : uri);
    }
  }
  return { text, sources };
}

/**
 * Генерация строго структурированного JSON по схеме.
 * Используется модератором и judge (grounding здесь не нужен).
 */
export async function generateJson<T>(
  prompt: string,
  schema: Schema,
  opts: { system?: string; temperature?: number } = {},
): Promise<T> {
  const response = await ai().models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: opts.system,
      temperature: opts.temperature ?? 0.2,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });
  const raw = response.text ?? '{}';
  return JSON.parse(raw) as T;
}
