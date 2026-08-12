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

/** Похоже ли на ошибку «модель не найдена / недоступна» (стоит пробовать другую). */
function isModelUnavailable(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string };
  const msg = String(anyErr?.message ?? '');
  return anyErr?.status === 404 || /NOT_FOUND|no longer available|is not found/i.test(msg);
}

/** Временная перегрузка/лимит — стоит повторить запрос через паузу. */
function isTransientOverload(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string };
  const msg = String(anyErr?.message ?? '');
  return (
    anyErr?.status === 503 ||
    anyErr?.status === 429 ||
    /UNAVAILABLE|high demand|overloaded|RESOURCE_EXHAUSTED/i.test(msg)
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Сколько раз повторять при временной перегрузке (503/429) одной модели.
const OVERLOAD_RETRIES = 2;

/**
 * Вызывает generateContent надёжно:
 * - при временной перегрузке (503/429) повторяет запрос через короткую паузу;
 * - если модель недоступна (404) или упорно перегружена — пробует следующую из списка;
 * - настоящие ошибки (неверный ключ и т.п.) сразу пробрасывает.
 * Первую сработавшую модель запоминает и дальше ходит сразу в неё.
 */
async function generate(params: Omit<GenerateContentParameters, 'model'>) {
  const ordered = workingModel
    ? [workingModel, ...candidateModels().filter((m) => m !== workingModel)]
    : candidateModels();

  let lastErr: unknown;
  for (const model of ordered) {
    for (let attempt = 0; attempt <= OVERLOAD_RETRIES; attempt++) {
      try {
        const response = await ai().models.generateContent({ model, ...params });
        if (workingModel !== model) {
          workingModel = model;
          console.log(`Gemini: используется модель "${model}"`);
        }
        return response;
      } catch (err) {
        lastErr = err;
        if (isTransientOverload(err) && attempt < OVERLOAD_RETRIES) {
          await sleep(800 * (attempt + 1)); // 0.8s, 1.6s
          continue; // повтор той же модели
        }
        if (isModelUnavailable(err) || isTransientOverload(err)) {
          logGeminiError(`generate(model=${model})`, err);
          break; // переходим к следующей модели
        }
        throw err; // настоящая ошибка — не перебираем
      }
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
