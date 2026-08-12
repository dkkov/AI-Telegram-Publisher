// Обёртка над Gemini API (@google/genai): текст, живой поиск и JSON-ответы.
import { GoogleGenAI, type GenerateContentParameters, type Schema } from '@google/genai';
import { GEMINI_MODEL, requireEnv } from './config.js';

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: requireEnv('GEMINI_API_KEY') });
  }
  return client;
}

// Порядок кандидатов: сначала выбранная модель, затем актуальные запасные.
// Нужен, потому что Google отключает старые модели для новых ключей (ошибка 404
// «no longer available to new users»). Первую рабочую запоминаем и дальше юзаем её.
const FALLBACK_MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-lite-latest',
];

function candidateModels(): string[] {
  return [...new Set([GEMINI_MODEL, ...FALLBACK_MODELS])];
}

let workingModel: string | null = null;

/** Похоже ли на ошибку «модель не найдена / недоступна» (можно пробовать другую). */
function isModelUnavailable(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string };
  const msg = String(anyErr?.message ?? '');
  return anyErr?.status === 404 || /NOT_FOUND|no longer available|is not found/i.test(msg);
}

/** Печатает в лог понятную причину сбоя Gemini. */
function logGeminiError(where: string, err: unknown): void {
  const anyErr = err as { status?: number; message?: string };
  let details = typeof anyErr?.message === 'string' ? anyErr.message : '';
  if (!details) {
    try {
      details = JSON.stringify(err);
    } catch {
      details = String(err);
    }
  }
  console.error(`Gemini error in ${where} | status=${anyErr?.status ?? '?'} | ${details.replace(/\s+/g, ' ')}`);
}

/**
 * Вызывает generateContent, перебирая модели-кандидаты, пока одна не сработает.
 * Настоящие ошибки (неверный ключ, лимит) не перебираем — сразу пробрасываем.
 */
async function generate(params: Omit<GenerateContentParameters, 'model'>) {
  const models = workingModel ? [workingModel] : candidateModels();
  let lastErr: unknown;
  for (const model of models) {
    try {
      const response = await ai().models.generateContent({ model, ...params });
      if (workingModel !== model) {
        workingModel = model;
        console.log(`Gemini: используется модель "${model}"`);
      }
      return response;
    } catch (err) {
      lastErr = err;
      if (!isModelUnavailable(err)) throw err;
      logGeminiError(`generate(model=${model})`, err);
      // модель недоступна — пробуем следующую
    }
  }
  throw lastErr;
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
  const response = await generate({
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
  const response = await generate({
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
