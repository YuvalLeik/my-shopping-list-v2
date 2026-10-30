/**
 * Best-effort per-key daily cap for the AI routes. In memory, so it resets
 * when a serverless instance is recycled; it only has to stop runaway loops
 * and abuse from running up the Gemini bill, not count exactly.
 */
const counters = new Map<string, { day: string; count: number }>();

export function allowRequest(key: string, maxPerDay: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const c = counters.get(key);
  if (!c || c.day !== day) {
    counters.set(key, { day, count: 1 });
    return true;
  }
  if (c.count >= maxPerDay) return false;
  c.count++;
  return true;
}

/** Caller identity for rate limiting: the user id when given, else the client IP. */
export function rateKey(request: Request, userId?: unknown): string {
  if (typeof userId === 'string' && userId) return `u:${userId}`;
  return `ip:${request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'}`;
}
