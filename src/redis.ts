// Upstash Redis: post limit (rate limiting) and last-post memory.
import { Redis } from '@upstash/redis';
import type { MemoryState } from './types.js';

let redis: Redis | null = null;

/**
 * Finds the Upstash REST credentials in the environment.
 * Prefers the canonical UPSTASH_REDIS_REST_URL/TOKEN; if absent, matches by name
 * suffix (the Vercel Marketplace creates them with a prefix, e.g.
 * STORAGE_KV_REST_API_URL / KV_REST_API_TOKEN).
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
    'Upstash Redis variables (URL/TOKEN) not found. ' +
      'Make sure the database is connected in Vercel → Storage, then Redeploy.',
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

// Last-post memory lives for 7 days.
const MEMORY_TTL_SECONDS = 7 * 24 * 60 * 60;

/** How many posts the user has generated so far. */
export async function getPostCount(userId: number): Promise<number> {
  const value = await db().get<number>(countKey(userId));
  return value ?? 0;
}

/** Increment the post counter (called only for a NEW topic, not for an edit). */
export async function incrementPostCount(userId: number): Promise<number> {
  return db().incr(countKey(userId));
}

/** Save the user's last post for later edits. */
export async function saveMemory(userId: number, state: MemoryState): Promise<void> {
  await db().set(postKey(userId), JSON.stringify(state), { ex: MEMORY_TTL_SECONDS });
}

/** Get the user's last post (or null). */
export async function getMemory(userId: number): Promise<MemoryState | null> {
  const value = await db().get<MemoryState | string>(postKey(userId));
  if (!value) return null;
  // Upstash may return an already-parsed object or a string — handle both.
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as MemoryState;
    } catch {
      return null;
    }
  }
  return value as MemoryState;
}
