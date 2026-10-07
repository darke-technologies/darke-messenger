/** True when input should be treated as a website URL, not a search query. */
export function looksLikeUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return true;
  if (/\s/.test(t)) return false;
  if (t === "localhost" || t.startsWith("localhost:") || t.startsWith("127.0.0.1")) {
    return true;
  }
  if (t.includes(".")) return true;
  return false;
}

/** Normalize a website field to an http(s) URL, or empty if it is not a URL. */
export function normalizeAddress(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || !looksLikeUrl(trimmed)) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
