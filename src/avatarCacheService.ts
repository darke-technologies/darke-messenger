import { getInstallId } from "./vault";

const DB_NAME = "darke.avatar-cache";
const STORE = "avatars";
const VERSION = 1;
const KEY_PREFIX = "avatar_";

type CachedAvatar = {
  id: string;
  userId: string;
  hash: string;
  iv: ArrayBuffer;
  cipher: ArrayBuffer;
  mime: string;
  at: number;
};

type LiveAvatar = { hash: string; uri: string };

const live = new Map<string, LiveAvatar>();
const inflight = new Map<string, Promise<string>>();
let cacheKey: CryptoKey | null = null;

function cacheId(userId: string): string {
  return `${KEY_PREFIX}${userId.trim().toLowerCase() || "unknown"}`;
}

function isLocalAsset(url: string): boolean {
  return (
    url.startsWith("/") ||
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("./")
  );
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function wrapKey(): Promise<CryptoKey> {
  if (cacheKey) return cacheKey;
  const install = await getInstallId();
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`darke.avatar-cache:${install}`),
  );
  cacheKey = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return cacheKey;
}

export async function hashAvatarRef(remoteUrl: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(remoteUrl.trim()),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function readRecord(userId: string): Promise<CachedAvatar | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE, "readonly")
      .objectStore(STORE)
      .get(cacheId(userId));
    req.onsuccess = () => resolve((req.result as CachedAvatar | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function writeRecord(row: CachedAvatar): Promise<void> {
  const db = await openCache();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function decryptToUri(row: CachedAvatar): Promise<string> {
  const key = await wrapKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: row.iv },
    key,
    row.cipher,
  );
  const blob = new Blob([plain], { type: row.mime || "image/jpeg" });
  return URL.createObjectURL(blob);
}

function remember(userId: string, hash: string, uri: string): string {
  const id = cacheId(userId);
  const prev = live.get(id);
  if (prev && prev.uri !== uri) URL.revokeObjectURL(prev.uri);
  live.set(id, { hash, uri });
  return uri;
}

/** Sync hit from the in-memory blob map. No disk or network. */
export function peekCachedAvatar(
  userId: string,
  currentHash: string,
): string | null {
  const hit = live.get(cacheId(userId));
  return hit && hit.hash === currentHash ? hit.uri : null;
}

async function downloadAndSaveLocally(
  remoteUrl: string,
  userId: string,
  currentHash: string,
): Promise<string> {
  const res = await fetch(remoteUrl, {
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) throw new Error(`avatar HTTP ${res.status}`);
  const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
  const bytes = new Uint8Array(await res.arrayBuffer());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await wrapKey();
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    bytes,
  );
  await writeRecord({
    id: cacheId(userId),
    userId: userId.trim().toLowerCase(),
    hash: currentHash,
    iv: iv.buffer,
    cipher,
    mime,
    at: Date.now(),
  });
  const uri = URL.createObjectURL(new Blob([bytes], { type: mime }));
  return remember(userId, currentHash, uri);
}

/**
 * Return a local blob URL for this user's avatar.
 * Fetches the remote file only when the hash is new or the cache is empty.
 */
export async function getOrFetchAvatar(
  userId: string,
  remoteUrl: string,
  currentHash?: string | null,
): Promise<string> {
  const url = remoteUrl.trim();
  if (!url) return "";
  if (isLocalAsset(url)) return url;

  const id = userId.trim().toLowerCase() || "unknown";
  const hash = (currentHash || "").trim() || (await hashAvatarRef(url));
  const warm = peekCachedAvatar(id, hash);
  if (warm) return warm;

  const pending = inflight.get(cacheId(id));
  if (pending) return pending;

  const work = (async () => {
    try {
      const cached = await readRecord(id);
      if (cached && cached.hash === hash) {
        return remember(id, hash, await decryptToUri(cached));
      }
      return await downloadAndSaveLocally(url, id, hash);
    } catch {
      return url;
    } finally {
      inflight.delete(cacheId(id));
    }
  })();

  inflight.set(cacheId(id), work);
  return work;
}
