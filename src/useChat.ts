import { useEffect, useRef, useState } from "react";
import { isChatOwner } from "./chatService";
import { useDm } from "./DmContext";
import { useLocalChat } from "./useLocalChat";
import { CHAT_SETTINGS_EVENT } from "./dmSessions";

export type ChatTab = "messages" | "members" | "settings";

export function useChat() {
  const dm = useDm();
  const [tab, setTab] = useState<ChatTab>("messages");
  const local = useLocalChat(dm.slug);
  const pendingSettings = useRef<string | null>(null);

  useEffect(() => {
    function onOpen(event: Event) {
      const id = (event as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (!id) return;
      pendingSettings.current = id;
      if (dm.activeId === id) setTab("settings");
    }
    window.addEventListener(CHAT_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(CHAT_SETTINGS_EVENT, onOpen);
  }, [dm.activeId]);

  useEffect(() => {
    if (pendingSettings.current && pendingSettings.current === dm.activeId) {
      pendingSettings.current = null;
      setTab("settings");
      return;
    }
    setTab("messages");
  }, [dm.activeId]);

  const canInvite = isChatOwner(dm.active, dm.slug);

  return {
    ...dm,
    tab,
    setTab,
    title: local.titleFor(dm.active),
    isAdmin: canInvite,
    canInvite,
  };
}
