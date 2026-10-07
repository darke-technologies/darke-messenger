const INSTALL_KEY = "darke.installId";

function newInstallId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stable per-browser id in localStorage. Created once; never rotates. */
export async function getInstallId(): Promise<string> {
  try {
    const existing = window.localStorage.getItem(INSTALL_KEY)?.trim();
    if (existing) return existing;
    const id = newInstallId();
    window.localStorage.setItem(INSTALL_KEY, id);
    return id;
  } catch {
    return newInstallId();
  }
}
