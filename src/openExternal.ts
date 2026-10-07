import { looksLikeUrl, normalizeAddress } from "./url";

/** Open an http(s) link in a new browser tab. */
export async function openExternalUrl(raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (!trimmed) return;
  const target = looksLikeUrl(trimmed) ? normalizeAddress(trimmed) : trimmed;
  if (!/^https?:\/\//i.test(target)) return;
  window.open(target, "_blank", "noopener,noreferrer");
}
