// Upstash Redis: лимит постов (Rate limiting) и память последнего поста (Memory).
import { Redis } from '@upstash/redis';
import type { MemoryState } from './types.js';

let redis: Redis | null = null;

/**
 * Ищет REST-креды Upstash в переменных окружения.
 * Сначала пробует канонические UPSTASH_REDIS_REST_URL/TOKEN, а если их нет —
 * находит по суффиксу имени (Vercel Marketplace создаёт их с префиксом,
 * например STORAGE_KV_REST_API_URL / KV_REST_API_TOKEN).
 */
function resolveRedisCreds(): { url: string; token: string } {
  const env = process.env;
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN };
  }

  const entries = Object.entries(env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
  );
  const findBySuffix = (suffixes: string[], exclude: string[] = []): string | undefined =>
    entries.find(
      ([key]) =>
        suffixes.some((s) => key.toUpperCase().endsWith(s)) &&
        !exclude.some((e) => key.toUpperCase().includes(e)),
    )?.[1];

  const url = findBySuffix(['REST_API_URL', 'REST_URL']);
  const token = findBySuffix(['REST_API_TOKEN', 'REST_TOKEN'], ['READ_ONLY']);
  if (url && token) return { url, token };

  throw new Error(
    'Не найдены переменные Upstash Redis (URL/TOKEN). ' +
      'Проверь, что база подключена в Vercel → Storage, и сделай Redeploy.',
  );
}

function db(): Redis {
  if (!redis) {
    redis = new Redis(resolveRedisCreds());
  }
  return redis;
}

const countKey = (userId: number) => `count:${userId}`;
const postKey = (userId: number) => `post:${userId}`;

// Память последнего поста живёт 7 дней.
const MEMORY_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Сколько постов пользователь уже сгенерировал. */
export async function getPostCount(userId: number): Promise<number> {
  const value = await db().get<number>(countKey(userId));
  return value ?? 0;
}

/** Увеличить счётчик постов (вызывается только для НОВОЙ темы, не для правки). */
export async function incrementPostCount(userId: number): Promise<number> {
  return db().incr(countKey(userId));
}

/** Сохранить последний пост пользователя для последующих правок. */
export async function saveMemory(userId: number, state: MemoryState): Promise<void> {
  await db().set(postKey(userId), JSON.stringify(state), { ex: MEMORY_TTL_SECONDS });
}

/** Достать последний пост пользователя (или null). */
export async function getMemory(userId: number): Promise<MemoryState | null> {
  const value = await db().get<MemoryState | string>(postKey(userId));
  if (!value) return null;
  // Upstash может вернуть уже распарсенный объект или строку — обрабатываем оба случая.
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as MemoryState;
    } catch {
      return null;
    }
  }
  return value as MemoryState;
}
