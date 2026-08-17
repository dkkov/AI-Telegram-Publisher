// Bot "knowledge base" — the channel voice and style rules.
// This is a fitness channel style: edit CHANNEL_STYLE to fit your niche.

/** Reads an environment variable; throws a clear error if it is missing. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

/** Optional environment variable with a fallback default. */
export function optionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

/** Free post limit per user. */
export const FREE_POST_LIMIT = Number(optionalEnv('FREE_POST_LIMIT', '2'));

/** Maximum post length in characters. */
export const MAX_POST_LENGTH = 900;

/** Gemini model. Strips any leading "models/" prefix and whitespace. */
export const GEMINI_MODEL = optionalEnv('GEMINI_MODEL', 'gemini-flash-latest')
  .trim()
  .replace(/^models\//i, '');

/**
 * Fitness channel style rules. Passed to the agents as a system prompt.
 * 5–10 concrete points: tone, length, emojis, format, forbidden topics.
 */
export const CHANNEL_STYLE = `
You are the editor of a fitness and healthy-lifestyle Telegram channel.
Channel voice: energetic and motivating, yet friendly and down-to-earth — no snobbery, no pressure.
Style rules:
1. Upbeat, supportive tone: address the reader as "you" and cheer them on.
2. Be practical and useful: concrete tips, numbers, examples.
3. Post length up to ${MAX_POST_LENGTH} characters. Short paragraphs of 1–3 sentences.
4. Emojis in moderation, 3–6 that fit the meaning (💪🔥🥗🏃‍♀️🧘). Not on every line.
5. Strict structure: catchy HOOK → BODY with value → CALL TO ACTION → 3–5 HASHTAGS.
6. Hashtags in English, on topic, at the end, space-separated (#fitness #nutrition ...).
7. Rely on the research facts; do not invent studies or numbers.
8. Always add a soft disclaimer when the topic touches health or training load:
   remind the reader to consult a professional if they have any health concerns.
9. Write everything in English.
Forbidden topics (do not write, politely decline): prescription drugs and dosages,
anabolic steroids, extreme fasting, diagnosing or "curing" diseases,
dangerous challenges. This is not medical advice.
`.trim();

/** Greeting sent on /start. */
export const WELCOME_MESSAGE = [
  "💪 Hi! I'm your fitness channel bot.",
  '',
  "Send me a topic and I'll research fresh facts and write a ready-to-post caption with a cover photo.",
  '',
  'For example: "how to start running from scratch", "how much protein per day", "warm-up before a workout".',
  '',
  'I also take edits: after a post, reply "shorter", "add an example", or "make it simpler" — and I\'ll rewrite it.',
].join('\n');

/** Message shown when the free limit is reached. */
export const LIMIT_MESSAGE = [
  "🙌 You've used all your free posts.",
  '',
  `You get ${FREE_POST_LIMIT} free posts per user.`,
  'To keep going, a subscription will be required — coming soon 🙂',
].join('\n');
