const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type AccessKeyScope = "workspace" | "channel";

export type AccessKeySeatCap = 1 | 5 | 25 | null;
export type AccessKeyTtl = "24h" | "7d" | "never";

function randomGroup(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function generateAccessKey(scope: AccessKeyScope): string {
  const prefix = scope === "channel" ? "DARKE-CHN" : "DARKE-WKS";
  return `${prefix}-${randomGroup()}-${randomGroup()}-${randomGroup()}`;
}

export function accessKeySnippet(key: string): string {
  const compact = key.trim().toUpperCase();
  if (compact.length <= 16) return compact;
  return `${compact.slice(0, 13)}...`;
}

export function shareAccessKeyBlock(name: string, key: string): string {
  return `Clearance granted for ${name}. Access Key: ${key}`;
}

export function ttlSeconds(ttl: AccessKeyTtl): number | null {
  if (ttl === "24h") return 24 * 60 * 60;
  if (ttl === "7d") return 7 * 24 * 60 * 60;
  return null;
}

export function expiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return "Never";
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return "Never";
  if (at <= Date.now()) return "Expired";
  const hours = Math.round((at - Date.now()) / 3_600_000);
  if (hours < 48) return `${Math.max(1, hours)}h left`;
  const days = Math.round(hours / 24);
  return `${days}d left`;
}

export function claimedLabel(useCount: number, maxUses: number | null): string {
  if (maxUses == null) return `${useCount} / Unlimited claimed`;
  return `${useCount} / ${maxUses} claimed`;
}
