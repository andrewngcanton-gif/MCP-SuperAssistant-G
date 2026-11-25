/**
 * Gemini account/usage pages (e.g. /usage, /u/0/usage) are ordinary web pages, not chat
 * documents. The extension still runs there, but the chat sidebar does not belong in that
 * layout, so sidebar lifecycle code needs a single route predicate to consult.
 */

const GEMINI_USAGE_PATH = /^\/(?:u\/\d+\/)?usage\/?$/;

/** True for the Gemini Usage pathname (trailing slash allowed; query/hash are not in pathname). */
export function isGeminiUsagePath(pathname: string): boolean {
  return GEMINI_USAGE_PATH.test(pathname);
}

/** True when the current document is Gemini's Usage page. */
export function isGeminiUsageLocation(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  const { hostname, pathname } = window.location;
  if (hostname !== 'gemini.google.com' && !hostname.endsWith('.gemini.google.com')) return false;
  return isGeminiUsagePath(pathname);
}
