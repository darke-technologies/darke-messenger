import { useEffect, useSyncExternalStore } from "react";
import type { DmThread } from "./dmSessions";
import {
  hydrateLocalChatTitles,
  localChatTitlesVersion,
  peekLocalChatTitle,
  setLocalChatTitle,
  subscribeLocalChatTitles,
  visibleChatLabel,
} from "./localChatTitles";

/** Client-only chat labels for the signed-in user. Never sent over P2P. */
export function useLocalChat(userId: string) {
  const version = useSyncExternalStore(
    subscribeLocalChatTitles,
    localChatTitlesVersion,
    localChatTitlesVersion,
  );

  useEffect(() => {
    void hydrateLocalChatTitles(userId);
  }, [userId]);

  void version;

  return {
    titleFor(thread: DmThread | null): string {
      if (!thread) return "";
      return visibleChatLabel(userId, thread);
    },
    peek(chatId: string): string | null {
      return peekLocalChatTitle(userId, chatId);
    },
    setTitle(chatId: string, title: string) {
      setLocalChatTitle(userId, chatId, title);
    },
  };
}
