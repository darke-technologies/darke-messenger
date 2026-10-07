const GROUP = 4;
const GROUPS = 4;

export const DARKE_ID_PATTERN = /^DARKE-\d{4}-\d{4}-\d{4}-\d{4}$/;

export function generateDarkeId(): string {
  const raw = new Uint32Array(GROUPS);
  crypto.getRandomValues(raw);
  const parts = Array.from(raw, (n) => String(n % 10000).padStart(GROUP, "0"));
  return `DARKE-${parts.join("-")}`;
}

export function parseDarkeId(raw: string): string | null {
  const compact = raw.trim().toUpperCase().replace(/[\s_]/g, "");
  const digits = compact.replace(/^DARKE-/, "").replace(/-/g, "");
  if (!/^\d{16}$/.test(digits)) return null;
  return `DARKE-${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}`;
}

export function darkeIdAuthLocal(id: string): string {
  return id.trim().toLowerCase();
}

export function formatDarkeIdInput(raw: string): string {
  if (!raw.trim()) return "";
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  if (!digits) {
    const letters = raw.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 5);
    if ("DARKE".startsWith(letters)) {
      return letters.length < 5 ? letters : "DARKE-";
    }
    return "";
  }
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4));
  }
  return `DARKE-${parts.join("-")}`;
}

export const ACCESS_DENIED =
  "[ACCESS DENIED] Invalid username or password.";

export const ACCESS_DENIED_FORMAT =
  "[ACCESS DENIED] DARKE entry requires a username.";

