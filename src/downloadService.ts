import type { DmThread } from "./dmSessions";
import { visibleChatLabel } from "./localChatTitles";

export type DownloadItem = {
  id: string;
  fileName: string;
  size: number;
  at: number;
  senderHandle: string;
  chatId: string;
  chatTitle: string;
  fileUrl?: string;
};

export function listReceivedDownloads(
  userId: string,
  threads: DmThread[],
): DownloadItem[] {
  const rows: DownloadItem[] = [];
  for (const thread of threads) {
    for (const msg of thread.messages) {
      if (msg.direction !== "received" || !msg.fileName) continue;
      rows.push({
        id: `${thread.id}:${msg.id}`,
        fileName: msg.fileName,
        size: msg.fileSize ?? 0,
        at: msg.at,
        senderHandle: thread.peerUsername || thread.handle,
        chatId: thread.id,
        chatTitle: visibleChatLabel(userId, thread),
        fileUrl: msg.fileUrl,
      });
    }
  }
  return rows.sort((a, b) => b.at - a.at);
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function openDownloadedFile(item: DownloadItem): void {
  if (!item.fileUrl || typeof window === "undefined") return;
  window.open(item.fileUrl, "_blank", "noopener,noreferrer");
}

export function saveDownloadedFile(item: DownloadItem): void {
  if (!item.fileUrl || typeof document === "undefined") return;
  const link = document.createElement("a");
  link.href = item.fileUrl;
  link.download = item.fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
