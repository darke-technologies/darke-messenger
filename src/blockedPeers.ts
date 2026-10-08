import { readLocalText, writeLocalText } from "./localStore";

function key(slug: string): string {
  return `darke.blocked.${slug.trim().toLowerCase() || "session"}`;
}

export function listBlockedPeers(slug: string): string[] {
  const raw = readLocalText(key(slug));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.replace(/^@/, "").trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function isPeerBlocked(slug: string, handle: string): boolean {
  const who = handle.replace(/^@/, "").trim().toLowerCase();
  if (!who) return false;
  return listBlockedPeers(slug).includes(who);
}

export function blockPeer(slug: string, handle: string): void {
  const who = handle.replace(/^@/, "").trim().toLowerCase();
  if (!who) return;
  const next = new Set(listBlockedPeers(slug));
  next.add(who);
  writeLocalText(key(slug), JSON.stringify([...next]));
}
