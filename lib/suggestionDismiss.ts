/**
 * Suggestions the family dismissed: "not now" (hidden on one list) and
 * "never" (hidden for good). Kept in this device's storage; losing it only
 * brings a suggestion back.
 */
import { normalizeName } from './suggestions';

const neverKey = (userId: string) => `suggest-never:${userId}`;
const listKey = (listId: string) => `suggest-skip:${listId}`;

function read(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Set();
  }
}

function write(key: string, values: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(values)));
  } catch { /* storage unavailable: dismissal lasts until reload */ }
}

/** Normalized names hidden on this list (never + not now). */
export function getDismissed(userId: string, listId: string | null): Set<string> {
  const out = read(neverKey(userId));
  if (listId) for (const n of read(listKey(listId))) out.add(n);
  return out;
}

export function dismissForList(listId: string, name: string) {
  const s = read(listKey(listId));
  s.add(normalizeName(name));
  write(listKey(listId), s);
}

export function dismissForever(userId: string, name: string) {
  const s = read(neverKey(userId));
  s.add(normalizeName(name));
  write(neverKey(userId), s);
}
