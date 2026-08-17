// Gemini API wrapper (@google/genai): text, live search and JSON responses.
import { GoogleGenAI, type GenerateContentParameters, type Schema } from '@google/genai';
import { GEMINI_MODEL, requireEnv } from './config.js';

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: requireEnv('GEMINI_API_KEY') });
  }
  return client;
}

// Candidate order: the chosen model first, then current fallbacks.
// Needed because Google disables old models for new keys (404 "no longer available
// to new users"). We remember the first working model and reuse it afterwards.
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

/** Looks like a "model not found / unavailable" error (worth trying another). */
function isModelUnavailable(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string };
  const msg = String(anyErr?.message ?? '');
  return anyErr?.status === 404 || /NOT_FOUND|no longer available|is not found/i.test(msg);
}

/** Temporary model overload (503) — worth retrying / switching models. */
function isOverloaded(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string };
  const msg = String(anyErr?.message ?? '');
  return anyErr?.status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(msg);
}

/** Quota/limit exhausted (429) — shared per project, so switching models won't help. */
function isRateLimited(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string };
  const msg = String(anyErr?.message ?? '');
  return anyErr?.status === 429 || /RESOURCE_EXHAUSTED|exceeded your .*quota/i.test(msg);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Logs a readable reason for a Gemini failure. */
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

// How many times to retry one model on a temporary overload (503).
const OVERLOAD_RETRIES = 2;

/**
 * Calls generateContent robustly:
 * - on temporary overload (503) retries the same model after a short pause;
 * - if a model is unavailable (404) or keeps overloading, tries the next candidate;
 * - real errors (bad key, quota, etc.) are thrown immediately.
 * The first model that works is cached and used directly next time.
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
          console.log(`Gemini: using model "${model}"`);
        }
        return response;
      } catch (err) {
        lastErr = err;
        // Quota exhausted (429) — shared per project, other models won't help: throw.
        if (isRateLimited(err)) {
          logGeminiError(`generate(model=${model})`, err);
          throw err;
        }
        // Temporary overload (503) — wait and retry the same model.
        if (isOverloaded(err) && attempt < OVERLOAD_RETRIES) {
          await sleep(800 * (attempt + 1)); // 0.8s, 1.6s
          continue;
        }
        // Model unavailable (404) or persistently overloaded — try the next one.
        if (isModelUnavailable(err) || isOverloaded(err)) {
          logGeminiError(`generate(model=${model})`, err);
          break;
        }
        throw err; // real error — do not iterate
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
 * Plain text generation. When grounded=true, enables Google Search grounding
 * (live search) and returns the list of sources.
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
 * Strict structured JSON generation against a schema.
 * Used by the moderator and judge (grounding is not needed here).
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
