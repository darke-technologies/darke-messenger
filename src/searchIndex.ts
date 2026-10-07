import type { DmThread } from "./dmSessions";
import { visibleChatLabel } from "./localChatTitles";

const DB_NAME = "darke.chat-index";
const STORE = "messages";
const VERSION = 1;

export type IndexedChatHit = {
  id: string;
  chatId: string;
  messageId: string;
  title: string;
  body: string;
  at: number;
};

function openIndex(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("chatId", "chatId", { unique: false });
        store.createIndex("at", "at", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function syncChatIndex(
  slug: string,
  threads: DmThread[],
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const prefix = `${slug.trim().toLowerCase()}:`;
  try {
    const db = await openIndex();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        if (String(cursor.key).startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
    });
    for (const thread of threads) {
      const title = visibleChatLabel(slug, thread);
      store.put({
        id: `${prefix}${thread.id}:title`,
        chatId: thread.id,
        messageId: "",
        title,
        body: title,
        at: thread.createdAt,
      } satisfies IndexedChatHit);
      for (const msg of thread.messages) {
        const body = (msg.fileName || msg.body || "").trim();
        if (!body) continue;
        store.put({
          id: `${prefix}${thread.id}:${msg.id}`,
          chatId: thread.id,
          messageId: msg.id,
          title,
          body,
          at: msg.at,
        } satisfies IndexedChatHit);
      }
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* local search still works from in-memory threads */
  }
}

export async function queryChatIndex(
  slug: string,
  needle: string,
): Promise<IndexedChatHit[]> {
  const q = needle.trim().toLowerCase();
  if (!q || typeof indexedDB === "undefined") return [];
  try {
    const db = await openIndex();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const prefix = `${slug.trim().toLowerCase()}:`;
    const hits: IndexedChatHit[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        const row = cursor.value as IndexedChatHit;
        if (
          String(cursor.key).startsWith(prefix) &&
          (`${row.title} ${row.body}`.toLowerCase().includes(q))
        ) {
          hits.push(row);
        }
        cursor.continue();
      };
    });
    db.close();
    return hits.sort((a, b) => b.at - a.at).slice(0, 40);
  } catch {
    return [];
  }
}

export function searchThreadsLocal(
  slug: string,
  threads: DmThread[],
  needle: string,
): IndexedChatHit[] {
  const q = needle.trim().toLowerCase();
  if (!q) return [];
  const hits: IndexedChatHit[] = [];
  for (const thread of threads) {
    const title = visibleChatLabel(slug, thread);
    if (title.toLowerCase().includes(q)) {
      hits.push({
        id: `${thread.id}:title`,
        chatId: thread.id,
        messageId: "",
        title,
        body: title,
        at: thread.createdAt,
      });
    }
    for (const msg of thread.messages) {
      const body = (msg.fileName || msg.body || "").trim();
      if (!body.toLowerCase().includes(q)) continue;
      hits.push({
        id: `${thread.id}:${msg.id}`,
        chatId: thread.id,
        messageId: msg.id,
        title,
        body,
        at: msg.at,
      });
    }
  }
  return hits.sort((a, b) => b.at - a.at).slice(0, 40);
}

export function highlightMatch(text: string, needle: string): string[] {
  const q = needle.trim();
  if (!q) return [text];
  const parts: string[] = [];
  const lower = text.toLowerCase();
  const find = q.toLowerCase();
  let from = 0;
  while (from < text.length) {
    const at = lower.indexOf(find, from);
    if (at < 0) {
      parts.push(text.slice(from));
      break;
    }
    if (at > from) parts.push(text.slice(from, at));
    parts.push(text.slice(at, at + q.length));
    from = at + q.length;
  }
  return parts;
}
