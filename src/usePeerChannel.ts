import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PeerConnectionState } from "./dmSessions";
import {
  encodeChat,
  encodeTyping,
  isTypingFrame,
  parseP2pFrame,
  type TypingFrame,
  type TypingKind,
} from "./p2pProtocol";

/**
 * Local stand-in for a WebRTC DataChannel.
 * sendMessage / onMessage / connectionState match the payload surface
 * a DataChannel will use once signaling is wired.
 *
 * Typing frames are ephemeral JSON events. They are never written to
 * chat history or Supabase.
 */
export type PeerChannel = {
  connectionState: PeerConnectionState;
  sendMessage: (payload: string, replyToMessageId?: string) => void;
  sendTyping: (kind: TypingKind, handle: string) => void;
  onMessage: (
    handler: (payload: string, replyToMessageId?: string) => void,
  ) => () => void;
  onTyping: (handler: (frame: TypingFrame) => void) => () => void;
  ingestRemote: (raw: string) => void;
};

export function usePeerChannel(
  sessionKey: string | null,
  peerState: PeerConnectionState,
  peerUsername?: string | null,
): PeerChannel {
  const [connectionState, setConnectionState] =
    useState<PeerConnectionState>(peerState);
  const connectedRef = useRef(peerState === "CONNECTED");
  const messageHandlers = useRef(
    new Set<(payload: string, replyToMessageId?: string) => void>(),
  );
  const typingHandlers = useRef(new Set<(frame: TypingFrame) => void>());
  void peerUsername;

  useEffect(() => {
    setConnectionState(peerState);
    connectedRef.current = peerState === "CONNECTED";
  }, [peerState, sessionKey]);

  const transmit = useCallback(
    (payload: string) => {
      if (!sessionKey || !payload || !connectedRef.current) return;
      // DataChannel.send(payload) lands here.
      void payload;
    },
    [sessionKey],
  );

  const ingestRemote = useCallback((raw: string) => {
    const frame = parseP2pFrame(raw);
    if (isTypingFrame(frame)) {
      typingHandlers.current.forEach((handler) => handler(frame));
      return;
    }
    const body = frame?.type === "MESSAGE" ? frame.body : raw;
    if (!body) return;
    const reply =
      frame?.type === "MESSAGE" ? frame.reply_to_message_id : undefined;
    messageHandlers.current.forEach((handler) => handler(body, reply));
  }, []);

  const sendMessage = useCallback(
    (payload: string, replyToMessageId?: string) => {
      if (!payload) return;
      transmit(encodeChat(payload, replyToMessageId));
    },
    [transmit],
  );

  const sendTyping = useCallback(
    (kind: TypingKind, handle: string) => {
      const who = handle.trim();
      if (!who) return;
      transmit(encodeTyping(kind, who));
    },
    [transmit],
  );

  const onMessage = useCallback(
    (handler: (payload: string, replyToMessageId?: string) => void) => {
      messageHandlers.current.add(handler);
      return () => {
        messageHandlers.current.delete(handler);
      };
    },
    [],
  );

  const onTyping = useCallback((handler: (frame: TypingFrame) => void) => {
    typingHandlers.current.add(handler);
    return () => {
      typingHandlers.current.delete(handler);
    };
  }, []);

  return useMemo(
    () => ({
      connectionState,
      sendMessage,
      sendTyping,
      onMessage,
      onTyping,
      ingestRemote,
    }),
    [
      connectionState,
      sendMessage,
      sendTyping,
      onMessage,
      onTyping,
      ingestRemote,
    ],
  );
}
