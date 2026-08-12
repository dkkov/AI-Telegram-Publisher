// Агент-художник обложки: подбирает готовое фото на Pexels по ключевым словам (без генерации).
import { requireEnv } from '../config.js';
import type { Cover } from '../types.js';

interface PexelsPhoto {
  photographer: string;
  url: string;
  src: { large?: string; large2x?: string; original?: string };
}

interface PexelsSearchResponse {
  photos?: PexelsPhoto[];
}

/**
 * Ищет landscape-фото по ключевым словам. Из результатов берёт случайное фото
 * из первых нескольких, чтобы обложки не повторялись. Возвращает null, если ничего нет.
 */
export async function findCover(keywords: string): Promise<Cover | null> {
  const query = keywords.trim() || 'fitness workout';
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '10');
  url.searchParams.set('orientation', 'landscape');

  try {
    const res = await fetch(url, {
      headers: { Authorization: requireEnv('PEXELS_API_KEY') },
    });
    if (!res.ok) {
      console.error(`Pexels search failed: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as PexelsSearchResponse;
    const photos = data.photos ?? [];
    if (photos.length === 0) return null;

    const pick = photos[Math.floor(Math.random() * Math.min(photos.length, 5))];
    const imageUrl = pick.src.large2x || pick.src.large || pick.src.original;
    if (!imageUrl) return null;

    return {
      imageUrl,
      photographer: pick.photographer,
      pexelsUrl: pick.url,
    };
  } catch (err) {
    console.error('findCover failed:', err);
    return null;
  }
}
