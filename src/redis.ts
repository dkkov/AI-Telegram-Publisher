// Upstash Redis: лимит постов (Rate limiting) и память последнего поста (Memory).
import { Redis } from '@upstash/redis';
import type { MemoryState } from './types.js';

let redis: Redis | null = null;

// Читает UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN из окружения.
function db(): Redis {
  if (!redis) {
    redis = Redis.fromEnv();
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
