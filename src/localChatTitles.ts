import type { DmThread } from "./dmSessions";
import { isLegacyChatLabel } from "./chatService";
import { resolveChatTitle } from "./getChatTitle";
import { getInstallId } from "./vault";

const DB_NAME = "darke.chat-titles";
const STORE = "titles";
const VERSION = 1;
const KEY_PREFIX = "user_chat_titles";

type TitleRow = {
  id: string;
  userId: string;
  chatId: string;
  iv: ArrayBuffer;
  cipher: ArrayBuffer;
};

const memory = new Map<string, Map<string, string>>();
const listeners = new Set<() => void>();
const hydrated = new Set<string>();
let version = 0;
let wrap: CryptoKey | null = null;

function normUser(userId: string): string {
  return userId.replace(/^@/, "").trim().toLowerCase() || "session";
}

function recordId(userId: string, chatId: string): string {
  return `${KEY_PREFIX}:${normUser(userId)}:${chatId}`;
}

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeLocalChatTitles(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function localChatTitlesVersion(): number {
  return version;
}

function userMap(userId: string): Map<string, string> {
  const key = normUser(userId);
  let map = memory.get(key);
  if (!map) {
    map = new Map();
    memory.set(key, map);
  }
  return map;
}

export function peekLocalChatTitle(
  userId: string,
  chatId: string,
): string | null {
  const title = userMap(userId).get(chatId)?.trim();
  return title || null;
}

export function visibleChatLabel(userId: string, thread: DmThread): string {
  return resolveChatTitle(thread, userId, peekLocalChatTitle(userId, thread.id));
}

async function wrapKey(): Promise<CryptoKey> {
  if (wrap) return wrap;
  const install = await getInstallId();
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`darke.chat-titles:${install}`),
  );
  wrap = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return wrap;
}

function openTitles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function decryptTitle(row: TitleRow): Promise<string | null> {
  try {
    const key = await wrapKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: row.iv },
      key,
      row.cipher,
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as {
      title?: unknown;
    };
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    return title || null;
  } catch {
    return null;
  }
}

async function persistTitle(
  userId: string,
  chatId: string,
  title: string,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openTitles();
  const id = recordId(userId, chatId);
  if (!title) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await wrapKey();
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify({ title })),
  );
  const row: TitleRow = {
    id,
    userId: normUser(userId),
    chatId,
    iv: iv.buffer,
    cipher,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function setLocalChatTitle(
  userId: string,
  chatId: string,
  title: string,
): void {
  const next = title.trim();
  const map = userMap(userId);
  if (next) map.set(chatId, next);
  else map.delete(chatId);
  emit();
  void persistTitle(userId, chatId, next);
}

export async function hydrateLocalChatTitles(userId: string): Promise<void> {
  const uid = normUser(userId);
  if (hydrated.has(uid) || typeof indexedDB === "undefined") return;
  hydrated.add(uid);
  try {
    const db = await openTitles();
    const prefix = `${KEY_PREFIX}:${uid}:`;
    const rows = await new Promise<TitleRow[]>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as TitleRow[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    const map = userMap(uid);
    for (const row of rows) {
      if (!row?.id?.startsWith(prefix)) continue;
      const title = await decryptTitle(row);
      if (title) map.set(row.chatId, title);
    }
    emit();
  } catch {
    hydrated.delete(uid);
  }
}

/** Move legacy thread.displayName aliases into the local encrypted title store. */
export function adoptLegacyThreadTitles(
  userId: string,
  threads: DmThread[],
): DmThread[] {
  return threads.map((thread) => {
    if (!thread.renamed) return thread;
    const custom = thread.displayName?.trim() ?? "";
    if (!custom || isLegacyChatLabel(custom)) {
      return { ...thread, renamed: false, displayName: "", autoNamed: true };
    }
    if (!peekLocalChatTitle(userId, thread.id)) {
      setLocalChatTitle(userId, thread.id, custom);
    }
    return { ...thread, renamed: false, displayName: "", autoNamed: true };
  });
}
